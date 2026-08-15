import { NextResponse } from 'next/server';
import { COOKIE, MAX_AGE, authEnabled, constantTimeEqual, credentials, issueToken } from '@/lib/auth.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Accepts the sign-in form, sets the session cookie, sends them on their way. */
export async function POST(req: Request) {
  const form = await req.formData();

  // The footer's sign-out button posts here rather than linking, so that a
  // prefetch can never end a session.
  if (form.get('logout')) return clear(req);

  const user = String(form.get('user') ?? '').trim();
  const pass = String(form.get('pass') ?? '');
  const next = String(form.get('next') ?? '/');

  // Only ever redirect within this site.
  const destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';

  if (!authEnabled()) return NextResponse.redirect(new URL(destination, req.url), 303);

  const expected = credentials();
  const ok =
    constantTimeEqual(user, expected.user) && constantTimeEqual(pass.trim(), expected.pass);

  if (!ok) {
    const url = new URL('/login', req.url);
    url.searchParams.set('error', '1');
    if (destination !== '/') url.searchParams.set('next', destination);
    return NextResponse.redirect(url, 303);
  }

  const res = NextResponse.redirect(new URL(destination, req.url), 303);
  res.cookies.set(COOKIE, await issueToken(expected.user, expected.secret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return res;
}

/** Signing out is just dropping the cookie. */
export async function GET(req: Request) {
  return clear(req);
}

function clear(req: Request) {
  const res = NextResponse.redirect(new URL('/login', req.url), 303);
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
