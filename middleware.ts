import { NextResponse, type NextRequest } from 'next/server';

/**
 * Basic-auth gate.
 *
 * Credentials come from the TOKENWATT_USER / TOKENWATT_PASS environment
 * variables and are never committed — this repository is public. When both are
 * unset the dashboard serves publicly, which is what local `next dev` does.
 *
 * The ingest endpoint is exempt: it carries its own bearer token, since a
 * script posting data cannot answer a browser auth prompt.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|api/ingest).*)'],
};

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function middleware(req: NextRequest) {
  const user = process.env.TOKENWATT_USER;
  const pass = process.env.TOKENWATT_PASS;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    let decoded = '';
    try {
      decoded = atob(header.slice(6));
    } catch {
      decoded = '';
    }
    const sep = decoded.indexOf(':');
    if (sep > -1) {
      const ok =
        timingSafeEqual(decoded.slice(0, sep), user) && timingSafeEqual(decoded.slice(sep + 1), pass);
      if (ok) return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="TokenWatt", charset="UTF-8"' },
  });
}
