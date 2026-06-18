const KPI_TONES = {
  blue: { icon: 'bg-blue-50 text-blue-700 ring-blue-100', accent: 'bg-blue-500' },
  violet: { icon: 'bg-violet-50 text-violet-700 ring-violet-100', accent: 'bg-violet-500' },
  green: { icon: 'bg-emerald-50 text-emerald-700 ring-emerald-100', accent: 'bg-emerald-500' },
  amber: { icon: 'bg-amber-50 text-amber-700 ring-amber-100', accent: 'bg-amber-500' },
  slate: { icon: 'bg-slate-100 text-slate-700 ring-slate-200', accent: 'bg-slate-500' },
}

export function Panel({ title, subtitle = '', children, className = '', actions = null }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.04)] ${className}`}>
      {(title || actions) && (
        <header className="flex min-h-16 items-start justify-between gap-4 border-b border-slate-100 px-4 py-3.5 sm:px-5">
          {title ? (
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900">{title}</h3>
              {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
            </div>
          ) : <span />}
          {actions}
        </header>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function KpiCard({ icon: Icon, tone = 'blue', label, value, suffix = '', hint = '' }) {
  const palette = KPI_TONES[tone] || KPI_TONES.blue
  return (
    <article className="group relative min-h-36 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_34px_rgba(15,23,42,0.08)] sm:p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${palette.accent}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold leading-5 text-slate-500">{label}</p>
        {Icon ? <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ${palette.icon}`}><Icon size={16} aria-hidden="true" /></span> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <p className="text-3xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-[2rem]">{value}</p>
        {suffix ? <span className="text-xs font-semibold text-slate-500">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-2 text-[11px] leading-4 text-slate-500">{hint}</p> : null}
    </article>
  )
}
