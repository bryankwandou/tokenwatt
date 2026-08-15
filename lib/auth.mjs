/**
 * Session cookie signing.
 *
 * Basic auth was the first attempt and it was the wrong tool: the browser owns
 * that dialog, it cannot be styled, and a wrong entry loops forever with no way
 * to say what went wrong. This replaces it with an ordinary form and a signed
 * cookie, verified in middleware.
 *
 * Web Crypto is used rather than node:crypto so the same code runs in the edge
 * middleware and in the route handler.
 */

export const COOKIE = 'tw_session';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Env values arrive from dashboards and shells; trailing whitespace is noise. */
export function credentials() {
  return {
    user: (process.env.TOKENWATT_USER ?? '').trim(),
    pass: (process.env.TOKENWATT_PASS ?? '').trim(),
    secret: (process.env.TOKENWATT_SESSION_SECRET ?? process.env.TOKENWATT_PASS ?? '').trim(),
  };
}

/** Auth is only enforced once both a user and a password are configured. */
export function authEnabled() {
  const { user, pass } = credentials();
  return user.length > 0 && pass.length > 0;
}

function toBase64Url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** The cookie carries who signed in and when, plus a signature over both. */
export async function issueToken(user, secret, issuedAt = Date.now()) {
  const payload = `${user}.${issuedAt}`;
  return `${payload}.${await hmac(payload, secret)}`;
}

export async function verifyToken(token, secret) {
  if (!token) return false;
  const cut = token.lastIndexOf('.');
  if (cut < 1) return false;
  const payload = token.slice(0, cut);
  const signature = token.slice(cut + 1);

  const expected = await hmac(payload, secret);
  if (!constantTimeEqual(signature, expected)) return false;

  const issuedAt = Number(payload.slice(payload.lastIndexOf('.') + 1));
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < MAX_AGE * 1000;
}

export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
