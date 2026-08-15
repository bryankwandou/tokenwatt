/**
 * Replay the committed daily files into Neon.
 *
 * The collector spends about twenty minutes re-reading every agent log; this
 * reads the JSON it already wrote and upserts it, which takes seconds. It is
 * the repair for the one failure the nightly run cannot avoid — the database
 * being unreachable at the moment the reading was taken. The files are the
 * source of truth in that situation, so replaying them is lossless.
 *
 *   node scripts/sync-db.mjs            # every day on disk
 *   node scripts/sync-db.mjs --since 7  # only the last seven
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ensureSchema, hasDatabase, upsertDays, retrying } from '../lib/db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAILY = path.join(ROOT, 'data', 'daily');

// Same reader the collector uses: the scheduled task runs with a bare
// environment, so the connection string comes from the file.
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

if (!hasDatabase()) {
  console.error('DATABASE_URL is not set — nothing to sync to.');
  process.exit(1);
}

const sinceIdx = process.argv.indexOf('--since');
const since = sinceIdx >= 0 ? Number(process.argv[sinceIdx + 1]) : null;

let days = fs
  .readdirSync(DAILY)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(DAILY, f), 'utf8')));

if (Number.isFinite(since) && since > 0) days = days.slice(-since);

if (days.length === 0) {
  console.log('No daily files found.');
  process.exit(0);
}

const t0 = Date.now();
try {
  await retrying('neon schema', () => ensureSchema());
  const n = await upsertDays(days, os.hostname());
  console.log(
    `Synced ${n} days (${days[0].date} … ${days[n - 1].date}), ` +
      `${days.reduce((a, d) => a + d.total, 0).toLocaleString()} tokens, ` +
      `$${days.reduce((a, d) => a + d.usd, 0).toFixed(2)} (${Date.now() - t0}ms)`,
  );
} catch (e) {
  // A stack trace helps nobody reading collector.log at breakfast; the files
  // are untouched, so the only thing to report is that the database refused.
  // Setting the code rather than calling process.exit lets the driver's
  // in-flight socket close on its own; forcing it down mid-request makes libuv
  // abort, which reports as a crash instead of a clean failure.
  console.error(`Sync failed after retries — ${e.message}`);
  process.exitCode = 1;
}
