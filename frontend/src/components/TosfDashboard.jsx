import { lazy } from 'react'
import { CircleCheck, CirclePause, CircleX, FileText, TrendingDown } from 'lucide-react'
import { n, shortRegionName } from '../lib/format.js'
import { formatPublishedDate, reportTable, useReport } from '../lib/useReport.js'
import { KpiCard, Panel } from './Panel.jsx'
import { DataTable, DefinitionNote, ErrorAlert, Header, PageIntro, Visualization } from './DashboardShell.jsx'

const MultiBars = lazy(() => import('./Charts.jsx').then((module) => ({ default: module.MultiBars })))

const APPLICATION_SERIES = [
  { key: 'received', label: 'Applications received', color: '#2563eb' },
  { key: 'approved', label: 'Approved within regional inflation rate', color: '#0f766e' },
]
const APPEAL_SERIES = [
  { key: 'lowered', label: 'Lowered the increase', color: '#2563eb' },
  { key: 'deferred', label: 'Deferred the increase', color: '#d97706' },
  { key: 'withdrawn', label: 'Withdrew the application', color: '#db2777' },
]
const NOTE_SUBJECTS = { approvedWithinRir: 'approved count', applicationsReceived: 'applications received', lowered: 'lowered count', deferred: 'deferred count', withdrawn: 'withdrawn count' }

function chartHeight(rows, perRow) {
  return Math.max(240, rows * perRow + 70)
}

function combineRegions(applications, appeal) {
  const appealByRegion = new Map(appeal.rows.map((row) => [row.label, row]))
  return applications.rows.map((row) => {
    const appealRow = appealByRegion.get(row.label)
    return {
      region: row.label,
      name: shortRegionName(row.label),
      received: row.values.applicationsReceived,
      approved: row.values.approvedWithinRir,
      lowered: appealRow?.values.lowered ?? 0,
      deferred: appealRow?.values.deferred ?? 0,
      withdrawn: appealRow?.values.withdrawn ?? 0,
      notes: [
        ...Object.entries(row.notes || {}).map(([key, note]) => `${NOTE_SUBJECTS[key] || key}: ${note}`),
        ...Object.entries(appealRow?.notes || {}).map(([key, note]) => `${NOTE_SUBJECTS[key] || key}: ${note}`),
      ],
    }
  })
}

export default function TosfDashboard() {
  const { report, error, retry } = useReport('tosf-increase')
  const applications = reportTable(report, 'applications')
  const appeal = reportTable(report, 'appealResults')
  const regions = applications && appeal ? combineRegions(applications, appeal) : []
  const byReceived = [...regions].sort((a, b) => b.received - a.received)
  const byAppeal = regions
    .map((row) => ({ ...row, appealTotal: row.lowered + row.deferred + row.withdrawn }))
    .filter((row) => row.appealTotal > 0)
    .sort((a, b) => b.appealTotal - a.appealTotal)
  const noted = regions.filter((row) => row.notes.length)

  return (
    <>
      <Header
        activeView="tosf"
        title="Tuition and Other School Fees"
        statusLabel="Academic year"
        statusValue={report ? report.academicYear || 'Not stated' : 'Loading...'}
      />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:py-7 lg:px-8">
        <section aria-busy={!report && !error} aria-labelledby="tosf-title">
          <PageIntro
            eyebrow="TOSF increase applications"
            titleId="tosf-title"
            title="Applications to increase tuition and other school fees"
            description="Private HEI applications received by CHED regional offices (CHEDROs), and how schools responded to CHED's appeal to COCOPEA (Coordinating Council of Private Educational Associations)."
            aside={report?.publishedAt ? `Published ${formatPublishedDate(report.publishedAt)}` : null}
          />

          {error ? <ErrorAlert title="TOSF data could not be loaded" message={error} onRetry={retry} /> : null}

          {!report && !error ? (
            <div className="mt-5 grid gap-5" role="status" aria-label="Loading TOSF data">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-36 rounded-2xl" />)}</div>
              <div className="grid gap-5 xl:grid-cols-2"><div className="skeleton h-96 rounded-2xl" /><div className="skeleton h-96 rounded-2xl" /></div>
            </div>
          ) : null}

          {applications && appeal ? (
            <div className="section-enter mt-5 grid gap-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard icon={FileText} tone="blue" label="Applications received" value={n(applications.totals.applicationsReceived)} hint="Received by CHED regional offices" />
                <KpiCard icon={CircleCheck} tone="green" label="Approved within inflation rate" value={n(applications.totals.approvedWithinRir)} hint="Private HEIs with CHEDRO-approved increases at or below the regional inflation rate" />
                <KpiCard icon={TrendingDown} tone="violet" label="Lowered their increase" value={n(appeal.totals.lowered)} hint="Tuition or other fees, after CHED's appeal" />
                <KpiCard icon={CirclePause} tone="amber" label="Deferred their increase" value={n(appeal.totals.deferred)} hint="After CHED's appeal" />
                <KpiCard icon={CircleX} tone="slate" label="Withdrew their application" value={n(appeal.totals.withdrawn)} hint="After CHED's appeal" />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <Panel title="Applications by region" subtitle="Applications received, and private HEIs approved within the regional inflation rate">
                  <Visualization data={byReceived} height={chartHeight(byReceived.length, 36)} label="Bar chart of TOSF increase applications received and approved by region" emptyTitle="No application data">
                    <MultiBars data={byReceived} series={APPLICATION_SERIES} height={chartHeight(byReceived.length, 36)} labelWidth={170} labelLimit={28} />
                  </Visualization>
                  {noted.length ? <DefinitionNote>{noted.map((row) => `${row.name}: ${row.notes.join('; ')}.`).join(' ')}</DefinitionNote> : null}
                </Panel>
                <Panel title="Results of CHED's appeal to COCOPEA" subtitle="Schools that lowered, deferred, or withdrew their increase, by region">
                  <Visualization data={byAppeal} height={chartHeight(byAppeal.length, 30)} label="Stacked bar chart of schools that lowered, deferred, or withdrew their TOSF increase by region" emptyTitle="No appeal results">
                    <MultiBars data={byAppeal} series={APPEAL_SERIES} height={chartHeight(byAppeal.length, 30)} stacked labelWidth={170} labelLimit={28} />
                  </Visualization>
                  {byAppeal.length < regions.length ? <DefinitionNote>Regions with no lowered, deferred, or withdrawn increases are not shown.</DefinitionNote> : null}
                </Panel>
              </div>

              <Panel title="Regional details" subtitle={report.academicYear ? `Applications for academic year ${report.academicYear}` : 'All regions'}>
                <DataTable rows={regions} caption="TOSF increase applications and appeal results by region" columns={[
                  { key: 'region', label: 'Region' },
                  { key: 'received', label: 'Received', num: true, render: (row) => n(row.received) },
                  { key: 'approved', label: 'Approved within rate', num: true, render: (row) => `${n(row.approved)}${row.notes.length ? '*' : ''}` },
                  { key: 'lowered', label: 'Lowered', num: true, render: (row) => n(row.lowered) },
                  { key: 'deferred', label: 'Deferred', num: true, render: (row) => n(row.deferred) },
                  { key: 'withdrawn', label: 'Withdrew', num: true, render: (row) => n(row.withdrawn) },
                ]} />
                {noted.length ? <DefinitionNote>* {noted.map((row) => `${row.name}: ${row.notes.join('; ')}`).join('. ')}.</DefinitionNote> : null}
              </Panel>
            </div>
          ) : null}
        </section>
      </main>
    </>
  )
}
