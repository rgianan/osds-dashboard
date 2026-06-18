import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  Filter,
  Globe2,
  GraduationCap,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  TimerReset,
  Users,
  X,
} from 'lucide-react'
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
  { id: 'overview', label: 'Overview', title: 'Executive overview', description: 'A concise view of participation, activity, and destination patterns.', icon: BarChart3 },
  { id: 'timeline', label: 'Timeline', title: 'Internship timeline', description: 'Upcoming completions and monthly internship movement.', icon: TimerReset },
  { id: 'hei', label: 'HEI risk', title: 'HEI concentration risk', description: 'Institution participation, destination mix, and concentration indicators.', icon: GraduationCap },
  { id: 'geo', label: 'Geography', title: 'Destinations and host organizations', description: 'Where interns go and which organizations receive them.', icon: Globe2 },
]
const SECTION_BY_TAB = { overview: 'overview', timeline: 'timeline', hei: 'hei', geo: 'geography' }
const EMPTY_DASHBOARD = { overview: null, timeline: null, hei: null, geography: null }
const FILTER_LABELS = { year: 'Year', quarter: 'Quarter', country: 'Country', region: 'Region', sex: 'Sex' }

function useDebouncedFilters(filters, delay = 300) {
  const [debounced, setDebounced] = useState(filters)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), delay)
    return () => clearTimeout(timer)
  }, [filters.year, filters.country, filters.region, filters.sex, filters.quarter, delay])

  return debounced
}

function EmptyState({ title = 'No data for this view', message = 'Try broadening or clearing the selected filters.', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-6 text-center ${compact ? 'min-h-40 py-6' : 'min-h-64 py-10'}`}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
        <BarChart3 size={19} aria-hidden="true" />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">{message}</p>
    </div>
  )
}

function Visualization({ children, data, height = 280, label, emptyTitle }) {
  const hasData = Array.isArray(data) ? data.length > 0 : Boolean(data)
  if (!hasData) return <EmptyState title={emptyTitle} compact />

  return (
    <div role="img" aria-label={label}>
      <Suspense fallback={<div className="skeleton flex items-center justify-center rounded-xl text-sm font-medium text-slate-500" style={{ height }}>Loading visualization...</div>}>
        {children}
      </Suspense>
    </div>
  )
}

function Select({ id, label, value, options, onChange, allLabel = 'All' }) {
  return (
    <label htmlFor={id} className="min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <span className="relative block">
        <select
          id={id}
          className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm font-medium text-slate-800 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{allLabel}</option>
          {(options || []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      </span>
    </label>
  )
}

function Header({ tab, lastUpdatedAt, onRefresh, loading, onTabChange }) {
  function handleTabKeyDown(event, index) {
    const keyTargets = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }
    const nextIndex = keyTargets[event.key]
    if (nextIndex == null) return
    event.preventDefault()
    document.getElementById(`tab-${TABS[nextIndex].id}`)?.focus()
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#102a43] text-[11px] font-black tracking-wide text-white shadow-sm">SIAP</div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">Commission on Higher Education</p>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">SIAP Analytics</h1>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="min-w-0 text-left sm:text-right" aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last synchronized</p>
              <p className="truncate text-xs font-medium text-slate-600">{lastUpdatedAt || 'Waiting for data'}</p>
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#102a43] px-3.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#183b56] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
              aria-label="Refresh the active dashboard section"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        <nav className="mt-5 -mb-px overflow-x-auto" aria-label="Dashboard sections">
          <div className="flex min-w-max gap-1" role="tablist">
            {TABS.map((item, index) => {
              const Icon = item.icon
              const active = tab === item.id
              return (
                <button
                  type="button"
                  key={item.id}
                  id={`tab-${item.id}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`panel-${item.id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => onTabChange(item.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 ${active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'}`}
                >
                  <Icon size={16} aria-hidden="true" /> {item.label}
                </button>
              )
            })}
          </div>
        </nav>
      </div>
    </header>
  )
}

function FilterBar({ filters, options, onChange, onClear, open, onToggle }) {
  const activeFilters = Object.entries(filters).filter(([, value]) => value)

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)]" aria-labelledby="filters-title">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Filter size={16} aria-hidden="true" /></span>
          <div>
            <h2 id="filters-title" className="text-sm font-semibold text-slate-900">Filter dashboard</h2>
            <p className="text-xs text-slate-500">{activeFilters.length ? `${activeFilters.length} active filter${activeFilters.length === 1 ? '' : 's'}` : 'Showing all available records'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilters.length ? (
            <button type="button" onClick={onClear} className="hidden min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:inline-flex">
              <RotateCcw size={14} aria-hidden="true" /> Clear all
            </button>
          ) : null}
          <button type="button" onClick={onToggle} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 lg:hidden" aria-expanded={open} aria-controls="dashboard-filters">
            {open ? 'Hide' : 'Filters'} <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div id="dashboard-filters" className={`${open ? 'block' : 'hidden'} border-t border-slate-100 px-4 py-4 sm:px-5 lg:block`}>
        <fieldset>
          <legend className="sr-only">Dashboard filters</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select id="filter-year" label="Year" value={filters.year} options={options.years || []} onChange={(value) => onChange('year', value)} />
            <Select id="filter-quarter" label="Quarter" value={filters.quarter} options={['Q1', 'Q2', 'Q3', 'Q4']} onChange={(value) => onChange('quarter', value)} />
            <Select id="filter-country" label="Country" value={filters.country} options={options.countries || []} onChange={(value) => onChange('country', value)} />
            <Select id="filter-region" label="Region" value={filters.region} options={options.regions || []} onChange={(value) => onChange('region', value)} />
            <Select id="filter-sex" label="Sex" value={filters.sex} options={options.sexes || []} onChange={(value) => onChange('sex', value)} />
          </div>
        </fieldset>

        {activeFilters.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {activeFilters.map(([key, value]) => (
              <button key={key} type="button" onClick={() => onChange(key, '')} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`Remove ${FILTER_LABELS[key]} filter ${value}`}>
                <span className="text-blue-500">{FILTER_LABELS[key]}:</span> {value} <X size={13} aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={onClear} className="min-h-8 rounded-full px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 sm:hidden">Clear all</button>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function SectionIntro({ tab, filters }) {
  const item = TABS.find((candidate) => candidate.id === tab)
  const activeFilters = Object.values(filters).filter(Boolean).length
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">SIAP decision support</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{item.title}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">{item.description}</p>
      </div>
      <p className="text-xs font-medium text-slate-500">{activeFilters ? `View refined by ${activeFilters} filter${activeFilters === 1 ? '' : 's'}` : 'All records included'}</p>
    </div>
  )
}

function InsightSummary({ items }) {
  const safeItems = items.filter(Boolean)
  if (!safeItems.length) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-cyan-50" aria-labelledby="insights-title">
      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="flex items-start gap-3 border-b border-blue-100 px-5 py-4 md:border-b-0 md:border-r">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"><Lightbulb size={17} aria-hidden="true" /></span>
          <div>
            <h3 id="insights-title" className="text-sm font-bold text-slate-900">What stands out</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">A quick reading of the current selection.</p>
          </div>
        </div>
        <div className="grid divide-y divide-blue-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
          {safeItems.map((item) => (
            <div key={item.label} className="px-5 py-4">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{item.label}</p>
              <p className="mt-1 text-sm font-bold text-slate-900">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{item.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DefinitionNote({ children }) {
  return <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">{children}</p>
}

function DataTable({ rows, columns, caption }) {
  const safeRows = Array.isArray(rows) ? rows : []
  if (!safeRows.length) return <EmptyState compact />

  return (
    <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">
          <tr>{columns.map((column) => <th key={column.key} scope="col" className={`border-b border-slate-200 px-3 py-2.5 ${column.num ? 'text-right' : ''}`}>{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {safeRows.map((row, index) => (
            <tr key={row.name || index} className="bg-white transition hover:bg-blue-50/50">
              {columns.map((column) => <td key={column.key} className={`px-3 py-2.5 text-slate-700 ${column.num ? 'text-right font-semibold tabular-nums' : ''}`}>{column.render ? column.render(row) : row[column.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function percent(part, total) {
  const denominator = Number(total || 0)
  return denominator ? `${Math.round((Number(part || 0) / denominator) * 100)}%` : '0%'
}

function Overview({ data }) {
  const overview = data.overview || {}
  const topCountry = overview.internsByCountry?.[0]
  const topProgram = overview.internsByProgram?.[0]
  const totalInterns = Number(overview.totalInterns || 0)
  const insights = [
    topCountry && { label: 'Leading destination', title: topCountry.name, detail: `${n(topCountry.totalInterns)} interns, or ${percent(topCountry.totalInterns, totalInterns)} of the current selection.` },
    { label: 'Currently active', title: `${n(overview.activeInternshipsToday)} internships`, detail: `${percent(overview.activeInternshipsToday, totalInterns)} of selected interns are active today.` },
    topProgram && { label: 'Top program', title: topProgram.name, detail: `${n(topProgram.totalInterns)} participating interns in the current selection.` },
  ]

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard icon={Users} tone="blue" label="Total interns" value={n(overview.totalInterns)} hint="People in the current selection" />
        <KpiCard icon={FileCheck2} tone="violet" label="Endorsements" value={n(overview.totalEndorsements)} hint="Unique endorsement records" />
        <KpiCard icon={Activity} tone="green" label="Active today" value={n(overview.activeInternshipsToday)} hint="Internships active on this date" />
        <KpiCard icon={Clock3} tone="amber" label="Average lead time" value={n(overview.avgLeadTimeDays, 1)} suffix="days" hint="Endorsement to internship start" />
        <KpiCard icon={CalendarClock} tone="slate" label="Average duration" value={n(overview.avgDurationWorkHours, 0)} suffix="hours" hint="Weekdays multiplied by 8 hours" />
      </div>

      <InsightSummary items={insights} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Interns by region" subtitle="Sorted for easier comparison">
          <Visualization data={overview.internsByRegion} height={320} label="Horizontal bar chart of interns by region" emptyTitle="No regional data">
            <HorizontalBars data={overview.internsByRegion || []} height={320} color="#2563eb" />
          </Visualization>
        </Panel>
        <Panel title="Interns by destination" subtitle="Top destination countries">
          <Visualization data={overview.internsByCountry} height={320} label="Horizontal bar chart of interns by destination country" emptyTitle="No destination data">
            <HorizontalBars data={overview.internsByCountry || []} height={320} color="#0f766e" />
          </Visualization>
        </Panel>
        <Panel title="Programs represented" subtitle="Programs with the most participating interns">
          <Visualization data={overview.internsByProgram} height={360} label="Horizontal bar chart of interns by academic program" emptyTitle="No program data">
            <HorizontalBars data={overview.internsByProgram || []} height={360} color="#7c3aed" />
          </Visualization>
        </Panel>
        <Panel title="Endorsement activity" subtitle="Unique endorsements by month">
          <Visualization data={overview.endorsementsByMonth} height={300} label="Monthly endorsement bar chart" emptyTitle="No endorsement activity">
            <EndorsementMonths data={overview.endorsementsByMonth || []} />
          </Visualization>
          <DefinitionNote>Each endorsement number is counted once within its endorsement month.</DefinitionNote>
        </Panel>
      </div>
    </div>
  )
}

function Timeline({ data }) {
  const timeline = data.timeline || {}
  const laterWindow = Math.max(0, Number(timeline.endingNext60Days || 0) - Number(timeline.endingNext30Days || 0))
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={CalendarClock} tone="amber" label="Ending within 30 days" value={n(timeline.endingNext30Days)} hint="Includes internships ending today" />
        <KpiCard icon={TimerReset} tone="blue" label="Ending within 60 days" value={n(timeline.endingNext60Days)} hint="Cumulative 60-day outlook" />
        <KpiCard icon={CheckCircle2} tone="green" label="Days 31–60" value={n(laterWindow)} hint="Expected after the first 30 days" />
      </div>

      <InsightSummary items={[
        { label: 'Immediate workload', title: `${n(timeline.endingNext30Days)} upcoming completions`, detail: 'Prioritize these records for close-out checks and required documentation.' },
        { label: 'Following period', title: `${n(laterWindow)} more by day 60`, detail: 'This separates near-term completions from the cumulative 60-day figure.' },
      ]} />

      <Panel title="Starts and completions over time" subtitle="Monthly internship movement">
        <Visualization data={timeline.startsEndsByMonth} height={320} label="Line chart comparing monthly internship starts and completions" emptyTitle="No timeline activity">
          <MonthLine data={timeline.startsEndsByMonth || []} />
        </Visualization>
      </Panel>
      <Panel title="Country summary" subtitle="Participation and average working duration by destination">
        <DataTable rows={timeline.countrySummary} caption="Country internship summary" columns={[
          { key: 'name', label: 'Country' },
          { key: 'totalEndorsements', label: 'Endorsements', num: true, render: (row) => n(row.totalEndorsements) },
          { key: 'totalInterns', label: 'Interns', num: true, render: (row) => n(row.totalInterns) },
          { key: 'avgDurationWorkHours', label: 'Average hours', num: true, render: (row) => n(row.avgDurationWorkHours, 1) },
        ]} />
        <DefinitionNote>Average hours use weekdays only and assume an eight-hour workday.</DefinitionNote>
      </Panel>
    </div>
  )
}

function HeiRisk({ data }) {
  const hei = data.hei || {}
  const countries = data.options?.countries || []
  const topHei = hei.internsByHei?.[0]
  const visibleTotal = (hei.internsByHei || []).reduce((sum, row) => sum + Number(row.totalInterns || 0), 0)
  return (
    <div className="grid gap-5">
      <InsightSummary items={[
        topHei && { label: 'Largest participating HEI', title: topHei.name, detail: `${n(topHei.totalInterns)} interns, representing ${percent(topHei.totalInterns, visibleTotal)} of the institutions shown.` },
        { label: 'Institutions represented', title: `${n((hei.table || []).length)} HEIs`, detail: 'Use the table to inspect destination and host-organization breadth.' },
      ]} />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Interns by HEI" subtitle="Largest participating institutions first">
          <Visualization data={hei.internsByHei} height={380} label="Horizontal bar chart of interns by higher education institution" emptyTitle="No HEI participation data">
            <HorizontalBars data={hei.internsByHei || []} height={380} color="#2563eb" />
          </Visualization>
        </Panel>
        <Panel title="Destination mix by HEI" subtitle="Share of endorsements across destination countries">
          <Visualization data={hei.endorsementsByHeiCountry} height={340} label="Stacked percentage bars showing country mix by HEI" emptyTitle="No HEI destination data">
            <StackedHeiCountryBars data={hei.endorsementsByHeiCountry || []} countries={countries} />
          </Visualization>
          <DefinitionNote>A concentrated bar suggests greater reliance on one destination country.</DefinitionNote>
        </Panel>
        <Panel title="Endorsements by region" subtitle="Regional contribution to endorsements">
          <Visualization data={hei.endorsementsByRegion} height={320} label="Horizontal bar chart of endorsements by region" emptyTitle="No regional endorsement data">
            <HorizontalBars data={hei.endorsementsByRegion || []} valueKey="totalEndorsements" height={320} color="#7c3aed" />
          </Visualization>
        </Panel>
        <div className="grid gap-5 sm:grid-cols-2">
          <Panel title="Interns by sex" className="min-w-0">
            <Visualization data={hei.bySex} label="Donut chart of interns by sex" emptyTitle="No sex distribution data">
              <Donut data={hei.bySex || []} />
            </Visualization>
          </Panel>
          <Panel title="HEI type" className="min-w-0">
            <Visualization data={hei.byTypeOfHei} label="Donut chart of interns by HEI type" emptyTitle="No HEI type data">
              <Donut data={hei.byTypeOfHei || []} />
            </Visualization>
          </Panel>
        </div>
      </div>

      <Panel title="HEI concentration details" subtitle="Breadth of destinations and host organizations">
        <DataTable rows={hei.table} caption="HEI concentration details" columns={[
          { key: 'name', label: 'Higher education institution' },
          { key: 'totalEndorsements', label: 'Endorsements', num: true, render: (row) => n(row.totalEndorsements) },
          { key: 'totalInterns', label: 'Interns', num: true, render: (row) => n(row.totalInterns) },
          { key: 'countries', label: 'Countries', num: true, render: (row) => n(row.countries) },
          { key: 'hostOrgs', label: 'Host organizations', num: true, render: (row) => n(row.hostOrgs) },
        ]} />
      </Panel>
    </div>
  )
}

function Geography({ data }) {
  const geography = data.geography || {}
  const topCountry = geography.internsByCountry?.[0]
  const topHost = geography.hosts?.[0]
  const visibleInterns = (geography.internsByCountry || []).reduce((sum, row) => sum + Number(row.totalInterns || 0), 0)
  return (
    <div className="grid gap-5">
      <InsightSummary items={[
        topCountry && { label: 'Leading destination', title: topCountry.name, detail: `${n(topCountry.totalInterns)} interns, or ${percent(topCountry.totalInterns, visibleInterns)} of destinations shown.` },
        topHost && { label: 'Leading host organization', title: topHost.name, detail: `${n(topHost.totalInterns)} participating interns in the current selection.` },
        { label: 'Mapped routes', title: `${n((geography.routes || []).length)} origin-destination paths`, detail: 'Line thickness and destination marker size represent intern volume.' },
      ]} />

      <Panel title="Internship flow map" subtitle="Origin-to-destination routes sized by intern volume">
        <Visualization data={geography.routes} height={400} label="Map of internship routes" emptyTitle="No routes can be mapped">
          <RouteMap routes={geography.routes || []} />
        </Visualization>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Interns by destination" subtitle="Countries ranked by intern volume">
          <Visualization data={geography.internsByCountry} height={340} label="Horizontal bar chart of interns by destination" emptyTitle="No destination data">
            <HorizontalBars data={geography.internsByCountry || []} height={340} color="#0f766e" />
          </Visualization>
        </Panel>
        <Panel title="Host organizations" subtitle="Organizations receiving the most interns">
          <Visualization data={geography.hosts} height={380} label="Horizontal bar chart of interns by host organization" emptyTitle="No host organization data">
            <HorizontalBars data={geography.hosts || []} height={380} color="#2563eb" />
          </Visualization>
        </Panel>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-5" role="status" aria-label="Loading dashboard data">
      <span className="sr-only">Loading dashboard data</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => <div key={index} className="skeleton h-36 rounded-2xl" />)}
      </div>
      <div className="skeleton h-28 rounded-2xl" />
      <div className="grid gap-5 xl:grid-cols-2"><div className="skeleton h-96 rounded-2xl" /><div className="skeleton h-96 rounded-2xl" /></div>
    </div>
  )
}

export default function App() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
      .then((response) => {
        if (!isCurrent) return
        if (!response[section]) throw new Error(`The dashboard backend did not return the requested ${section} section. Redeploy the updated Apps Script backend.`)
        setDataByFilter((current) => ({
          ...current,
          [filterKey]: { ...(current[filterKey] || EMPTY_DASHBOARD), [section]: response[section] },
        }))
        if (response.options) setOptions(response.options)
        setLastUpdatedAt(response.lastUpdatedAt || '')
      })
      .catch((requestError) => {
        if (isCurrent) setError(requestError?.message || 'Unable to load dashboard.')
      })
      .finally(() => {
        if (isCurrent) setRequestLoading(false)
      })

    return () => { isCurrent = false }
  }, [filterKey, filtersPending, section, refreshVersion])

  function refreshActiveSection() {
    setDataByFilter((current) => ({
      ...current,
      [filterKey]: { ...(current[filterKey] || EMPTY_DASHBOARD), [section]: null },
    }))
    setRefreshVersion((version) => version + 1)
  }

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const showSkeleton = loading && (filtersPending || !data[section])

  return (
    <div className="min-h-screen bg-[#f6f8fb] text-slate-900">
      <a href="#dashboard-content" className="sr-only z-50 rounded-md bg-white px-4 py-2 font-semibold text-blue-700 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:ring-2 focus:ring-blue-500">Skip to dashboard content</a>
      <Header tab={tab} lastUpdatedAt={lastUpdatedAt} loading={loading} onRefresh={refreshActiveSection} onTabChange={setTab} />

      <main id="dashboard-content" tabIndex={-1} className="mx-auto max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:py-7 lg:px-8">
        <FilterBar
          filters={filters}
          options={options}
          onChange={updateFilter}
          onClear={() => setFilters(DEFAULT_FILTERS)}
          open={filtersOpen}
          onToggle={() => setFiltersOpen((current) => !current)}
        />

        <section className="mt-7" aria-busy={loading} aria-labelledby={`tab-${tab}`}>
          <SectionIntro tab={tab} filters={filters} />

          {error ? (
            <div role="alert" className="mt-5 flex flex-col gap-4 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-900 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
                <div><p className="text-sm font-bold">Dashboard data could not be loaded</p><p className="mt-1 text-sm text-red-700">{error}</p></div>
              </div>
              <button type="button" onClick={refreshActiveSection} className="min-h-10 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus:outline-none focus:ring-4 focus:ring-red-200">Try again</button>
            </div>
          ) : null}

          <div
            id={`panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
            tabIndex={0}
            className="section-enter mt-5 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-4"
            key={`${tab}-${filterKey}`}
          >
            {showSkeleton ? <DashboardSkeleton /> : null}
            {!filtersPending && data[section] && tab === 'overview' ? <Overview data={data} /> : null}
            {!filtersPending && data[section] && tab === 'timeline' ? <Timeline data={data} /> : null}
            {!filtersPending && data[section] && tab === 'hei' ? <HeiRisk data={data} /> : null}
            {!filtersPending && data[section] && tab === 'geo' ? <Geography data={data} /> : null}
            {!loading && !error && !data[section] ? <EmptyState title="This section is not available" message="Refresh the dashboard or adjust the current filters." /> : null}
          </div>
        </section>
      </main>
    </div>
  )
}
