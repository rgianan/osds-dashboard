import { ArrowDown, ArrowUp, ListChecks } from 'lucide-react'
import { n } from '../lib/format.js'
import { formatPublishedDate, reportTable, useReport } from '../lib/useReport.js'
import { KpiCard, Panel } from './Panel.jsx'
import { DefinitionNote, ErrorAlert, Header, PageIntro } from './DashboardShell.jsx'

function IndicatorList({ rows, max }) {
  return (
    <ol className="grid gap-4">
      {rows.map((row) => (
        <li key={row.number ?? row.label}>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm leading-6 text-slate-700">
              {row.number != null ? <span className="mr-1 font-semibold text-slate-500">{row.number}.</span> : null}
              {row.label}
            </p>
            <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{n(row.value)}</p>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            <div className="h-full rounded-full bg-blue-600" style={{ width: `${max ? (row.value / max) * 100 : 0}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export default function AntiHazingDashboard() {
  const { report, error, retry } = useReport('anti-hazing')
  const table = reportTable(report, 'indicators')
  const valueKey = table?.columns[0]?.key
  const rows = (table?.rows || []).map((row) => ({ ...row, value: row.values[valueKey] }))
  const ranked = [...rows].sort((a, b) => b.value - a.value)
  const highest = ranked[0]
  const lowest = ranked[ranked.length - 1]

  return (
    <>
      <Header
        activeView="anti-hazing"
        title="Anti-Hazing Law (RA 11053)"
        statusLabel="Last published"
        statusValue={report ? formatPublishedDate(report.publishedAt) || 'Unknown' : 'Loading...'}
      />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:py-7 lg:px-8">
        <section aria-busy={!report && !error} aria-labelledby="anti-hazing-title">
          <PageIntro
            eyebrow="RA 11053 implementation"
            titleId="anti-hazing-title"
            title="How HEIs are implementing the Anti-Hazing Law"
            description="Positive responses from higher education institutions for each implementation indicator in the RA 11053 report."
          />

          {error ? <ErrorAlert title="Anti-hazing data could not be loaded" message={error} onRetry={retry} /> : null}

          {!report && !error ? (
            <div className="mt-5 grid gap-5" role="status" aria-label="Loading anti-hazing data">
              <div className="grid gap-3 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <div key={index} className="skeleton h-36 rounded-2xl" />)}</div>
              <div className="skeleton h-96 rounded-2xl" />
            </div>
          ) : null}

          {table ? (
            <div className="section-enter mt-5 grid gap-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard icon={ArrowUp} tone="green" label="Most reported measure" value={n(highest.value)} suffix="positive responses" hint={highest.label} />
                <KpiCard icon={ArrowDown} tone="amber" label="Least reported measure" value={n(lowest.value)} suffix="positive responses" hint={lowest.label} />
                <KpiCard icon={ListChecks} tone="blue" label="Indicators tracked" value={n(rows.length)} hint="Implementation measures in the report" />
              </div>

              <Panel title="Positive responses by indicator" subtitle="In the order of the report">
                <IndicatorList rows={rows} max={highest.value} />
                <DefinitionNote>The report does not state how many HEIs responded, so the share of HEIs for each indicator cannot be shown. Bars are scaled to the most reported measure.</DefinitionNote>
              </Panel>
            </div>
          ) : null}
        </section>
      </main>
    </>
  )
}
