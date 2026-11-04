import { useEffect, useState } from 'react'
import { ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react'
import { getForeignStudentsSummary, getReport, postJson } from '../lib/api.js'
import { formatDataDate, n } from '../lib/format.js'
import { reportTable } from '../lib/useReport.js'
import { DASHBOARD_GROUPS, DASHBOARD_VIEWS, Header } from './DashboardShell.jsx'
import { MiniBars, MiniProgress } from './BarList.jsx'

// Each dashboard's colour on Home: its icon tile and its mini chart.
const ACCENTS = {
  siap: { tile: 'bg-[#E6ECF8] text-brand-blue', soft: '#C9D6F0', strong: '#0038A8', text: '#0038A8' },
  'foreign-students': { tile: 'bg-[#E2F2F1] text-[#0E7C7B]', soft: '#BFE3E1', strong: '#0E7C7B', text: '#0E7C7B' },
  tosf: { tile: 'bg-[#FBF1D3] text-[#B98900]', soft: '#F3E8C4', strong: '#D9A400', text: '#8A6600' },
  'anti-hazing': { tile: 'bg-[#F9E6E9] text-[#B42335]', soft: '#F1C9CF', strong: '#B42335', text: '#B42335' },
}
const DEFAULT_ACCENT = { tile: 'bg-slate-100 text-slate-700', soft: '#E2E8F0', strong: '#475569', text: '#475569' }
const SIAP_MONTHS_SHOWN = 13
const academicYear = (value) => String(value || '').replace('-', '–')

// One headline per dashboard: { value, label, asOf, chart, caption, records, coverage }.
// chart is { bars, highlight } or { part, total } for the card's small chart; records and
// coverage fill the data sources table. A dashboard with no entry here still gets a card
// on Home, without a number.
const HEADLINES = {
  siap: async () => {
    const data = await postJson({ action: 'dashboardData', filters: { year: '', country: '', region: '', sex: '', quarter: '' }, section: 'overview', includeOptions: false })
    const overview = data.overview || {}
    const months = (overview.endorsementsByMonth || []).filter((row) => /^\d{4}-\d{2}$/.test(row.yearMonth)).slice(-SIAP_MONTHS_SHOWN)
    return {
      value: overview.totalInterns,
      label: 'interns in the program',
      asOf: data.lastUpdatedAt,
      chart: months.length ? { bars: months.map((row) => Number(row.totalEndorsements || 0)) } : null,
      caption: 'Endorsements per month',
      records: `${n(overview.totalInterns)} interns`,
      coverage: `${n(overview.totalEndorsements)} endorsements`,
    }
  },
  'foreign-students': async () => {
    const data = await getForeignStudentsSummary()
    const years = data.byAcademicYear || []
    const latest = years[years.length - 1]
    return {
      value: latest?.count,
      label: latest ? `foreign students, AY ${academicYear(latest.name)}` : 'foreign students',
      asOf: data.generatedAt,
      chart: years.length ? { bars: years.map((row) => Number(row.count || 0)) } : null,
      caption: 'Students per academic year',
      records: `${n(data.totalRecords ?? data.total)} records`,
      coverage: years.length ? `AY ${academicYear(years[0].name)} to ${academicYear(latest.name)}` : '',
    }
  },
  tosf: async () => {
    const report = await getReport('tosf-increase')
    const table = reportTable(report, 'applications')
    const received = Number(table?.totals.applicationsReceived || 0)
    return {
      value: table?.totals.applicationsReceived,
      label: report.academicYear ? `applications for AY ${academicYear(report.academicYear)}` : 'fee increase applications',
      asOf: report.publishedAt,
      chart: received ? { part: Number(table.totals.approvedWithinRir || 0), total: received } : null,
      caption: 'Approved within the inflation rate',
      records: `${n(received)} applications`,
      coverage: [report.academicYear && `AY ${academicYear(report.academicYear)}`, table && `${n(table.rows.length)} regions`].filter(Boolean).join(', '),
    }
  },
  'anti-hazing': async () => {
    const report = await getReport('anti-hazing')
    const rows = reportTable(report, 'indicators')?.rows || []
    const responses = rows.map((row) => Number(row.values?.positiveResponses || 0)).sort((a, b) => b - a)
    return {
      value: rows.length,
      label: 'implementation indicators reported',
      asOf: report.publishedAt,
      chart: responses.length ? { bars: responses, highlight: 'first' } : null,
      caption: 'HEIs reporting each indicator',
      records: `${n(rows.length)} indicators`,
      coverage: responses.length ? `Up to ${n(responses[0])} HEIs per indicator` : '',
    }
  },
}

function MiniChart({ headline, accent }) {
  const { chart, caption } = headline
  if (!chart) return null
  return (
    <div>
      {chart.bars
        ? <MiniBars values={chart.bars} color={accent.soft} strongColor={accent.strong} highlight={chart.highlight} />
        : <MiniProgress part={chart.part} total={chart.total} color={accent.strong} trackColor={accent.soft} accentText={accent.text} />}
      <p className="mt-1.5 text-xs text-ink-3">{caption}</p>
    </div>
  )
}

function Headline({ headline, compact = false }) {
  if (!headline) return null
  if (headline.status === 'loading') {
    return (
      <div role="status" aria-label="Loading the latest number">
        <div className={`skeleton rounded-lg ${compact ? 'h-7 w-20' : 'h-9 w-28'}`} />
        <div className="skeleton mt-2 h-4 w-40 rounded" />
      </div>
    )
  }
  if (headline.status === 'error' || headline.value == null) {
    return <p className="text-sm text-ink-2">The latest number could not be loaded. Open the dashboard to see its data.</p>
  }
  return (
    <div>
      <p className={`font-bold tracking-tight text-ink tabular-nums ${compact ? 'text-2xl' : 'text-[32px] leading-10'}`}>{n(headline.value)}</p>
      <p className="mt-0.5 text-[13px] text-ink-2">{headline.label}</p>
    </div>
  )
}

// sm and up: the full card. Phones: one compact row per dashboard, so all four fit on
// one screen.
function DashboardCard({ view, headline }) {
  const Icon = view.icon
  const accent = ACCENTS[view.id] || DEFAULT_ACCENT
  const ready = headline?.status === 'ready' && headline.value != null
  return (
    <a
      href={view.href}
      className="group flex rounded-[14px] border border-line bg-white shadow-card transition hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(11,27,51,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <div className="flex w-full items-center gap-3.5 p-4 sm:hidden">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${accent.tile}`}><Icon size={22} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-ink">{view.title}</h3>
          <Headline headline={headline} compact />
        </div>
        <ChevronRight size={20} className="shrink-0 text-ink-3" aria-hidden="true" />
      </div>

      <div className="hidden w-full flex-col gap-4 p-5 sm:flex">
        <div className="flex items-start justify-between gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${accent.tile}`}><Icon size={20} aria-hidden="true" /></span>
          <ArrowUpRight size={18} className="text-ink-3 opacity-60 transition group-hover:text-brand-blue group-hover:opacity-100" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-ink">{view.title}</h3>
          <p className="mt-1 text-[13px] leading-5 text-ink-2">{view.description}</p>
        </div>
        <Headline headline={headline} />
        {ready ? <MiniChart headline={headline} accent={accent} /> : null}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-[#EDF1F6] pt-3">
          <span className="text-xs text-ink-3">{headline?.asOf ? `Updated ${formatDataDate(headline.asOf)}` : ''}</span>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-blue">Open <ArrowRight size={16} aria-hidden="true" /></span>
        </div>
      </div>
    </a>
  )
}

// Where each dashboard's numbers come from, and how current they are.
function DataSources({ views, headlines }) {
  return (
    <section className="mt-6 rounded-[14px] border border-line bg-white px-5 pb-2 pt-[18px] shadow-card" aria-labelledby="sources-title">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 pb-2">
        <h2 id="sources-title" className="text-[15px] font-semibold text-ink">Data sources</h2>
        <p className="text-[13px] text-ink-3">How much data each dashboard holds and when it was last updated</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <thead className="text-xs font-semibold text-ink-3">
            <tr className="border-b border-line">
              <th scope="col" className="py-2 pr-4 font-semibold">Dashboard</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Records</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Coverage</th>
              <th scope="col" className="py-2 font-semibold">Last updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF1F6]">
            {views.map((view) => {
              const headline = headlines[view.id]
              const ready = headline?.status === 'ready'
              const pending = !headline || headline.status === 'loading'
              return (
                <tr key={view.id}>
                  <th scope="row" className="py-2.5 pr-4 font-semibold text-ink"><a href={view.href} className="hover:text-brand-blue hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{view.title}</a></th>
                  <td className="py-2.5 pr-4 text-ink-2 tabular-nums">{ready ? headline.records : pending ? '...' : 'Not available'}</td>
                  <td className="py-2.5 pr-4 text-ink-2">{ready ? headline.coverage : ''}</td>
                  <td className="py-2.5 text-ink-2">{ready && headline.asOf ? formatDataDate(headline.asOf) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// The newest data date across the dashboards, for the header; null once nothing loaded.
function latestDataDate(headlines, ids) {
  const dates = ids.map((id) => headlines[id]).filter((headline) => headline?.status === 'ready' && headline.asOf)
    .map((headline) => ({ asOf: headline.asOf, time: new Date(String(headline.asOf).replace(' ', 'T')).getTime() }))
    .filter((entry) => Number.isFinite(entry.time))
  if (dates.length) return formatDataDate(dates.reduce((a, b) => (b.time > a.time ? b : a)).asOf)
  return ids.every((id) => headlines[id] && headlines[id].status !== 'loading') ? null : ''
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
  const shown = (view) => headlines[view.id] || (HEADLINES[view.id] ? { status: 'loading' } : null)
  return (
    <>
      <Header activeView="home" title="Dashboards" dataAsOf={latestDataDate(headlines, Object.keys(HEADLINES))} />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:py-7 lg:px-8">
        {/* Laptop screens and wider: the groups sit side by side, so every card fits on one
            screen without scrolling. */}
        <div className="grid gap-6 xl:grid-cols-2">
          {DASHBOARD_GROUPS.map((group) => {
            const items = views.filter((view) => view.group === group)
            if (!items.length) return null
            const headingId = `group-${group.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
            return (
              <section key={group} className="flex flex-col" aria-labelledby={headingId}>
                <h2 id={headingId} className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-2">{group}</h2>
                <div className="mt-3 grid flex-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  {items.map((view) => <DashboardCard key={view.id} view={view} headline={shown(view)} />)}
                </div>
              </section>
            )
          })}
        </div>

        <DataSources views={views} headlines={headlines} />
      </main>
    </>
  )
}
