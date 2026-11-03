#!/usr/bin/env node
/**
 * TokenWatt collector.
 *
 * Reads agent CLI logs on this machine, aggregates them into one JSON file per
 * calendar day, and writes them into ../data/daily. Safe to run repeatedly:
 * every run rebuilds the affected days from scratch, so a re-run never
 * double-counts.
 *
 * When DATABASE_URL is set the same aggregates are also upserted into Neon,
 * which is what the live dashboard reads. The JSON files stay as the versioned
 * backup, so the data survives losing either one.
 *
 * Usage:
 *   node collector/collect.mjs              # aggregate, write files, sync Neon
 *   node collector/collect.mjs --push       # ...then commit and push to git
 *   node collector/collect.mjs --since 30   # only rebuild the last 30 days
 *   node collector/collect.mjs --no-db      # skip the Neon sync
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { costOf, totalTokens, emptyTokens, addTokens, keepLargerReading } from '../lib/cost.mjs';
import { ensureSchema, hasDatabase, upsertDays, retrying } from '../lib/db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const DAILY = path.join(DATA, 'daily');
const HOME = os.homedir();
const CLAUDE_CACHE = path.join(ROOT, '.cache', 'claude');
const PUSH_EVERY_MS = 6 * 3600_000;

/**
 * Read .env.local into process.env without adding a dependency. The scheduled
 * task runs with a bare environment, so the connection string has to come from
 * the file rather than from whatever the scheduler inherits.
 */
function loadEnvFile() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}
loadEnvFile();

const args = process.argv.slice(2);
const PUSH = args.includes('--push');
const NO_DB = args.includes('--no-db');
const sinceIdx = args.indexOf('--since');
const SINCE_DAYS = sinceIdx >= 0 ? Number(args[sinceIdx + 1]) : null;

/** Local calendar date (YYYY-MM-DD) for an ISO timestamp. */
function localDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Write beside the target, then rename. A restart mid-write leaves the old file
 * whole, where a plain write would leave half a JSON document for every later
 * run to choke on.
 */
function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function walk(dir, match, out = [], depth = 0) {
  if (depth > 10) return out;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, match, out, depth + 1);
    else if (match(p)) out.push(p);
  }
  return out;
}

async function eachLine(file, fn) {
  const rl = readline.createInterface({
    input: fs.createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line || line[0] !== '{') continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    fn(obj);
  }
  rl.close();
}

// days[date] = { date, providers: {p: {tokens, usd, models:{}, projects:{}, requests}} }
const days = new Map();

function bucket(date, provider, model, project) {
  if (!days.has(date)) days.set(date, { date, providers: {} });
  const day = days.get(date);
  if (!day.providers[provider]) {
    day.providers[provider] = { tokens: emptyTokens(), usd: 0, requests: 0, models: {}, projects: {} };
  }
  const p = day.providers[provider];
  if (!p.models[model]) p.models[model] = { tokens: emptyTokens(), usd: 0, requests: 0 };
  if (project && !p.projects[project]) p.projects[project] = { tokens: emptyTokens(), usd: 0, requests: 0 };
  return { p, m: p.models[model], j: project ? p.projects[project] : null };
}

function record(date, provider, model, project, tokens) {
  const { usd } = costOf(model, tokens);
  const { p, m, j } = bucket(date, provider, model, project);
  for (const node of [p, m, ...(j ? [j] : [])]) {
    addTokens(node.tokens, tokens);
    node.usd += usd;
    node.requests += 1;
  }
}

// ---------------------------------------------------------------- Claude Code

/** Decode Claude's flattened project-dir name back into something readable. */
function claudeProject(file) {
  const rel = path.relative(path.join(HOME, '.claude', 'projects'), file);
  const dir = rel.split(path.sep)[0] || 'unknown';
  return dir.replace(/^-+/, '').replace(/-/g, '/');
}

/**
 * Parse one log into compact rows and save them straight away, so a run killed
 * by a restart resumes where it stopped. The saved rows also outlive the log
 * when Claude Code prunes it.
 */
async function cacheClaudeLog(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return;
  }
  const name = createHash('sha1').update(file).digest('hex');
  const target = path.join(CLAUDE_CACHE, `${name}.json`);
  const cached = readJson(target);
  if (cached?.mtimeMs === stat.mtimeMs && cached?.size === stat.size) return;

  const project = claudeProject(file);
  const rows = [];
  await eachLine(file, (o) => {
    const u = o?.message?.usage;
    if (!u || o.type !== 'assistant') return;
    const date = localDate(o.timestamp);
    if (!date) return;
    const cc = u.cache_creation || {};
    let w1h = cc.ephemeral_1h_input_tokens || 0;
    let w5m = cc.ephemeral_5m_input_tokens || 0;
    // Older entries only carry the flat total; bill those at the 5m rate.
    if (w1h + w5m === 0) w5m = u.cache_creation_input_tokens || 0;
    rows.push([
      o.requestId || o?.message?.id || null,
      date,
      o.message.model || 'unknown',
      project,
      u.input_tokens || 0,
      u.output_tokens || 0,
      w1h,
      w5m,
      u.cache_read_input_tokens || 0,
    ]);
  });
  writeAtomic(target, JSON.stringify({ file, mtimeMs: stat.mtimeMs, size: stat.size, rows }));
}

async function collectClaude() {
  const base = path.join(HOME, '.claude', 'projects');
  fs.mkdirSync(CLAUDE_CACHE, { recursive: true });
  for (const file of walk(base, (p) => p.endsWith('.jsonl'))) await cacheClaudeLog(file);

  // requestId repeats when a session is resumed or forked — count each once.
  const seen = new Set();
  let n = 0;
  for (const entry of fs.readdirSync(CLAUDE_CACHE)) {
    if (!entry.endsWith('.json')) continue;
    const rows = readJson(path.join(CLAUDE_CACHE, entry))?.rows || [];
    for (const [key, date, model, project, input, output, w1h, w5m, cacheRead] of rows) {
      if (key) {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      record(date, 'claude-code', model, project, {
        input,
        output,
        cacheWrite1h: w1h,
        cacheWrite5m: w5m,
        cacheRead,
        reasoning: 0,
      });
      n++;
    }
  }
  return n;
}

// ----------------------------------------------------------------- Codex CLI

/**
 * Codex writes cumulative `total_token_usage` per session, so the last event in
 * a session file is the session total. We attribute the whole session to the
 * date of its final event.
 */
async function collectCodex() {
  const base = path.join(HOME, '.codex', 'sessions');
  if (!fs.existsSync(base)) return 0;
  const files = walk(base, (p) => p.endsWith('.jsonl'));
  let n = 0;

  for (const file of files) {
    let last = null;
    let lastTs = null;
    let model = null;
    await eachLine(file, (o) => {
      const pl = o?.payload;
      if (!pl) return;
      if (pl.type === 'turn_context' && pl.model) model = pl.model;
      if (pl.type === 'token_count' && pl.info?.total_token_usage) {
        last = pl.info.total_token_usage;
        lastTs = o.timestamp;
      }
    });
    if (!last || !lastTs) continue;
    const date = localDate(lastTs);
    if (!date) continue;
    const cachedIn = last.cached_input_tokens || 0;
    record(date, 'codex-cli', model || 'gpt-5.3-codex', null, {
      // `input_tokens` is inclusive of the cached portion; split them so the
      // cheaper cached rate is applied to the cached share.
      input: Math.max(0, (last.input_tokens || 0) - cachedIn),
      output: last.output_tokens || 0,
      cacheWrite5m: last.cache_write_input_tokens || 0,
      cacheRead: cachedIn,
      reasoning: last.reasoning_output_tokens || 0,
    });
    n++;
  }
  return n;
}

// ------------------------------------------------------------- Antigravity CLI

/** Every varint in a protobuf message, nested messages included. */
function protoNumbers(buf, out = [], depth = 0) {
  let i = 0;
  const varint = () => {
    let v = 0;
    let shift = 0;
    let b;
    do {
      b = buf[i++];
      v += (b & 127) * 2 ** shift;
      shift += 7;
    } while (b & 128 && i < buf.length);
    return v;
  };
  while (i < buf.length) {
    const tag = varint();
    const wire = tag % 8;
    const field = Math.floor(tag / 8);
    if (field < 1 || field > 4096) return false;
    if (wire === 0) out.push(varint());
    else if (wire === 2) {
      const len = varint();
      if (i + len > buf.length) return false;
      const nested = [];
      if (depth < 8 && len > 0 && protoNumbers(buf.subarray(i, i + len), nested, depth + 1)) {
        out.push(...nested);
      }
      i += len;
    } else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else return false;
  }
  return true;
}

/**
 * The transcript has the tokens and the conversation's SQLite file has the
 * model, with no shared step number. Each generation's metadata repeats the
 * same token counts, so those counts are the join.
 */
function antigravityGenerations(base, id, DatabaseSync) {
  const file = path.join(base, 'conversations', `${id}.db`);
  if (!DatabaseSync || !fs.existsSync(file)) return [];
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return db.prepare('select data from gen_metadata').all().map((row) => {
      const buf = Buffer.from(row.data);
      const numbers = [];
      protoNumbers(buf, numbers);
      const model = buf.toString('latin1').match(/(?:gemini|gpt)-[0-9][a-z0-9.-]+|claude-[a-z]+-[0-9][a-z0-9.-]*/);
      return { numbers: new Set(numbers), model: model ? model[0] : null };
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function collectAntigravity() {
  const base = path.join(HOME, '.gemini', 'antigravity-cli');
  const brain = path.join(base, 'brain');
  if (!fs.existsSync(brain)) return 0;
  const { DatabaseSync } = await import('node:sqlite').catch(() => ({}));
  let n = 0;

  for (const id of fs.readdirSync(brain)) {
    const logs = path.join(brain, id, '.system_generated', 'logs');
    // transcript.jsonl, transcript_full.jsonl and their chunks repeat each step.
    const steps = new Map();
    for (const file of walk(logs, (p) => p.endsWith('.jsonl'))) {
      await eachLine(file, (o) => {
        if ('input_tokens' in o) steps.set(o.step_index, o);
      });
    }
    if (!steps.size) continue;
    const generations = antigravityGenerations(base, id, DatabaseSync);
    for (const o of steps.values()) {
      const date = localDate(o.created_at);
      if (!date) continue;
      const input = o.input_tokens || 0;
      const output = o.output_tokens || 0;
      const cacheRead = o.cache_read_tokens || 0;
      const gen = generations.find(
        ({ numbers }) => numbers.has(input) && numbers.has(output) && (!cacheRead || numbers.has(cacheRead)),
      );
      record(date, 'antigravity', gen?.model || 'unknown', null, {
        input,
        output,
        cacheRead,
        reasoning: 0,
      });
      n++;
    }
  }
  return n;
}

// ------------------------------------------------------------------- manual

/** Entries the dashboard's /api/ingest route or a human appended by hand. */
function collectManual() {
  const file = path.join(DATA, 'manual.json');
  if (!fs.existsSync(file)) return 0;
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    console.warn('  manual.json is not valid JSON — skipped');
    return 0;
  }
  if (!Array.isArray(entries)) return 0;
  for (const e of entries) {
    if (!e?.date || !e?.provider) continue;
    record(e.date, e.provider, e.model || 'unknown', e.project || null, {
      input: e.input || 0,
      output: e.output || 0,
      cacheWrite5m: e.cacheWrite || 0,
      cacheRead: e.cacheRead || 0,
      reasoning: e.reasoning || 0,
    });
  }
  return entries.length;
}

// --------------------------------------------------------------------- write

function finalize() {
  const cutoff = SINCE_DAYS ? Date.now() - SINCE_DAYS * 86400_000 : null;
  const payloads = [];

  fs.mkdirSync(DAILY, { recursive: true });

  for (const [date, day] of [...days.entries()].sort()) {
    if (cutoff && new Date(date).getTime() < cutoff) continue;

    let dayTokens = emptyTokens();
    let dayUsd = 0;
    let dayRequests = 0;
    for (const p of Object.values(day.providers)) {
      addTokens(dayTokens, p.tokens);
      dayUsd += p.usd;
      dayRequests += p.requests;
      p.total = totalTokens(p.tokens);
      p.usd = round(p.usd);
      for (const m of Object.values(p.models)) {
        m.total = totalTokens(m.tokens);
        m.usd = round(m.usd);
      }
      for (const j of Object.values(p.projects)) {
        j.total = totalTokens(j.tokens);
        j.usd = round(j.usd);
      }
    }

    const file = path.join(DAILY, `${date}.json`);
    const previous = readJson(file);
    const payload = keepLargerReading(
      {
        date,
        total: totalTokens(dayTokens),
        tokens: dayTokens,
        usd: round(dayUsd),
        requests: dayRequests,
        providers: day.providers,
        generatedAt: new Date().toISOString(),
      },
      previous,
    );

    writeAtomic(file, JSON.stringify(payload, null, 1));
    payloads.push(payload);
  }

  // Built from the files, not this run's logs: a day whose logs are gone is
  // still part of the record.
  const index = fs
    .readdirSync(DAILY)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const d = JSON.parse(fs.readFileSync(path.join(DAILY, f), 'utf8'));
      return {
        date: d.date,
        total: d.total,
        usd: d.usd,
        requests: d.requests,
        byProvider: Object.fromEntries(
          Object.entries(d.providers).map(([k, v]) => [k, { total: v.total, usd: v.usd }]),
        ),
      };
    });

  writeAtomic(
    path.join(DATA, 'index.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        host: os.hostname(),
        days: index,
      },
      null,
      1,
    ),
  );
  return { index, payloads };
}

function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

function push() {
  // The task runs unattended. A credential helper that decides to ask for a
  // password would otherwise block the whole run until the scheduler's two-hour
  // limit kills it, so prompting is disabled outright and the push is given a
  // deadline. A refused push is recoverable — the commit stays local and the
  // next run carries it — but a wedged process is not.
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
  };
  const opts = { cwd: ROOT, env, timeout: 600_000, killSignal: 'SIGKILL' };
  const run = (...a) => execFileSync('git', a, { ...opts, stdio: 'inherit' });
  try {
    // The task now runs hourly; Neon gets every run, the backup does not need to.
    const lastPush = Number(execFileSync('git', ['log', '-1', '--format=%ct', 'origin/main', '--', 'data'], opts).toString().trim());
    if (Date.now() - lastPush * 1000 < PUSH_EVERY_MS) {
      console.log('  git         : pushed recently, skipped');
      return;
    }
    // A restart during a commit leaves this behind and every later commit fails.
    const lock = path.join(ROOT, '.git', 'index.lock');
    if (fs.existsSync(lock) && Date.now() - fs.statSync(lock).mtimeMs > 15 * 60_000) fs.rmSync(lock);
    run('add', 'data');
    const changed = execFileSync('git', ['status', '--porcelain', 'data'], opts).toString().trim();
    if (!changed) {
      console.log('No data changes to push.');
      return;
    }
    run('commit', '-m', `data: usage through ${new Date().toISOString().slice(0, 10)}`);
    run('push');
    console.log('  git         : pushed');
  } catch (e) {
    // The commit is already made, so the history is safe on disk either way.
    console.error(`  git         : push failed — ${e.message}`);
    process.exitCode = 1;
  }
}

const t0 = Date.now();
console.log('TokenWatt collector');
const claude = await collectClaude();
console.log(`  claude-code : ${claude} priced requests`);
const codex = await collectCodex();
console.log(`  codex-cli   : ${codex} sessions`);
const antigravity = await collectAntigravity();
console.log(`  antigravity : ${antigravity} requests`);
const manual = collectManual();
console.log(`  manual      : ${manual} entries`);
const { index, payloads } = finalize();
const grand = index.reduce((a, d) => a + d.usd, 0);
console.log(
  `  wrote ${index.length} days, ${index.reduce((a, d) => a + d.total, 0).toLocaleString()} tokens, $${grand.toFixed(2)} est. (${Date.now() - t0}ms)`,
);

if (!NO_DB && hasDatabase()) {
  try {
    await retrying('neon schema', () => ensureSchema());
    const n = await upsertDays(payloads, os.hostname());
    console.log(`  neon        : synced ${n} days`);
  } catch (e) {
    // A database hiccup must not lose the run — the JSON files are already
    // written, so `npm run sync:db` replaces the rows in seconds without
    // re-reading a single log file.
    console.error(`  neon        : sync failed — ${e.message}`);
    console.error('  neon        : run `npm run sync:db` to replay the written files');
    process.exitCode = 1;
  }
} else if (!NO_DB) {
  console.log('  neon        : skipped (DATABASE_URL not set)');
}

if (PUSH) push();
