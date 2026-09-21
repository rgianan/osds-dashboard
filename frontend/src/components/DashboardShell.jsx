import { Suspense } from 'react'
import { BarChart3, ChevronDown, Filter, Globe2, Plane, RefreshCw, RotateCcw, X } from 'lucide-react'

export const DASHBOARD_VIEWS = [
  { id: 'siap', label: 'SIAP', badge: 'SIAP', href: '#/siap', documentTitle: 'SIAP Executive Dashboard', icon: Plane },
  { id: 'foreign-students', label: 'Foreign Students Data', badge: 'FS', href: '#/foreign-students', documentTitle: 'Foreign Students Data | CHED', icon: Globe2 },
]

const LG_GRID_COLUMNS = { 1: 'lg:grid-cols-1', 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }

export function EmptyState({ title = 'No data for this view', message = 'Try broadening or clearing the selected filters.', compact = false }) {
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

export function Visualization({ children, data, height = 280, label, emptyTitle }) {
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

export function DefinitionNote({ children }) {
  return <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">{children}</p>
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

function DashboardSwitcher({ activeView }) {
  return (
    <nav className="mt-4" aria-label="Dashboards">
      <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {DASHBOARD_VIEWS.map((view) => {
          const Icon = view.icon
          const active = view.id === activeView
          return (
            <a
              key={view.id}
              href={view.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'}`}
            >
              <Icon size={16} aria-hidden="true" /> {view.label}
            </a>
          )
        })}
      </div>
    </nav>
  )
}

export function Header({ activeView, title, statusLabel, statusValue, onRefresh, showRefresh = false, loading = false, tabs = null, tab, onTabChange }) {
  const badge = DASHBOARD_VIEWS.find((view) => view.id === activeView)?.badge || ''

  function handleTabKeyDown(event, index) {
    const keyTargets = {
      ArrowRight: (index + 1) % tabs.length,
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }
    const nextIndex = keyTargets[event.key]
    if (nextIndex == null) return
    event.preventDefault()
    document.getElementById(`tab-${tabs[nextIndex].id}`)?.focus()
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className={`mx-auto max-w-[1600px] px-4 pt-5 sm:px-6 lg:px-8 ${tabs ? '' : 'pb-4'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#102a43] text-[11px] font-black tracking-wide text-white shadow-sm">{badge}</div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700">Commission on Higher Education</p>
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{title}</h1>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="min-w-0 text-left sm:text-right" aria-live="polite">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{statusLabel}</p>
              <p className="truncate text-xs font-medium text-slate-600">{statusValue}</p>
            </div>
            {showRefresh ? <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#102a43] px-3.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#183b56] hover:shadow-md focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
              aria-label="Refresh the active dashboard section"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              <span>Refresh</span>
            </button> : null}
          </div>
        </div>

        <DashboardSwitcher activeView={activeView} />

        {tabs ? (
          <nav className="mt-3 -mb-px overflow-x-auto" aria-label="Dashboard sections">
            <div className="flex min-w-max gap-1" role="tablist">
              {tabs.map((item, index) => {
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
        ) : null}
      </div>
    </header>
  )
}

export function FilterBar({ fields, filters, onChange, onClear, open, onToggle }) {
  const labels = Object.fromEntries(fields.map((field) => [field.key, field.label]))
  const activeFilters = fields.map((field) => [field.key, filters[field.key]]).filter(([, value]) => value)

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
          <div className={`grid gap-3 sm:grid-cols-2 ${LG_GRID_COLUMNS[fields.length] || 'lg:grid-cols-5'}`}>
            {fields.map((field) => (
              <Select key={field.key} id={`filter-${field.key}`} label={field.label} value={filters[field.key]} options={field.options} allLabel={field.allLabel} onChange={(value) => onChange(field.key, value)} />
            ))}
          </div>
        </fieldset>

        {activeFilters.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
            {activeFilters.map(([key, value]) => (
              <button key={key} type="button" onClick={() => onChange(key, '')} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-blue-50 px-3 text-xs font-semibold text-blue-800 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label={`Remove ${labels[key]} filter ${value}`}>
                <span className="text-blue-500">{labels[key]}:</span> {value} <X size={13} aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={onClear} className="min-h-8 rounded-full px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 sm:hidden">Clear all</button>
          </div>
        ) : null}
      </div>
    </section>
  )
}
