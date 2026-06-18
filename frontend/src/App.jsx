import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, Globe2, GraduationCap, RefreshCw, TimerReset } from 'lucide-react'
import { postJson } from './lib/api.js'
import { n } from './lib/format.js'
import { KpiCard, Panel } from './components/Panel.jsx'

const loadCharts = () => import('./components/Charts.jsx')
const Donut = lazy(() => loadCharts().then((module) => ({ default: module.Donut })))
const EndorsementMonths = lazy(() => loadCharts().then((module) => ({ default: module.EndorsementMonths })))
const HorizontalBars = lazy(() => loadCharts().then((module) => ({ default: module.HorizontalBars })))
const MonthLine = lazy(() => loadCharts().then((module) => ({ default: module.MonthLine })))
const StackedHeiCountryBars = lazy(() => loadCharts().then((module) => ({ default: module.StackedHeiCountryBars })))
const RouteMap = lazy(() => import('./components/RouteMap.jsx').then((module) => ({ default: module.RouteMap })))

const DEFAULT_FILTERS = { year: '', country: '', region: '', sex: '', quarter: '' }
const TABS = [
  { id: 'overview', label: 'Executive Overview', icon: BarChart3 },
  { id: 'timeline', label: 'Timeline + Forecast', icon: TimerReset },
  { id: 'hei', label: 'HEI Risk', icon: GraduationCap },
  { id: 'geo', label: 'Geography', icon: Globe2 },
]
const SECTION_BY_TAB = { overview: 'overview', timeline: 'timeline', hei: 'hei', geo: 'geography' }
const EMPTY_DASHBOARD = { overview: null, timeline: null, hei: null, geography: null }

function useDebouncedFilters(filters, delay = 300) {
  const [debounced, setDebounced] = useState(filters)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), delay)
    return () => clearTimeout(timer)
  }, [filters.year, filters.country, filters.region, filters.sex, filters.quarter, delay])

  return debounced
}

function Visualization({ children, height = 280 }) {
  return (
    <Suspense fallback={<div className="flex items-center justify-center rounded-xl bg-slate-50 text-sm font-semibold text-slate-500" style={{ height }}>Loading visualization...</div>}>
      {children}
    </Suspense>
  )
}

function Select({ label, value, options, onChange, allLabel = 'All' }) {
  return (
    <label className="block border-b border-slate-300 bg-slate-200/80 p-3 last:border-b-0">
      <span className="block text-xs font-extrabold uppercase text-slate-700">{label}</span>
      <select className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {(options || []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function Header({ tab, lastUpdatedAt, onRefresh, loading }) {
  const title = {
    overview: 'EXECUTIVE OVERVIEW OF SIAP',
    timeline: 'INTERNSHIP TIMELINE AND FORECASTING',
    hei: 'HEI PERFORMANCE AND CONCENTRATION RISK',
    geo: 'GEOGRAPHY AND HOST DESTINATION',
  }[tab]
  return (
    <header className="mb-4 flex flex-col gap-4 border-b-4 border-slate-900 bg-white px-4 py-4 shadow-sm md:flex-row md:items-end md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-900 text-xs font-black text-white shadow-panel">SIAP</div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-700">Commission on Higher Education</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{title}</h1>
          <p className="mt-1 text-xs text-slate-500">Last loaded: {lastUpdatedAt || '—'}</p>
        </div>
      </div>
      <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white shadow hover:bg-slate-800 disabled:opacity-60">
        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
      </button>
    </header>
  )
}

function DataTable({ rows, columns }) {
  const safeRows = rows || []
  return (
    <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 text-left text-xs uppercase text-slate-600">
          <tr>{columns.map((c) => <th key={c.key} className="border-b border-slate-300 px-3 py-2">{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {safeRows.map((r, idx) => <tr key={idx} className="odd:bg-white even:bg-slate-50">{columns.map((c) => <td key={c.key} className={`border-b border-slate-100 px-3 py-2 ${c.num ? 'text-right font-semibold' : ''}`}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}
        </tbody>
      </table>
      {!safeRows.length ? <div className="p-6 text-center text-sm text-slate-500">No rows match the selected filters.</div> : null}
    </div>
  )
}

function Overview({ data }) {
  const o = data.overview || {}
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-5">
        <KpiCard label="Total Interns" value={n(o.totalInterns)} />
        <KpiCard label="Total Endorsements" value={n(o.totalEndorsements)} />
        <KpiCard label="Active Internships Today" value={n(o.activeInternshipsToday)} />
        <KpiCard label="Avg Lead Time (Days)" value={n(o.avgLeadTimeDays, 2)} />
        <KpiCard label="Avg Duration (Work Hours)" value={n(o.avgDurationWorkHours, 2)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Total Interns by Region"><Visualization><Donut data={o.internsByRegion || []} /></Visualization></Panel>
        <Panel title="Total Interns by Country"><Visualization><Donut data={o.internsByCountry || []} /></Visualization></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Total Interns by Program Enrolled In"><Visualization height={360}><HorizontalBars data={o.internsByProgram || []} height={360} /></Visualization></Panel>
        <Panel title="Total Endorsements by Year and Month"><Visualization height={300}><EndorsementMonths data={o.endorsementsByMonth || []} /></Visualization></Panel>
      </div>
    </div>
  )
}

function Timeline({ data }) {
  const t = data.timeline || {}
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.9fr]">
        <KpiCard label="Ending Next 30 Days" value={n(t.endingNext30Days)} />
        <KpiCard label="Ending Next 60 Days" value={n(t.endingNext60Days)} />
        <Panel title="Country Summary">
          <DataTable rows={t.countrySummary || []} columns={[
            { key: 'name', label: 'Country' },
            { key: 'totalEndorsements', label: 'Endorsements', num: true, render: (r) => n(r.totalEndorsements) },
            { key: 'totalInterns', label: 'Interns', num: true, render: (r) => n(r.totalInterns) },
            { key: 'avgDurationWorkHours', label: 'Avg Duration (Work Hours)', num: true, render: (r) => n(r.avgDurationWorkHours, 2) },
          ]} />
        </Panel>
      </div>
      <Panel title="Internship starts and Internship ends by Year and Month"><Visualization height={300}><MonthLine data={t.startsEndsByMonth || []} /></Visualization></Panel>
    </div>
  )
}

function HeiRisk({ data }) {
  const h = data.hei || {}
  const countries = data.options?.countries || []
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Total Interns by HEI"><Visualization height={360}><HorizontalBars data={h.internsByHei || []} height={360} /></Visualization></Panel>
        <Panel title="Total Endorsements by HEI and Country"><Visualization height={320}><StackedHeiCountryBars data={h.endorsementsByHeiCountry || []} countries={countries} /></Visualization></Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_.7fr_1.7fr]">
        <Panel title="Total Endorsements by Region"><Visualization height={300}><HorizontalBars data={h.endorsementsByRegion || []} valueKey="totalEndorsements" height={300} /></Visualization></Panel>
        <div className="grid gap-4">
          <Panel title="By Sex"><Visualization><Donut data={h.bySex || []} /></Visualization></Panel>
          <Panel title="Type of HEI"><Visualization><Donut data={h.byTypeOfHei || []} /></Visualization></Panel>
        </div>
        <Panel title="HEI Concentration Table">
          <DataTable rows={h.table || []} columns={[
            { key: 'name', label: 'Full Name of HEI' },
            { key: 'totalEndorsements', label: 'Endorsements', num: true, render: (r) => n(r.totalEndorsements) },
            { key: 'totalInterns', label: 'Interns', num: true, render: (r) => n(r.totalInterns) },
            { key: 'countries', label: 'Countries', num: true, render: (r) => n(r.countries) },
            { key: 'hostOrgs', label: 'Host Orgs', num: true, render: (r) => n(r.hostOrgs) },
          ]} />
        </Panel>
      </div>
    </div>
  )
}

function Geography({ data }) {
  const g = data.geography || {}
  return (
    <div className="grid gap-4">
      <Panel title="Country Flow Map"><Visualization height={380}><RouteMap routes={g.routes || []} /></Visualization></Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Total Interns by Country"><Visualization><Donut data={g.internsByCountry || []} /></Visualization></Panel>
        <Panel title="Total Interns by Foreign Host Establishment or Organization"><Visualization height={360}><HorizontalBars data={g.hosts || []} height={360} /></Visualization></Panel>
      </div>
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [tab, setTab] = useState('overview')
  const [dataByFilter, setDataByFilter] = useState({})
  const [options, setOptions] = useState({})
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [requestLoading, setRequestLoading] = useState(false)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)

  const debouncedFilters = useDebouncedFilters(filters)
  const immediateFilterKey = useMemo(() => JSON.stringify(filters), [filters])
  const filterKey = useMemo(() => JSON.stringify(debouncedFilters), [debouncedFilters])
  const filtersPending = immediateFilterKey !== filterKey
  const section = SECTION_BY_TAB[tab]
  const sectionData = dataByFilter[filterKey] || EMPTY_DASHBOARD
  const data = useMemo(() => ({ ...EMPTY_DASHBOARD, ...sectionData, options }), [sectionData, options])
  const loading = filtersPending || requestLoading
  const cy = filters.year || 'All Years'

  useEffect(() => {
    if (filtersPending) {
      setRequestLoading(false)
      setError('')
      return undefined
    }

    if (dataByFilter[filterKey]?.[section]) {
      setRequestLoading(false)
      setError('')
      return undefined
    }

    let isCurrent = true
    setRequestLoading(true)
    setError('')

    postJson({
      action: 'dashboardData',
      filters: debouncedFilters,
      section,
      includeOptions: !Object.keys(options).length,
    })
      .then((res) => {
        if (!isCurrent) return
        if (!res[section]) throw new Error(`The dashboard backend did not return the requested ${section} section. Redeploy the updated Apps Script backend.`)
        setDataByFilter((current) => ({
          ...current,
          [filterKey]: { ...(current[filterKey] || EMPTY_DASHBOARD), [section]: res[section] },
        }))
        if (res.options) setOptions(res.options)
        setLastUpdatedAt(res.lastUpdatedAt || '')
      })
      .catch((err) => {
        if (isCurrent) setError(err?.message || 'Unable to load dashboard.')
      })
      .finally(() => {
        if (isCurrent) setRequestLoading(false)
      })

    return () => { isCurrent = false }
  }, [filterKey, filtersPending, section, refreshVersion])

  const titleSuffix = cy && cy !== 'All Years' ? `- CY ${cy}` : ''

  function refreshActiveSection() {
    setDataByFilter((current) => {
      const nextForFilter = { ...(current[filterKey] || EMPTY_DASHBOARD), [section]: null }
      return { ...current, [filterKey]: nextForFilter }
    })
    setRefreshVersion((version) => version + 1)
  }

  return (
    <main className="min-h-screen bg-slate-300 text-slate-900">
      <Header tab={tab} lastUpdatedAt={lastUpdatedAt} loading={loading} onRefresh={refreshActiveSection} />
      <div className="grid gap-4 px-3 pb-6 lg:grid-cols-[160px_1fr]">
        <aside className="h-fit overflow-hidden rounded-sm border-2 border-slate-900 bg-slate-200 shadow-panel">
          <Select label="Year" value={filters.year} options={options.years || []} onChange={(v) => setFilters((f) => ({ ...f, year: v }))} allLabel="All" />
          <Select label="Quarter" value={filters.quarter} options={['Q1', 'Q2', 'Q3', 'Q4']} onChange={(v) => setFilters((f) => ({ ...f, quarter: v }))} allLabel="All" />
          <Select label="Country" value={filters.country} options={options.countries || []} onChange={(v) => setFilters((f) => ({ ...f, country: v }))} allLabel="All" />
          <Select label="Region" value={filters.region} options={options.regions || []} onChange={(v) => setFilters((f) => ({ ...f, region: v }))} allLabel="All" />
          <Select label="Sex" value={filters.sex} options={options.sexes || []} onChange={(v) => setFilters((f) => ({ ...f, sex: v }))} allLabel="All" />
        </aside>
        <section aria-busy={loading}>
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((item) => {
              const Icon = item.icon
               return <button type="button" key={item.id} aria-pressed={tab === item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-black shadow-sm ${tab === item.id ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}><Icon size={16} /> {item.label}</button>
            })}
          </div>
          {error ? <div className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800"><AlertTriangle /> <span>{error}</span></div> : null}
          <div className="mb-4 text-lg font-black uppercase tracking-tight text-slate-950">{TABS.find((x) => x.id === tab)?.label} {titleSuffix}</div>
          {loading && (filtersPending || !data[section]) ? <Panel><div className="p-8 text-center text-sm font-semibold text-slate-500">Loading dashboard data...</div></Panel> : null}
          {!filtersPending && data[section] && tab === 'overview' ? <Overview data={data} /> : null}
          {!filtersPending && data[section] && tab === 'timeline' ? <Timeline data={data} /> : null}
          {!filtersPending && data[section] && tab === 'hei' ? <HeiRisk data={data} /> : null}
          {!filtersPending && data[section] && tab === 'geo' ? <Geography data={data} /> : null}
        </section>
      </div>
    </main>
  )
}
