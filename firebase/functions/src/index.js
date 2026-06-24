import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { setGlobalOptions } from 'firebase-functions/v2'
import { onRequest } from 'firebase-functions/v2/https'
import { onObjectFinalized } from 'firebase-functions/v2/storage'
import { logger } from 'firebase-functions'
import { getDashboardData } from './dashboard.js'
import { processCsvObject } from './importer.js'

initializeApp()
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

const REGION = process.env.DASHBOARD_FUNCTION_REGION || 'asia-southeast1'
const STORAGE_BUCKET = process.env.DASHBOARD_STORAGE_BUCKET
const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '*').split(',').map((value) => value.trim()).filter(Boolean)

setGlobalOptions({ region: REGION, maxInstances: 20 })

function applyCors(request, response) {
  const origin = request.get('origin')
  if (allowedOrigins.includes('*')) response.set('Access-Control-Allow-Origin', '*')
  else if (origin && allowedOrigins.includes(origin)) {
    response.set('Access-Control-Allow-Origin', origin)
    response.set('Vary', 'Origin')
  }
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

export const dashboardApi = onRequest({ timeoutSeconds: 120, memory: '512MiB', cors: false, invoker: 'public' }, async (request, response) => {
  applyCors(request, response)
  if (request.method === 'OPTIONS') return response.status(204).send('')
  if (request.method === 'GET') return response.json({ ok: true, message: 'SIAP Firebase backend is running.' })
  if (request.method !== 'POST') return response.status(405).json({ ok: false, message: 'Method not allowed.' })

  try {
    const payload = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : request.body || {}
    if (payload.action !== 'dashboardData') return response.status(400).json({ ok: false, message: 'Unsupported action.' })
    const result = await getDashboardData(db, payload)
    response.set('Cache-Control', 'private, no-store')
    return response.json(result)
  } catch (error) {
    logger.error('dashboardApi failed', error)
    return response.status(error.status || 500).json({ ok: false, message: error.message || 'Dashboard backend failed.' })
  }
})

export const processCsvImport = onObjectFinalized({ bucket: STORAGE_BUCKET, timeoutSeconds: 540, memory: '1GiB', maxInstances: 2 }, async (event) => {
  try {
    const bucket = getStorage().bucket(event.data.bucket)
    const result = await processCsvObject({ db, bucket, object: event.data, eventId: event.id })
    logger.info('CSV import finished', result)
  } catch (error) {
    logger.error('CSV import failed', error)
    throw error
  }
})
