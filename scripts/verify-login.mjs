/**
 * Proof that the sign-in gate works, end to end, against a running server.
 *
 * Run the server first (`npm run build && npm start`, or point BASE at the
 * deployment) and then:
 *
 *   node scripts/verify-login.mjs                       # http://localhost:3000
 *   node scripts/verify-login.mjs https://tokenwatt.vercel.app
 *
 * Credentials come from TOKENWATT_USER / TOKENWATT_PASS, the same pair the
 * server reads. Every step prints what it asked for and what came back, so the
 * transcript itself is the evidence.
 */

import { readFileSync } from 'node:fs';

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');

// Reading .env.local keeps the script honest: it uses the deployed pair, not
// a copy typed into the source.
try {
  for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* fine — the values may already be in the environment */
}

const USER = (process.env.TOKENWATT_USER ?? '').trim();
const PASS = (process.env.TOKENWATT_PASS ?? '').trim();

let failures = 0;
function check(label, condition, detail) {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures++;
}

/** No cookie jar: the session cookie is carried by hand so the test can see it. */
function get(path, cookie) {
  return fetch(`${BASE}${path}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
}

function post(path, fields, cookie) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields).toString(),
  });
}

const sessionFrom = (res) =>
  (res.headers.getSetCookie?.() ?? []).find((c) => c.startsWith('tw_session='));

console.log(`\nTokenWatt sign-in check against ${BASE}\n`);

// 1. A stranger is turned away.
const anon = await get('/');
check(
  'the dashboard redirects a visitor with no session to /login',
  anon.status >= 300 && anon.status < 400 && (anon.headers.get('location') ?? '').includes('/login'),
  `${anon.status} → ${anon.headers.get('location')}`,
);

// 2. The sign-in page itself is reachable and is a real page, not a browser dialog.
const page = await get('/login');
const html = await page.text();
check('the sign-in page renders', page.status === 200, `${page.status}`);
check('it is a form, not the browser basic-auth prompt', html.includes('action="/api/login"'));
check('it carries the TokenWatt mark', html.includes('Token') && html.includes('Watt'));
check('no WWW-Authenticate header anywhere', !page.headers.get('www-authenticate'));

// 3. A wrong password does not get in, and says so on the page.
const wrong = await post('/api/login', { user: USER, pass: 'not-the-password' });
check(
  'a wrong password is rejected',
  (wrong.headers.get('location') ?? '').includes('error=1') && !sessionFrom(wrong),
  `${wrong.status} → ${wrong.headers.get('location')}`,
);

// 4. The right pair gets in.
const good = await post('/api/login', { user: USER, pass: PASS });
const setCookie = sessionFrom(good);
check(
  `signing in as "${USER}" succeeds`,
  good.status === 303 && Boolean(setCookie),
  `${good.status} → ${good.headers.get('location')}`,
);
check('the session cookie is HttpOnly', Boolean(setCookie?.includes('HttpOnly')));
check('the session cookie is SameSite=Lax', Boolean(setCookie?.toLowerCase().includes('samesite=lax')));

const cookie = setCookie?.split(';')[0] ?? '';

// 5. That cookie opens the dashboard, and keeps opening it.
const first = await get('/', cookie);
const body = await first.text();
check('the dashboard opens with the session cookie', first.status === 200, `${first.status}`);
// The dashboard also posts to /api/login (the sign-out button), so the tell is
// the absence of a password field, not the absence of that path.
check(
  'and it is the meter, not the login page',
  body.includes('TokenWatt') && !body.includes('name="pass"'),
);

const again = await get('/', cookie);
check('a second request is not asked to sign in again', again.status === 200, `${again.status}`);

const exported = await get('/api/export', cookie);
check('the JSON export opens with the same session', exported.status === 200, `${exported.status}`);

// 6. A forged cookie does not.
const forged = await get('/', 'tw_session=' + USER + '.' + Date.now() + '.notavalidsignature');
check(
  'a forged cookie is refused',
  forged.status >= 300 && forged.status < 400,
  `${forged.status} → ${forged.headers.get('location')}`,
);

// 7. Signing out ends it.
const out = await post('/api/login', { logout: '1' }, cookie);
const cleared = sessionFrom(out);
check(
  'signing out clears the cookie',
  Boolean(cleared) && /(Max-Age=0|Expires=Thu, 01 Jan 1970)/i.test(cleared ?? ''),
  cleared,
);

console.log(
  failures === 0
    ? '\nAll checks passed. Sign-in works with the configured username and password.\n'
    : `\n${failures} check(s) failed.\n`,
);
process.exit(failures ? 1 : 0);
