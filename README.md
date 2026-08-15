# TokenWatt

A personal meter for AI coding-agent token usage.

Every night the collector reads the session logs that Claude Code and Codex
write to disk, aggregates them into one record per calendar day, prices those
records against published API rates, and publishes the result to a single page
you can open from any device.

It measures consumption. It is not a billing statement — work done under a
subscription is not invoiced this way, so read the dollar figures as the value
consumed at list price.

---

## What it tracks

| Source | Automatic | Where the numbers come from |
| --- | --- | --- |
| Claude Code CLI | yes | `~/.claude/projects/**/*.jsonl` — per-message `usage`, split across input, output, 5-minute cache writes, 1-hour cache writes and cache reads |
| Codex CLI | yes | `~/.codex/sessions/**/*.jsonl` — the cumulative `token_count` event, including reasoning tokens |
| Antigravity / Gemini | no | Conversations are stored as protobuf blobs in SQLite with no token accounting |
| GitHub Copilot | no | Writes no usage log |

The two unsupported providers are deliberately left out of the totals rather
than estimated. They can still be entered by hand — see *Manual entries* below.

Accuracy was checked against [`ccusage`](https://github.com/ryoppippi/ccusage)
over the same log set: token counts agreed within 0.4% and cost within 1.2%,
the remainder being Codex days that `ccusage` does not read and this project's
separate 2× rate for 1-hour cache writes.

---

## How the pieces fit

```
agent CLI logs  ──▶  collector  ──┬──▶  Neon Postgres  ──▶  dashboard (live)
  (local disk)     (nightly)      │
                                  └──▶  data/*.json    ──▶  git history (backup)
```

Each day is written to both places. The dashboard reads Postgres, so a new
reading appears without a redeploy; the JSON files are committed, so the full
history survives losing the database. Days are replaced wholesale on every run,
which means re-running the collector can never double-count.

---

## Setup

```bash
npm install
cp .env.example .env.local     # then fill in DATABASE_URL and the auth pair
npm run collect                # takes the first reading
npm run dev                    # http://localhost:3000
```

### Environment

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string. Without it the collector writes files only and the dashboard falls back to reading them. |
| `TOKENWATT_USER` / `TOKENWATT_PASS` | The sign-in pair. Leave both empty to serve the page publicly. |
| `TOKENWATT_SESSION_SECRET` | Signs the session cookie. Any long random string; changing it signs every device out. Falls back to `TOKENWATT_PASS`. |
| `TOKENWATT_INGEST_TOKEN` | Bearer token for `POST /api/ingest` and for scripted `GET /api/export`. Leave empty to disable both. |

`.env.local` is gitignored. This repository is public — no secret belongs in it.

### Signing in

The gate is an ordinary form at `/login`, not the browser's basic-auth dialog.
A correct entry sets `tw_session`, a cookie carrying the username, the time it
was issued, and an HMAC-SHA256 signature over both, checked in middleware on
every request. It lasts thirty days; the footer's *sign out* button drops it.

Nothing but the signature is trusted — the cookie cannot be edited into a valid
one without the secret, and it stops verifying once it is thirty days old.

To prove the gate works against a running server, local or deployed:

```bash
npm run verify:login -- https://<your-deployment>
```

It walks the whole path — turned away without a cookie, wrong password refused,
right pair admitted, cookie honoured on later requests, forged cookie refused,
sign-out clearing it — and prints each step with the status it got back.

---

## Running it nightly

`scripts/install-schedule.ps1` registers a Windows scheduled task that runs the
collector at 00:00 every day:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
```

The task runs `node collector/collect.mjs --push`, which aggregates the logs,
writes the JSON files, upserts every day into Neon, and commits the changed
files. Remove it with `Unregister-ScheduledTask -TaskName TokenWatt`.

Two things can go wrong at midnight with nobody watching, and both are handled
rather than left to be noticed later:

- **Neon is unreachable.** Serverless computes cold-start and radios sleep, so
  a write can come back as `fetch failed`. Each write is retried three times
  over about ten seconds; if it still fails, the runner replays the files that
  were just written (`npm run sync:db`) as a repair pass. That takes twenty
  seconds because it re-reads no logs at all.
- **`git push` wants a password.** A credential prompt with no console to
  answer it would hang until the scheduler's two-hour limit. Prompting is
  disabled for the push and it is capped at two minutes, so a refusal ends the
  run instead of wedging it. The commit is already made either way, and the
  next night carries it.

```bash
npm run sync:db            # replay every daily file into Neon
npm run sync:db -- --since 7
```

On macOS or Linux the equivalent is a cron line:

```
0 0 * * *  cd /path/to/tokenwatt && /usr/bin/node collector/collect.mjs --push
```

---

## Collector options

```bash
node collector/collect.mjs              # aggregate, write files, sync Neon
node collector/collect.mjs --push       # ...then commit and push to git
node collector/collect.mjs --since 30   # only rebuild the last 30 days
node collector/collect.mjs --no-db      # skip the Neon sync
```

A full rebuild across ~120 log files takes about five minutes, which is why it
runs unattended rather than on request. `--since` is the fast path for a manual
top-up during the day.

---

## Pushing from another machine

A machine that cannot reach Neon directly can post its readings instead:

```bash
curl -X POST https://<your-deployment>/api/ingest \
  -H "Authorization: Bearer $TOKENWATT_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"host":"laptop","days":[ ... daily JSON payloads ... ]}'
```

The endpoint replaces the named days, so posting the same payload twice is a
no-op.

## Getting the data back out

`GET /api/export` returns the entire history as one JSON document, behind the
same gate as the dashboard. That is the third copy of the data, after Neon and
the committed files. In a browser the session cookie is enough; a script sends
the ingest token instead:

```bash
curl -H "Authorization: Bearer $TOKENWATT_INGEST_TOKEN" \
  https://<your-deployment>/api/export -o tokenwatt-backup.json
```

### Manual entries

Providers without usable logs can be recorded in `data/manual.json`:

```json
[
  { "date": "2026-08-12", "provider": "copilot", "model": "gpt-5.4",
    "input": 120000, "output": 8000 }
]
```

The collector folds these into the same aggregates on its next run.

---

## Adjusting rates

`lib/pricing.mjs` holds the rate card — per-model input and output rates in USD
per million tokens, plus the cache multipliers. Costs are recomputed from raw
token counts on every collector run, so correcting a rate and re-running fixes
the whole history retroactively. Unknown model IDs fall back to prefix rules and
are flagged as inferred.

---

## Project layout

```
collector/collect.mjs   log parsing and daily aggregation
lib/pricing.mjs         rate card
lib/cost.mjs            cost arithmetic, shared by collector and app
lib/db.mjs              Neon schema and queries, shared by collector and app
scripts/sync-db.mjs     replay the daily files into Neon, no log parsing
lib/data.ts             data loading and roll-ups for the dashboard
app/page.tsx            the dashboard
app/api/ingest/route.ts remote push endpoint
lib/auth.mjs            session cookie signing and verification
app/login/page.tsx      the sign-in form
app/api/login/route.ts  sign in and sign out
middleware.ts           the gate itself
data/daily/*.json       one file per day, committed as the backup
```
