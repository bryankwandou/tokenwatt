import { fmtFull, fmtTokens, fmtUsd, providerColor, providerLabel } from '@/lib/data';

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="panel p-4 sm:p-5">
      <div className="text-[11px] uppercase tracking-[0.13em] text-ink-faint">{label}</div>
      <div
        className={`num mt-2 text-2xl sm:text-[28px] font-semibold ${accent ? 'text-watt' : 'text-ink'}`}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-ink-dim">{sub}</div>}
    </div>
  );
}

/** Horizontal share bar — one segment per provider, sized by token share. */
export function ShareBar({
  parts,
}: {
  parts: { id: string; total: number }[];
}) {
  const sum = parts.reduce((a, p) => a + p.total, 0) || 1;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-panel-2">
      {parts.map((p) => (
        <div
          key={p.id}
          title={`${providerLabel(p.id)} — ${((p.total / sum) * 100).toFixed(1)}%`}
          style={{ width: `${(p.total / sum) * 100}%`, background: providerColor(p.id) }}
        />
      ))}
    </div>
  );
}

export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: {
    key: string;
    cells: React.ReactNode[];
    bar?: { pct: number; color: string };
  }[];
}) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b rule">
            {head.map((h, i) => (
              <th
                key={h}
                className={`pb-2 text-[11px] font-medium uppercase tracking-[0.11em] text-ink-faint ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b rule last:border-0">
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={`py-2.5 ${i === 0 ? 'text-left' : 'num text-right tabular-nums'} ${
                    i === 0 ? 'text-ink' : 'text-ink-dim'
                  }`}
                >
                  {i === 0 && r.bar ? (
                    <span className="flex items-center gap-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: r.bar.color }}
                      />
                      <span className="truncate">{c}</span>
                    </span>
                  ) : (
                    c
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {note && <p className="text-xs text-ink-faint">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export { fmtFull, fmtTokens, fmtUsd };
