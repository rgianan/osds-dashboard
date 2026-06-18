export function Panel({ title, children, className = '', actions = null }) {
  return (
    <section className={`rounded-2xl border border-slate-300 bg-white shadow-panel ${className}`}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between border-b border-slate-200 px-4 py-2">
          {title ? <h2 className="text-sm font-extrabold uppercase tracking-tight text-slate-800">{title}</h2> : <span />}
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function KpiCard({ label, value, suffix = '', hint = '' }) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-panel">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-3 flex items-end gap-2">
        <p className="text-5xl font-black tracking-tight text-slate-950">{value}</p>
        {suffix ? <span className="mb-2 text-sm font-semibold text-slate-500">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}
