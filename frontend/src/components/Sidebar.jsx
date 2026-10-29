import { useEffect, useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { DASHBOARD_GROUPS, DASHBOARD_VIEWS } from './DashboardShell.jsx'

// One line: the page header already names the commission (or the dashboard's group).
function Brand({ compact = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-[#102a43] text-xs font-black tracking-wide text-white">CHED</span>
      {compact ? null : <span className="truncate text-sm font-bold text-slate-950">Data dashboards</span>}
    </div>
  )
}

function NavLink({ view, active, collapsed, onNavigate }) {
  const Icon = view.icon
  return (
    <a
      href={view.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? view.label : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-lg text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${collapsed ? 'justify-center' : 'px-3'} ${active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'}`}
    >
      <Icon size={18} className="shrink-0" aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{view.label}</span>
    </a>
  )
}

// Home first, then each group of dashboards under its heading.
function NavList({ activeView, collapsed = false, onNavigate }) {
  const views = DASHBOARD_VIEWS.filter((view) => !view.hidden || view.id === activeView)
  const link = (view) => <NavLink key={view.id} view={view} active={view.id === activeView} collapsed={collapsed} onNavigate={onNavigate} />
  return (
    <div className="flex flex-col gap-1">
      {views.filter((view) => !view.group).map(link)}
      {DASHBOARD_GROUPS.map((group) => {
        const items = views.filter((view) => view.group === group)
        if (!items.length) return null
        return (
          <div key={group} role="group" aria-label={group} className="mt-4 flex flex-col gap-1">
            {collapsed
              ? <div className="mx-auto mb-1 h-px w-8 bg-slate-200" aria-hidden="true" />
              : <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500" aria-hidden="true">{group}</p>}
            {items.map(link)}
          </div>
        )
      })}
    </div>
  )
}

// Desktop: a column beside the page that stays in view while the page scrolls. It can
// collapse to a strip of icons to give charts more width.
export function Sidebar({ activeView, collapsed, onToggleCollapsed }) {
  return (
    <aside className={`hidden shrink-0 border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${collapsed ? 'lg:w-[76px]' : 'lg:w-60'}`}>
      {/* No divider here: the page header's bottom line sits at a different height on each
          page, and two lines that don't meet read as misaligned. The brand row matches the
          header's title row (20px top padding, 44px row) so the two line up across the top. */}
      <div className={`flex h-[68px] shrink-0 items-start pt-5 ${collapsed ? 'justify-center' : 'px-4'}`}>
        <div className="flex h-11 items-center"><Brand compact={collapsed} /></div>
      </div>
      <nav className={`flex-1 overflow-y-auto pb-4 pt-6 ${collapsed ? 'px-2' : 'px-3'}`} aria-label="Dashboards">
        <NavList activeView={activeView} collapsed={collapsed} />
      </nav>
      <div className={`border-t border-slate-200 py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          title={collapsed ? 'Expand the sidebar' : undefined}
          className={`flex min-h-10 w-full items-center gap-3 rounded-lg text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${collapsed ? 'justify-center' : 'px-3'}`}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}

// Phones and tablets: the same list in a panel that slides over the page from the
// header's menu button. Escape, the close button, the backdrop, or picking a
// dashboard closes it, and focus returns to where it was.
export function MobileMenu({ activeView, open, onClose }) {
  const closeButton = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  // z-index above Leaflet's map controls (1000), which share the page's stacking context.
  return (
    <div className="fixed inset-0 z-[1100] lg:hidden">
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Dashboards" className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-xl">
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200 pl-4 pr-2">
          <Brand />
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close the dashboard menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Dashboards">
          <NavList activeView={activeView} onNavigate={onClose} />
        </nav>
      </div>
    </div>
  )
}
