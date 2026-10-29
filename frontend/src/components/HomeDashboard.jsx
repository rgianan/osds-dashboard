import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { getForeignStudentsSummary, getReport, postJson } from '../lib/api.js'
import { formatDataDate, n } from '../lib/format.js'
import { reportTable } from '../lib/useReport.js'
import { DASHBOARD_GROUPS, DASHBOARD_VIEWS, Header, PageIntro } from './DashboardShell.jsx'

// One headline number per dashboard: { value, label, asOf }. A dashboard with no entry
// here still gets a card on Home, without a number.
const HEADLINES = {
  siap: async () => {
    const data = await postJson({ action: 'dashboardData', filters: { year: '', country: '', region: '', sex: '', quarter: '' }, section: 'overview', includeOptions: false })
    return { value: data.overview?.totalInterns, label: 'interns in the program', asOf: data.lastUpdatedAt }
  },
  'foreign-students': async () => {
    const data = await getForeignStudentsSummary()
    const latest = data.byAcademicYear?.[data.byAcademicYear.length - 1]
    return { value: latest?.count, label: latest ? `foreign students in academic year ${latest.name}` : 'foreign students', asOf: data.generatedAt }
  },
  tosf: async () => {
    const report = await getReport('tosf-increase')
    const label = report.academicYear ? `fee increase applications, academic year ${report.academicYear}` : 'fee increase applications'
    return { value: reportTable(report, 'applications')?.totals.applicationsReceived, label, asOf: report.publishedAt }
  },
  'anti-hazing': async () => {
    const report = await getReport('anti-hazing')
    return { value: reportTable(report, 'indicators')?.rows.length, label: 'implementation indicators reported by HEIs', asOf: report.publishedAt }
  },
}

function Headline({ headline }) {
  if (!headline) return null
  if (headline.status === 'loading') {
    return (
      <div role="status" aria-label="Loading the latest number">
        <div className="skeleton h-9 w-28 rounded-lg" />
        <div className="skeleton mt-2 h-4 w-44 rounded" />
      </div>
    )
  }
  if (headline.status === 'error' || headline.value == null) {
    return <p className="text-sm text-slate-600">The latest number could not be loaded. Open the dashboard to see its data.</p>
  }
  return (
    <div>
      <p className="text-3xl font-bold tracking-tight text-slate-950 tabular-nums">{n(headline.value)}</p>
      <p className="mt-1 text-sm text-slate-600">{headline.label}</p>
    </div>
  )
}

function DashboardCard({ view, headline }) {
  const Icon = view.icon
  return (
    <a
      href={view.href}
      className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-[0_12px_34px_rgba(15,23,42,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700"><Icon size={20} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-slate-950">{view.title}</h4>
          <p className="mt-1 text-sm leading-6 text-slate-600">{view.description}</p>
        </div>
      </div>
      <div className="mt-auto"><Headline headline={headline} /></div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <span className="text-xs font-medium text-slate-600">{headline?.asOf ? `Data as of ${formatDataDate(headline.asOf)}` : ''}</span>
        <span className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700">Open <ArrowRight size={16} aria-hidden="true" /></span>
      </div>
    </a>
  )
}

export default function HomeDashboard() {
  const [headlines, setHeadlines] = useState({})

  useEffect(() => {
    let isCurrent = true
    for (const [id, load] of Object.entries(HEADLINES)) {
      load()
        .then((value) => { if (isCurrent) setHeadlines((current) => ({ ...current, [id]: { status: 'ready', ...value } })) })
        .catch(() => { if (isCurrent) setHeadlines((current) => ({ ...current, [id]: { status: 'error' } })) })
    }
    return () => { isCurrent = false }
  }, [])

  const views = DASHBOARD_VIEWS.filter((view) => view.group && !view.hidden)
  return (
    <>
      <Header activeView="home" title="Home" dataAsOf={null} />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:pb-7 lg:px-8">
        <PageIntro titleId="home-title" title="All dashboards" description="Each card shows a dashboard's latest headline number. Open one to explore and filter its data." />

        {DASHBOARD_GROUPS.map((group) => {
          const items = views.filter((view) => view.group === group)
          if (!items.length) return null
          const headingId = `group-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
          return (
            <section key={group} className="mt-6" aria-labelledby={headingId}>
              <h3 id={headingId} className="text-xs font-bold uppercase tracking-wide text-slate-600">{group}</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {items.map((view) => (
                  <DashboardCard key={view.id} view={view} headline={headlines[view.id] || (HEADLINES[view.id] ? { status: 'loading' } : null)} />
                ))}
              </div>
            </section>
          )
        })}
      </main>
    </>
  )
}
