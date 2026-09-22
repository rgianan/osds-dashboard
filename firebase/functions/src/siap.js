import { DASHBOARD_SECTIONS, getDashboardData } from './dashboard.js'

const FILTERS = ['year', 'quarter', 'country', 'region', 'sex']

export function siapRequest(query = {}) {
  const allowed = ['section', ...FILTERS]
  for (const [key, value] of Object.entries(query)) {
    if (!allowed.includes(key) || typeof value !== 'string' || value.length > 120) {
      throw Object.assign(new Error(`Unsupported query parameter: ${key}.`), { status: 400 })
    }
  }
  const section = (query.section || 'overview').trim().toLowerCase()
  if (!DASHBOARD_SECTIONS.includes(section)) {
    throw Object.assign(new Error(`Use section=${DASHBOARD_SECTIONS.join('|')}.`), { status: 400 })
  }
  return {
    section,
    filters: Object.fromEntries(FILTERS.map((field) => [field, (query[field] || '').trim()])),
    includeOptions: true,
  }
}

export function getSiapResponse(db, query) {
  return getDashboardData(db, siapRequest(query))
}
