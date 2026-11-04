import { n } from '../lib/format.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function share(part, total) {
  return total ? `${Math.round((Number(part || 0) / total) * 100)}%` : ''
}

// A ranked list drawn as plain HTML: each row is its label, a bar, the count and its
// share of `total`, so screen readers read the numbers as text. The first (largest) row
// is drawn in the darker blue. rows: [{ name, value }], largest first.
export function RankBars({ rows, total, label }) {
  const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1)
  return (
    <ol className="flex flex-col gap-3" aria-label={label}>
      {rows.map((row, index) => (
        <li key={row.name} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-3 sm:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_auto]">
          <span className="truncate text-[13px] text-ink" title={row.name}>{row.name}</span>
          <span className="h-[22px] overflow-hidden rounded-[5px] bg-[#F1F4F9]" aria-hidden="true">
            <span className={`block h-full rounded-[5px] ${index === 0 ? 'bg-brand-blue' : 'bg-[#7D9AD9]'}`} style={{ width: `${Math.max((Number(row.value || 0) / max) * 100, 1.5)}%` }} />
          </span>
          <span className="w-[5.5rem] text-right text-[13px] tabular-nums">
            <span className="font-semibold text-ink">{n(row.value)}</span>
            {total ? <span className="ml-1.5 text-ink-3">{share(row.value, total)}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  )
}

// The last `count` months as columns with their values above; the latest month is drawn in
// the darker blue. A month's year shows under the first column and under each January.
// rows: [{ yearMonth: "2026-09", value }] in date order; "Unknown" months are left out.
export function MonthColumns({ rows, count = 13, height = 200 }) {
  const months = rows.filter((row) => /^\d{4}-\d{2}$/.test(row.yearMonth)).slice(-count)
  const max = Math.max(...months.map((row) => Number(row.value || 0)), 1)
  return (
    <div className="flex items-end gap-1.5 sm:gap-2" aria-hidden="true">
      {months.map((row, index) => {
        const [year, month] = row.yearMonth.split('-')
        const latest = index === months.length - 1
        return (
          <div key={row.yearMonth} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-[11px] font-semibold text-ink-2 tabular-nums">{n(row.value)}</span>
            <span className={`block w-full rounded-t ${latest ? 'bg-brand-blue' : 'bg-[#7D9AD9]'}`} style={{ height: Math.max((Number(row.value || 0) / max) * height, 2) }} />
            <span className={`text-[11px] ${latest ? 'font-semibold text-ink' : 'text-ink-3'}`}>{MONTHS[Number(month) - 1]}</span>
            <span className="-mt-1.5 h-3.5 text-[10px] text-ink-3">{index === 0 || month === '01' ? year : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

// A small column sparkline for a Home card. The highlighted column is darker.
export function MiniBars({ values, color, strongColor, highlight = 'last' }) {
  const max = Math.max(...values, 1)
  const strongIndex = highlight === 'first' ? 0 : values.length - 1
  return (
    <div className="flex h-11 items-end gap-1" aria-hidden="true">
      {values.map((value, index) => (
        <span key={index} className="block flex-1 rounded-t-sm" style={{ height: `${Math.max((value / max) * 100, 4)}%`, backgroundColor: index === strongIndex ? strongColor : color }} />
      ))}
    </div>
  )
}

// A part-of-whole bar for a Home card, such as "238 of 344".
export function MiniProgress({ part, total, color, trackColor, accentText }) {
  const ratio = total ? Math.min(part / total, 1) : 0
  return (
    <div className="flex h-11 flex-col justify-end gap-2.5" aria-hidden="true">
      <div className="flex items-center justify-between text-[13px] font-semibold">
        <span className="text-ink">{n(part)} of {n(total)}</span>
        <span style={{ color: accentText }}>{Math.round(ratio * 100)}%</span>
      </div>
      <span className="block h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: trackColor }}>
        <span className="block h-full rounded-full" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
      </span>
    </div>
  )
}
