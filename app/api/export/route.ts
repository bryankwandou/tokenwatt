import { NextResponse } from 'next/server';
import { loadSource } from '@/lib/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The whole history as one JSON document — a third copy of the data, on top of
 * Neon and the committed files, that can be fetched from anywhere and saved.
 *
 * Sits behind the same basic-auth gate as the dashboard, since it carries the
 * same detail.
 */
export async function GET() {
  const source = await loadSource();
  return NextResponse.json(
    {
      exportedAt: new Date().toISOString(),
      origin: source.origin,
      host: source.host,
      days: source.days,
    },
    {
      headers: {
        'Content-Disposition': `attachment; filename="tokenwatt-${new Date()
          .toISOString()
          .slice(0, 10)}.json"`,
        'Cache-Control': 'no-store',
      },
    },
  );
}
