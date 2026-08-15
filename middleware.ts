import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE, authEnabled, constantTimeEqual, credentials, verifyToken } from '@/lib/auth.mjs';

/**
 * Gate every page behind a signed session cookie, sending anyone without one to
 * the sign-in page.
 *
 * Exempt: the sign-in page and its handler, for obvious reasons, and the ingest
 * endpoint, which carries its own bearer token because a script cannot fill in
 * a form.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|icon.svg|favicon.ico|api/ingest|api/login|login).*)'],
};

export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();

  const { secret } = credentials();
  const token = req.cookies.get(COOKIE)?.value;
  if (await verifyToken(token, secret)) return NextResponse.next();

  // A backup script has no cookie jar, so the ingest token also opens the door.
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '');
  const ingest = (process.env.TOKENWATT_INGEST_TOKEN ?? '').trim();
  if (ingest && constantTimeEqual(bearer, ingest)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  // Remember where they were headed so sign-in can return them there.
  url.search = req.nextUrl.pathname !== '/' ? `?next=${encodeURIComponent(req.nextUrl.pathname)}` : '';
  return NextResponse.redirect(url);
}
