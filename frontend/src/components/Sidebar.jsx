import { useEffect, useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react'
import { DASHBOARD_GROUPS, DASHBOARD_VIEWS } from './DashboardShell.jsx'
import chedLogo from '../assets/ched-logo.png'

// The sidebar and phone menu are CHED navy; text and icons on it are white or a muted blue.
function Brand({ compact = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <img src={chedLogo} alt="Commission on Higher Education" width="40" height="40" className="h-10 w-10 shrink-0" />
      {compact ? null : (
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-5 text-white">OSDS Data dashboards</p>
          <p className="text-xs leading-4 text-[#A9B8D6]">Commission on Higher Education</p>
        </div>
      )}
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
      className={`relative flex min-h-11 items-center gap-3 rounded-lg text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold ${collapsed ? 'justify-center' : 'px-3'} ${active ? 'bg-white/10 font-semibold text-white' : 'font-normal text-[#D3DCEE] hover:bg-white/5 hover:text-white'}`}
    >
      {/* The gold bar marks the current page without relying on colour alone: the link
          also carries aria-current and bold text. */}
      {active ? <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r bg-brand-gold" aria-hidden="true" /> : null}
      <Icon size={18} className={`shrink-0 ${active ? 'text-white' : 'text-[#A9B8D6]'}`} aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{view.label}</span>
    </a>
  )
}

// Home first, then each group of dashboards under its heading.
function NavList({ activeView, collapsed = false, onNavigate }) {
  const views = DASHBOARD_VIEWS.filter((view) => !view.hidden || view.id === activeView)
  const link = (view) => <NavLink key={view.id} view={view} active={view.id === activeView} collapsed={collapsed} onNavigate={onNavigate} />
  return (
    <div className="flex flex-col gap-0.5">
      {views.filter((view) => !view.group).map(link)}
      {DASHBOARD_GROUPS.map((group) => {
        const items = views.filter((view) => view.group === group)
        if (!items.length) return null
        return (
          <div key={group} role="group" aria-label={group} className="mt-4 flex flex-col gap-0.5">
            {collapsed
              ? <div className="mx-auto mb-1 h-px w-8 bg-white/15" aria-hidden="true" />
              : <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7F93BA]" aria-hidden="true">{group}</p>}
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
    <aside className={`hidden shrink-0 bg-brand-navy lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col ${collapsed ? 'lg:w-[76px]' : 'lg:w-64'}`}>
      <div className={`shrink-0 pb-4 pt-5 ${collapsed ? 'flex justify-center px-2' : 'px-4'}`}>
        <Brand compact={collapsed} />
      </div>
      <div className={`h-px shrink-0 bg-white/10 ${collapsed ? 'mx-3' : 'mx-4'}`} aria-hidden="true" />
      <nav className={`flex-1 overflow-y-auto pb-4 pt-4 ${collapsed ? 'px-2' : 'px-3'}`} aria-label="Dashboards">
        <NavList activeView={activeView} collapsed={collapsed} />
      </nav>
      <div className={`py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
          title={collapsed ? 'Expand the sidebar' : undefined}
          className={`flex min-h-10 w-full items-center gap-3 rounded-lg text-[13px] text-[#A9B8D6] transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold ${collapsed ? 'justify-center' : 'px-3'}`}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          {collapsed ? null : <span>Collapse sidebar</span>}
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
      <div className="absolute inset-0 bg-slate-950/50" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Dashboards" className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-brand-navy shadow-xl">
        <div className="flex min-h-[68px] items-center justify-between gap-3 border-b border-white/10 pl-4 pr-2">
          <Brand />
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close the dashboard menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-[#D3DCEE] transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold"
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
