export const API_URL = import.meta.env.VITE_GAS_WEB_APP_URL || ''
export const DASHBOARD_TOKEN = import.meta.env.VITE_DASHBOARD_TOKEN || ''

export async function postJson(payload) {
  if (!API_URL) throw new Error('Missing VITE_GAS_WEB_APP_URL. Set it in Netlify environment variables or .env.local.')
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...payload, dashboardToken: DASHBOARD_TOKEN }),
  })
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch (err) { throw new Error(`Invalid backend response: ${text.slice(0, 180)}`) }
  if (!data.ok) throw new Error(data.message || 'Dashboard backend failed.')
  return data
}
