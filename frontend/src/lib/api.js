export const FIREBASE_API_URL = import.meta.env.VITE_FIREBASE_API_URL || ''
export const GAS_API_URL = import.meta.env.VITE_GAS_WEB_APP_URL || ''
export const API_URL = FIREBASE_API_URL || GAS_API_URL
export const DASHBOARD_TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN || ''
const DASHBOARD_API_PATH = /\/dashboardApi\/?$/
// The public read-only functions are deployed next to dashboardApi in the same Firebase project.
function siblingFunctionUrl(name) {
  return DASHBOARD_API_PATH.test(FIREBASE_API_URL) ? FIREBASE_API_URL.replace(DASHBOARD_API_PATH, `/${name}`) : ''
}
export const FOREIGN_STUDENTS_API_URL = import.meta.env.VITE_FOREIGN_STUDENTS_API_URL || siblingFunctionUrl('foreignStudentsApi')
export const REPORTS_API_URL = import.meta.env.VITE_REPORTS_API_URL || siblingFunctionUrl('reportsApi')
const RETRY_DELAYS_MS = [1500, 4000]

const inFlightRequests = new Map()

function configurationError() {
  if (!API_URL) return 'Missing backend URL. Set VITE_FIREBASE_API_URL or VITE_GAS_WEB_APP_URL in Netlify or .env.local.'
  if (!FIREBASE_API_URL && /YOUR_DEPLOYMENT_ID/i.test(API_URL)) return 'VITE_GAS_WEB_APP_URL still contains the example deployment ID. Replace it with the deployed Google Apps Script /exec URL.'
  return ''
}

export async function postJson(payload) {
  const configError = configurationError()
  if (configError) throw new Error(configError)

  const body = JSON.stringify({ ...payload, dashboardToken: DASHBOARD_TOKEN })
  if (inFlightRequests.has(body)) return inFlightRequests.get(body)

  const request = (async () => {
    let res
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
      })
    } catch {
      throw new Error('Could not reach the dashboard backend. Verify the configured Firebase or Apps Script URL, allowed origin, and network connection.')
    }

    if (!res.ok) throw new Error(`Dashboard request failed with HTTP ${res.status}.`)

    const text = await res.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('The dashboard backend returned an invalid JSON response.')
    }

    if (!data || typeof data !== 'object') throw new Error('The dashboard backend returned an invalid response.')
    if (data.ok !== true) throw new Error(data.message || 'Dashboard backend failed.')
    return data
  })()

  inFlightRequests.set(body, request)
  try {
    return await request
  } finally {
    if (inFlightRequests.get(body) === request) inFlightRequests.delete(body)
  }
}

// GET a JSON response with { ok: true }. Network failures and 429/5xx responses
// are retried, since Cloud Run can briefly reject requests while an instance starts.
async function getJsonWithRetry(url) {
  for (let attempt = 0; ; attempt++) {
    let permanent = false
    try {
      const res = await fetch(url)
      const data = await res.json().catch(() => null)
      if (res.ok && data?.ok) return data
      permanent = res.status >= 400 && res.status < 500 && res.status !== 429
      throw new Error(data?.message || `Request failed with HTTP ${res.status}.`)
    } catch (error) {
      if (permanent || attempt >= RETRY_DELAYS_MS.length) throw error
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
    }
  }
}

// Loads every foreign-students count once; the page filters in the browser.
export function getForeignStudentsCube() {
  if (!FOREIGN_STUDENTS_API_URL) return Promise.reject(new Error('Missing foreign students API URL. Set VITE_FOREIGN_STUDENTS_API_URL or VITE_FIREBASE_API_URL.'))
  return getJsonWithRetry(`${FOREIGN_STUDENTS_API_URL}?format=cube`)
}

export function getReport(id) {
  if (!REPORTS_API_URL) return Promise.reject(new Error('Missing reports API URL. Set VITE_REPORTS_API_URL or VITE_FIREBASE_API_URL.'))
  return getJsonWithRetry(`${REPORTS_API_URL}?id=${encodeURIComponent(id)}`)
}
