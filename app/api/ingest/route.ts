import { NextResponse } from 'next/server';
// Plain ES module, shared with the Node collector.
import { ensureSchema, hasDatabase, upsertDays } from '@/lib/db.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Accepts day aggregates from a machine that cannot reach Neon directly.
 *
 *   POST /api/ingest
 *   Authorization: Bearer <TOKENWATT_INGEST_TOKEN>
 *   { "host": "desktop", "days": [ <one daily JSON payload>, ... ] }
 *
 * Days are replaced wholesale, matching the collector's semantics: posting the
 * same day twice is a no-op rather than a double count.
 */
export async function POST(req: Request) {
  const token = process.env.TOKENWATT_INGEST_TOKEN;
  if (!token) {
    return NextResponse.json({ error: 'Ingest is disabled.' }, { status: 404 });
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ error: 'No database configured.' }, { status: 503 });
  }

  let body: { host?: string; days?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body is not valid JSON.' }, { status: 400 });
  }

  const days = body?.days;
  if (!Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: 'Expected a non-empty "days" array.' }, { status: 400 });
  }

  const clean = [];
  for (const d of days as Record<string, unknown>[]) {
    if (typeof d?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      return NextResponse.json({ error: `Bad or missing date: ${String(d?.date)}` }, { status: 400 });
    }
    clean.push({
      date: d.date,
      total: Number(d.total) || 0,
      usd: Number(d.usd) || 0,
      requests: Number(d.requests) || 0,
      tokens: d.tokens ?? {},
      providers: d.providers ?? {},
      generatedAt: typeof d.generatedAt === 'string' ? d.generatedAt : new Date().toISOString(),
    });
  }

  try {
    await ensureSchema();
    await upsertDays(clean, typeof body.host === 'string' ? body.host.slice(0, 64) : null);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, days: clean.length });
}
