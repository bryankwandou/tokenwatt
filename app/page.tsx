import { Calendar } from '@/components/Calendar';
import { Section, ShareBar, Stat, Table } from '@/components/Panels';
import { Wordmark } from '@/components/Logo';
import {
  PRICING,
  fmtDate,
  fmtFull,
  fmtTokens,
  fmtUsd,
  loadSource,
  modelLabel,
  providerColor,
  providerLabel,
  quotaUsage,
  rollup,
} from '@/lib/data';

// Re-read on request so a midnight sync shows up without a redeploy, with a
// short cache so a burst of visitors does not hammer the database.
export const revalidate = 300;

export default async function Page() {
  const source = await loadSource();
  const days = source.days;
  const t = rollup(days);
  const quotas = quotaUsage(days);

  const latest = days[days.length - 1];
  const last30 = days.slice(-30);
  const r30 = rollup(last30);
  const avgDay = days.length ? t.total / days.length : 0;

  const providers = Object.entries(t.byProvider).sort((a, b) => b[1].total - a[1].total);
  const models = Object.entries(t.byModel).sort((a, b) => b[1].usd - a[1].usd);
  const projects = Object.entries(t.byProject)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);
  const recent = [...days].reverse().slice(0, 30);

  const untracked = Object.entries(PRICING.providers)
    .filter(([id, p]) => !p.auto && id !== 'manual')
    .map(([, p]) => p.label);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      {/* ---------------------------------------------------------- header */}
      <header className="rise mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Wordmark />
          <p className="mt-2 max-w-md text-sm text-ink-dim">
            Token consumption across my coding agents, metered from local logs and priced at
            published API rates.
          </p>
        </div>
        <div className="text-right text-xs text-ink-faint">
          <div className="num">
            {source.generatedAt
              ? new Date(source.generatedAt).toLocaleString('en-US', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })
              : '—'}
          </div>
          <div>
            last reading
            {source.origin === 'neon' ? ' · live' : source.origin === 'files' ? ' · snapshot' : ''}
          </div>
        </div>
      </header>

      {days.length === 0 && (
        <div className="panel mb-8 p-6 text-sm text-ink-dim">
          No readings yet. Run <code className="text-watt">npm run collect</code> on a machine with
          agent logs to take the first one.
        </div>
      )}

      {/* ------------------------------------------------------- stat tiles */}
      <div className="rise mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4" style={{ animationDelay: '60ms' }}>
        <Stat
          label="Tokens all time"
          value={fmtTokens(t.total)}
          sub={`${fmtFull(t.total)} exact`}
        />
        <Stat
          label="Cost at API rates"
          value={fmtUsd(t.usd, { compact: true })}
          sub={`${fmtFull(t.requests)} requests`}
          accent
        />
        <Stat
          label="Last 30 days"
          value={fmtTokens(r30.total)}
          sub={`${fmtUsd(r30.usd, { compact: true })} · ${last30.length} active days`}
        />
        <Stat
          label="Daily average"
          value={fmtTokens(avgDay)}
          sub={`${fmtUsd(days.length ? t.usd / days.length : 0)} per active day`}
        />
      </div>

      {latest && (
        <div className="rise panel mb-8 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5" style={{ animationDelay: '90ms' }}>
          <div className="text-xs text-ink-faint">
            Most recent day &middot; <span className="text-ink-dim">{fmtDate(latest.date)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="num">{fmtFull(latest.total)} tokens</span>
            <span className="num text-watt">{fmtUsd(latest.usd)}</span>
            <span className="num text-ink-dim">{latest.requests} requests</span>
          </div>
        </div>
      )}

      <main className="flex flex-col gap-4">
        {/* ------------------------------------------------------- calendar */}
        <div className="rise" style={{ animationDelay: '120ms' }}>
          <Section
            title="Daily consumption"
            note="One cell per day, shaded by total tokens. Hover for the exact reading."
          >
            <Calendar days={source.index} />
          </Section>
        </div>

        {/* ------------------------------------------------------ providers */}
        <div className="rise" style={{ animationDelay: '150ms' }}>
          <Section title="By provider" note="Each agent metered separately">
            <div className="mb-5">
              <ShareBar parts={providers.map(([id, v]) => ({ id, total: v.total }))} />
            </div>
            <Table
              head={['Provider', 'Tokens', 'Share', 'Requests', 'Cost']}
              rows={providers.map(([id, v]) => ({
                key: id,
                bar: { pct: 0, color: providerColor(id) },
                cells: [
                  providerLabel(id),
                  fmtTokens(v.total),
                  `${((v.total / (t.total || 1)) * 100).toFixed(1)}%`,
                  fmtFull(v.requests),
                  fmtUsd(v.usd),
                ],
              }))}
            />
          </Section>
        </div>

        {/* -------------------------------------------------- quota windows */}
        {quotas.length > 0 && (
          <div className="rise" style={{ animationDelay: '180ms' }}>
            <Section
              title="Current subscription windows"
              note="Usage inside each plan's rolling reset window, counted back from the latest reading"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {quotas.map((q) => (
                  <div key={q.provider} className="rounded-xl bg-panel-2 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm">{q.label}</span>
                      <span className="text-[11px] text-ink-faint">
                        rolling {q.hours}h window
                      </span>
                    </div>
                    <div className="num mt-2 text-xl font-semibold">{fmtTokens(q.total)}</div>
                    <div className="mt-1 text-xs text-ink-dim">
                      {fmtUsd(q.usd)} if billed at API rates
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* --------------------------------------------------------- models */}
        <div className="rise" style={{ animationDelay: '210ms' }}>
          <Section title="By model" note="Sorted by cost, because that is what actually varies">
            <Table
              head={['Model', 'Tokens', 'Requests', 'Cost']}
              rows={models.map(([id, v]) => ({
                key: id,
                bar: { pct: 0, color: providerColor(v.provider) },
                cells: [modelLabel(id), fmtTokens(v.total), fmtFull(v.requests), fmtUsd(v.usd)],
              }))}
            />
          </Section>
        </div>

        {/* ------------------------------------------------------- projects */}
        {projects.length > 0 && (
          <div className="rise" style={{ animationDelay: '240ms' }}>
            <Section title="Busiest projects" note="Top 15 by tokens">
              <Table
                head={['Project', 'Tokens', 'Requests', 'Cost']}
                rows={projects.map(([id, v]) => ({
                  key: id,
                  cells: [
                    <span key="p" className="font-mono text-[12px] text-ink-dim">
                      {id.length > 58 ? `…${id.slice(-57)}` : id}
                    </span>,
                    fmtTokens(v.total),
                    fmtFull(v.requests),
                    fmtUsd(v.usd),
                  ],
                }))}
              />
            </Section>
          </div>
        )}

        {/* ----------------------------------------------------- daily table */}
        <div className="rise" style={{ animationDelay: '270ms' }}>
          <Section title="Day by day" note="Most recent 30 active days">
            <Table
              head={['Date', 'Tokens', 'Input', 'Output', 'Cache read', 'Cost']}
              rows={recent.map((d) => ({
                key: d.date,
                cells: [
                  fmtDate(d.date),
                  fmtTokens(d.total),
                  fmtTokens(d.tokens.input),
                  fmtTokens(d.tokens.output),
                  fmtTokens(d.tokens.cacheRead),
                  fmtUsd(d.usd),
                ],
              }))}
            />
          </Section>
        </div>

        {/* ------------------------------------------------------ methodology */}
        <div className="rise" style={{ animationDelay: '300ms' }}>
          <Section title="How these numbers are produced">
            <div className="grid gap-6 text-sm leading-relaxed text-ink-dim sm:grid-cols-2">
              <div>
                <h3 className="mb-1.5 font-medium text-ink">Where the data comes from</h3>
                <p>
                  A collector runs on my machine every night at midnight, reads the session logs
                  written by each agent CLI, and aggregates them into one record per calendar
                  day. Each record is written twice — into Postgres, which this page reads, and
                  into a JSON file kept under version control — so losing either copy costs
                  nothing. Repeated request IDs are counted once, so resumed sessions do not
                  inflate the total, and re-running the collector rewrites a day rather than
                  adding to it. Only the aggregates leave the machine: no prompts, no code, no
                  file contents.
                </p>
              </div>
              <div>
                <h3 className="mb-1.5 font-medium text-ink">How cost is calculated</h3>
                <p>
                  Every figure is an estimate, computed from raw token counts against the
                  published per-model API rates (rate card updated {PRICING.updated}). Cache
                  writes are billed at {PRICING.defaults.cacheWrite5mMultiplier}× the input rate
                  for the 5-minute tier and {PRICING.defaults.cacheWrite1hMultiplier}× for the
                  1-hour tier; cache reads at {PRICING.defaults.cacheReadMultiplier}×. Work done
                  under a subscription is not billed this way — treat the dollar figures as the
                  value consumed, not an invoice.
                </p>
              </div>
              {untracked.length > 0 && (
                <div className="sm:col-span-2">
                  <h3 className="mb-1.5 font-medium text-ink">What is not counted</h3>
                  <p>
                    {untracked.join(' and ')} do not write token accounting to disk, so they
                    cannot be metered automatically and are absent from these totals unless
                    entered by hand. Rather than estimate them, this page leaves them out.
                  </p>
                </div>
              )}
            </div>
          </Section>
        </div>
      </main>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t rule pt-6 text-xs text-ink-faint">
        <span>TokenWatt · a personal meter, not a billing statement</span>
        <span className="flex items-center gap-4">
          <a className="transition-colors hover:text-watt" href="/api/export">
            export json
          </a>
          <a
            className="transition-colors hover:text-watt"
            href="https://github.com/bryankwandou/tokenwatt"
          >
            source
          </a>
        </span>
      </footer>
    </div>
  );
}
