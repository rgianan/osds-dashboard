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

// One neutral style for every metric card: color is reserved for the charts, where it
// carries meaning. The cards are not clickable, so they have no hover effect.
// aside: a small visual beside the number, such as a trend.
export function KpiCard({ icon: Icon, label, value, suffix = '', hint = '', aside = null }) {
  return (
    <article className="min-h-36 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold leading-5 text-slate-600">{label}</p>
        {Icon ? <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon size={16} aria-hidden="true" /></span> : null}
      </div>
      <div className="mt-3 flex items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <p className="text-3xl font-bold tracking-tight text-slate-950 tabular-nums sm:text-[2rem]">{value}</p>
          {suffix ? <span className="text-xs font-semibold text-slate-600">{suffix}</span> : null}
        </div>
        {aside}
      </div>
      {hint ? <p className="mt-2 text-xs leading-4 text-slate-500">{hint}</p> : null}
    </article>
  )
}
