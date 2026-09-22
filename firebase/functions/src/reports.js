// Published summary reports (small tables built from CHED report workbooks),
// stored in Firestore and served read-only by the public reportsApi function.
//
// Firestore layout:
//   reports/{reportId}                     { id, title, currentVersion, previousVersion, activatedAt }
//   reports/{reportId}/versions/{version}  { version, report, publishedAt }

export const REPORTS_COLLECTION = 'reports'
export const REPORT_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const CACHE_TTL_MS = 60 * 1000

let listCache = { reports: null, checkedAt: 0 }
const reportCache = new Map()

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export function validateReport(report) {
  if (!report || !REPORT_ID_PATTERN.test(report.id || '')) throw new Error('Report must have an id of lowercase letters, digits, and hyphens.')
  if (!report.title) throw new Error('Report must have a title.')
  if (!Array.isArray(report.tables) || !report.tables.length) throw new Error('Report must have at least one table.')
  for (const table of report.tables) {
    if (!table.key || !Array.isArray(table.columns) || !table.columns.length || !Array.isArray(table.rows) || !table.rows.length) {
      throw new Error(`Table ${table.key || '(no key)'} must have a key, columns, and rows.`)
    }
    const keys = table.columns.map((column) => column.key)
    table.rows.forEach((row, index) => {
      if (!row.label) throw new Error(`Table ${table.key} row ${index} has no label.`)
      for (const key of keys) {
        if (!Number.isFinite(row.values?.[key])) throw new Error(`Table ${table.key} row "${row.label}" has no number for ${key}.`)
      }
    })
  }
  return report
}

function isoDate(value) {
  return value?.toDate ? value.toDate().toISOString() : value || null
}

export async function listReports(db) {
  if (listCache.reports && Date.now() - listCache.checkedAt < CACHE_TTL_MS) return listCache.reports
  const snapshot = await db.collection(REPORTS_COLLECTION).get()
  const reports = snapshot.docs
    .map((doc) => doc.data())
    .filter((report) => report.currentVersion)
    .map((report) => ({ id: report.id, title: report.title, version: report.currentVersion, activatedAt: isoDate(report.activatedAt) }))
    .sort((a, b) => a.title.localeCompare(b.title))
  listCache = { reports, checkedAt: Date.now() }
  return reports
}

export async function getReport(db, id) {
  if (!REPORT_ID_PATTERN.test(id)) throw httpError(400, 'Invalid report id.')
  const cached = reportCache.get(id)
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) return cached.response

  const pointer = await db.doc(`${REPORTS_COLLECTION}/${id}`).get()
  const version = pointer.data()?.currentVersion
  if (!version) throw httpError(404, `No published report with id "${id}". Call without an id to list the available reports.`)
  if (cached?.response.version === version) {
    cached.checkedAt = Date.now()
    return cached.response
  }
  const snapshot = await db.doc(`${REPORTS_COLLECTION}/${id}/versions/${version}`).get()
  if (!snapshot.exists) throw httpError(503, 'The active version of this report is unavailable.')
  const stored = snapshot.data()
  const response = { ok: true, version, publishedAt: isoDate(stored.publishedAt), ...stored.report }
  reportCache.set(id, { response, checkedAt: Date.now() })
  return response
}

export async function getReportsResponse(db, query = {}) {
  const id = String(query.id || '').trim().toLowerCase()
  if (id) return getReport(db, id)
  return { ok: true, reports: await listReports(db) }
}

export function clearReportsCache() {
  listCache = { reports: null, checkedAt: 0 }
  reportCache.clear()
}
