export function Panel({ title, subtitle = '', children, className = '', actions = null }) {
  return (
    <section className={`min-w-0 rounded-[14px] border border-line bg-white shadow-card ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 px-4 pt-4 sm:px-5 sm:pt-5">
          {title ? (
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
              {subtitle ? <p className="mt-0.5 text-[13px] leading-5 text-ink-3">{subtitle}</p> : null}
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
    <article className="rounded-xl border border-line bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] leading-5 text-ink-2">{label}</p>
        {Icon ? <Icon size={16} className="mt-0.5 shrink-0 text-brand-blue" aria-hidden="true" /> : null}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <p className="text-[28px] font-bold leading-tight tracking-tight text-ink tabular-nums">{value}</p>
          {suffix ? <span className="text-base text-ink-2">{suffix}</span> : null}
        </div>
        {aside}
      </div>
      {hint ? <p className="mt-1.5 text-xs leading-4 text-ink-3">{hint}</p> : null}
    </article>
  )
}
