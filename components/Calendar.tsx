import { fmtDate, fmtFull, fmtUsd, type IndexEntry } from '@/lib/data';

/**
 * A year-style contribution grid: one column per week, one cell per day.
 * Intensity is scaled against the busiest day so quiet days stay visible
 * instead of collapsing into the background.
 */
export function Calendar({ days, weeks = 27 }: { days: IndexEntry[]; weeks?: number }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const peak = Math.max(1, ...days.map((d) => d.total));

  // Walk back from the Saturday on or after the most recent day with data.
  const last = days.length ? new Date(`${days[days.length - 1].date}T00:00:00Z`) : new Date();
  const end = new Date(last);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (weeks * 7 - 1));

  const cols: { key: string; label: string | null; cells: Date[] }[] = [];
  const cursor = new Date(start);
  let lastMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const cells: Date[] = [];
    for (let d = 0; d < 7; d++) {
      cells.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const m = cells[0].getUTCMonth();
    const label = m !== lastMonth ? cells[0].toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' }) : null;
    lastMonth = m;
    cols.push({ key: cells[0].toISOString().slice(0, 10), label, cells });
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="scroll-x -mx-1 px-1 pb-1">
      <div className="inline-flex flex-col gap-1.5 min-w-full">
        <div className="flex gap-[3px] pl-8">
          {cols.map((c) => (
            <div key={c.key} className="w-[13px] text-[10px] text-ink-faint">
              {c.label}
            </div>
          ))}
        </div>

        <div className="flex gap-[3px]">
          <div className="flex w-8 shrink-0 flex-col gap-[3px] pr-1 text-[10px] text-ink-faint">
            {['', 'Mon', '', 'Wed', '', 'Fri', ''].map((l, i) => (
              <div key={i} className="h-[13px] leading-[13px]">
                {l}
              </div>
            ))}
          </div>

          {cols.map((col) => (
            <div key={col.key} className="flex flex-col gap-[3px]">
              {col.cells.map((cell) => {
                const key = iso(cell);
                const entry = byDate.get(key);
                const future = cell > last;
                // Square-root ramp: a light day still registers next to a peak day.
                const level = entry ? Math.sqrt(entry.total / peak) : 0;
                return (
                  <div
                    key={key}
                    title={
                      entry
                        ? `${fmtDate(key)}\n${fmtFull(entry.total)} tokens\n${fmtUsd(entry.usd)} at API rates\n${entry.requests} requests`
                        : `${fmtDate(key)}\nno usage`
                    }
                    className="h-[13px] w-[13px] rounded-[3px] border border-line-soft transition-transform hover:scale-125"
                    style={{
                      background: entry
                        ? `color-mix(in oklab, var(--color-watt) ${12 + level * 88}%, #0f1013)`
                        : future
                          ? 'transparent'
                          : '#141519',
                      borderColor: entry ? 'transparent' : undefined,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pl-8 pt-1 text-[10px] text-ink-faint">
          <span>quiet</span>
          {[0, 0.25, 0.5, 0.75, 1].map((l) => (
            <div
              key={l}
              className="h-[11px] w-[11px] rounded-[3px]"
              style={{ background: `color-mix(in oklab, var(--color-watt) ${12 + l * 88}%, #0f1013)` }}
            />
          ))}
          <span>peak &middot; {fmtFull(peak)} tokens</span>
        </div>
      </div>
    </div>
  );
}
