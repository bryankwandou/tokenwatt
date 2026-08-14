/**
 * Neon Postgres storage.
 *
 * One row per calendar day. The daily JSON files in ../data remain the
 * versioned backup — this table is the live copy the dashboard reads, so new
 * readings appear without a redeploy and survive a lost working directory.
 *
 * Shared by the Node collector and the Next app; both import it the same way.
 */

import { neon } from '@neondatabase/serverless';

export function connectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    ''
  );
}

export function hasDatabase() {
  return connectionString().length > 0;
}

let client = null;
export function sql() {
  if (!client) {
    const url = connectionString();
    if (!url) throw new Error('DATABASE_URL is not set');
    client = neon(url);
  }
  return client;
}

/** Idempotent — safe to call on every collector run and every cold start. */
export async function ensureSchema() {
  const q = sql();
  await q`
    CREATE TABLE IF NOT EXISTS usage_day (
      date          date PRIMARY KEY,
      total_tokens  bigint      NOT NULL DEFAULT 0,
      usd           numeric(14,6) NOT NULL DEFAULT 0,
      requests      integer     NOT NULL DEFAULT 0,
      tokens        jsonb       NOT NULL DEFAULT '{}'::jsonb,
      providers     jsonb       NOT NULL DEFAULT '{}'::jsonb,
      host          text,
      generated_at  timestamptz,
      updated_at    timestamptz NOT NULL DEFAULT now()
    )
  `;
  await q`CREATE INDEX IF NOT EXISTS usage_day_date_idx ON usage_day (date DESC)`;
}

/**
 * Replace a day wholesale. The collector recomputes each day from the full log
 * history, so last write wins is exactly the semantics we want — re-running it
 * can never double-count.
 */
export async function upsertDay(day, host) {
  const q = sql();
  await q`
    INSERT INTO usage_day (date, total_tokens, usd, requests, tokens, providers, host, generated_at, updated_at)
    VALUES (
      ${day.date}, ${day.total}, ${day.usd}, ${day.requests},
      ${JSON.stringify(day.tokens)}::jsonb, ${JSON.stringify(day.providers)}::jsonb,
      ${host ?? null}, ${day.generatedAt ?? null}, now()
    )
    ON CONFLICT (date) DO UPDATE SET
      total_tokens = EXCLUDED.total_tokens,
      usd          = EXCLUDED.usd,
      requests     = EXCLUDED.requests,
      tokens       = EXCLUDED.tokens,
      providers    = EXCLUDED.providers,
      host         = EXCLUDED.host,
      generated_at = EXCLUDED.generated_at,
      updated_at   = now()
  `;
}

export async function upsertDays(days, host) {
  for (const day of days) await upsertDay(day, host);
  return days.length;
}

/** Every stored day, oldest first, shaped exactly like the JSON files. */
export async function fetchDays() {
  const q = sql();
  const rows = await q`
    SELECT date, total_tokens, usd, requests, tokens, providers, host, generated_at, updated_at
    FROM usage_day
    ORDER BY date ASC
  `;
  return rows.map((r) => ({
    date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
    total: Number(r.total_tokens),
    usd: Number(r.usd),
    requests: Number(r.requests),
    tokens: r.tokens,
    providers: r.providers,
    generatedAt: r.generated_at ? new Date(r.generated_at).toISOString() : '',
  }));
}

export async function lastUpdated() {
  const q = sql();
  const rows = await q`SELECT max(updated_at) AS at, max(host) AS host FROM usage_day`;
  return { at: rows[0]?.at ? new Date(rows[0].at).toISOString() : '', host: rows[0]?.host ?? '' };
}
