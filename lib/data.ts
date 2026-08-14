import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error — plain ES module shared with the Node collector.
import pricing from './pricing.mjs';
// @ts-expect-error — plain ES module shared with the Node collector.
import { ensureSchema, fetchDays, hasDatabase, lastUpdated } from './db.mjs';

export const PRICING = pricing as Pricing;

export type Tokens = {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  reasoning: number;
};

export type Leaf = { tokens: Tokens; total: number; usd: number; requests: number };

export type ProviderDay = Leaf & {
  models: Record<string, Leaf>;
  projects: Record<string, Leaf>;
};

export type Day = {
  date: string;
  total: number;
  tokens: Tokens;
  usd: number;
  requests: number;
  providers: Record<string, ProviderDay>;
  generatedAt: string;
};

export type IndexEntry = {
  date: string;
  total: number;
  usd: number;
  requests: number;
  byProvider: Record<string, { total: number; usd: number }>;
};

type Pricing = {
  updated: string;
  providers: Record<string, { label: string; short: string; auto: boolean }>;
  models: Record<string, { label: string; input: number; output: number }>;
  quotaWindows: Record<string, { label: string; resetHours: number }>;
  defaults: Record<string, number>;
};

const DATA = path.join(process.cwd(), 'data');

export function loadIndex(): { generatedAt: string; host: string; days: IndexEntry[] } {
  const file = path.join(DATA, 'index.json');
  if (!fs.existsSync(file)) return { generatedAt: '', host: '', days: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function loadDays(): Day[] {
  const dir = path.join(DATA, 'daily');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Day);
}

export type Source = {
  days: Day[];
  index: IndexEntry[];
  generatedAt: string;
  host: string;
  origin: 'neon' | 'files' | 'empty';
  note?: string;
};

/** Derive the calendar index from full day records. */
function toIndex(days: Day[]): IndexEntry[] {
  return days.map((d) => ({
    date: d.date,
    total: d.total,
    usd: d.usd,
    requests: d.requests,
    byProvider: Object.fromEntries(
      Object.entries(d.providers ?? {}).map(([k, v]) => [k, { total: v.total, usd: v.usd }]),
    ),
  }));
}

/**
 * Read the live copy from Neon, falling back to the committed JSON files when
 * the database is unreachable or empty. The page renders either way — a
 * database outage degrades the reading's freshness, not the page.
 */
export async function loadSource(): Promise<Source> {
  if (hasDatabase()) {
    try {
      await ensureSchema();
      const days = (await fetchDays()) as Day[];
      if (days.length) {
        const meta = await lastUpdated();
        return {
          days,
          index: toIndex(days),
          generatedAt: meta.at || days[days.length - 1].generatedAt,
          host: meta.host,
          origin: 'neon',
        };
      }
    } catch (e) {
      const files = loadDays();
      return {
        days: files,
        index: loadIndex().days,
        generatedAt: loadIndex().generatedAt,
        host: loadIndex().host,
        origin: 'files',
        note: `database unavailable: ${(e as Error).message}`,
      };
    }
  }

  const files = loadDays();
  const idx = loadIndex();
  return {
    days: files,
    index: idx.days,
    generatedAt: idx.generatedAt,
    host: idx.host,
    origin: files.length ? 'files' : 'empty',
  };
}

export function providerLabel(id: string) {
  return PRICING.providers[id]?.label ?? id;
}

export function modelLabel(id: string) {
  return PRICING.models[id]?.label ?? id;
}

/** Accent colour per provider, so a provider reads the same everywhere. */
export function providerColor(id: string) {
  switch (id) {
    case 'claude-code':
      return '#e08a5b';
    case 'codex-cli':
      return '#3ecf9a';
    case 'antigravity':
      return '#8b7cf6';
    case 'copilot':
      return '#5ba8e0';
    default:
      return '#8a8a86';
  }
}

// ------------------------------------------------------------------ formatting

export function fmtTokens(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}

export function fmtFull(n: number) {
  return n.toLocaleString('en-US');
}

export function fmtUsd(n: number, opts: { compact?: boolean } = {}) {
  if (opts.compact && n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (n === 0) return '$0';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// --------------------------------------------------------------- aggregations

export function emptyTokens(): Tokens {
  return { input: 0, output: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, reasoning: 0 };
}

export function sumTokens(into: Tokens, from: Tokens) {
  for (const k of Object.keys(into) as (keyof Tokens)[]) into[k] += from[k] ?? 0;
  return into;
}

export type Totals = {
  tokens: Tokens;
  total: number;
  usd: number;
  requests: number;
  byProvider: Record<string, { total: number; usd: number; requests: number }>;
  byModel: Record<string, { total: number; usd: number; requests: number; provider: string }>;
  byProject: Record<string, { total: number; usd: number; requests: number }>;
};

export function rollup(days: Day[]): Totals {
  const t: Totals = {
    tokens: emptyTokens(),
    total: 0,
    usd: 0,
    requests: 0,
    byProvider: {},
    byModel: {},
    byProject: {},
  };
  for (const day of days) {
    sumTokens(t.tokens, day.tokens);
    t.total += day.total;
    t.usd += day.usd;
    t.requests += day.requests;
    for (const [pid, p] of Object.entries(day.providers)) {
      const bp = (t.byProvider[pid] ??= { total: 0, usd: 0, requests: 0 });
      bp.total += p.total;
      bp.usd += p.usd;
      bp.requests += p.requests;
      for (const [mid, m] of Object.entries(p.models)) {
        const bm = (t.byModel[mid] ??= { total: 0, usd: 0, requests: 0, provider: pid });
        bm.total += m.total;
        bm.usd += m.usd;
        bm.requests += m.requests;
      }
      for (const [jid, j] of Object.entries(p.projects ?? {})) {
        const bj = (t.byProject[jid] ??= { total: 0, usd: 0, requests: 0 });
        bj.total += j.total;
        bj.usd += j.usd;
        bj.requests += j.requests;
      }
    }
  }
  return t;
}

/**
 * Usage inside each provider's rolling subscription window, counted back from
 * the most recent day that has data. This is the "how much of my plan have I
 * burned" view, as opposed to the API-rate view.
 */
export function quotaUsage(days: Day[]) {
  if (!days.length) return [];
  const latest = new Date(`${days[days.length - 1].date}T23:59:59Z`).getTime();
  return Object.entries(PRICING.quotaWindows).map(([pid, w]) => {
    const from = latest - w.resetHours * 3600_000;
    let total = 0;
    let usd = 0;
    for (const d of days) {
      if (new Date(`${d.date}T12:00:00Z`).getTime() < from) continue;
      const p = d.providers[pid];
      if (!p) continue;
      total += p.total;
      usd += p.usd;
    }
    return { provider: pid, label: w.label, hours: w.resetHours, total, usd };
  });
}
