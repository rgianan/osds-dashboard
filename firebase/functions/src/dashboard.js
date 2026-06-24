import { createHash } from 'node:crypto'
import { Timestamp } from 'firebase-admin/firestore'
import { buildOptions, buildSection } from './aggregate.js'
import { canonicalFilterKey, normalizeFilters } from './schema.js'

export const DASHBOARD_SECTIONS = ['overview', 'timeline', 'hei', 'geography']
const CACHE_SECONDS = Math.max(60, Number(process.env.DASHBOARD_CACHE_SECONDS || 3600))
const MEMORY_CACHE_LIMIT = 100
const memoryCache = new Map()

const SECTION_FIELDS = {
  overview: ['endorsementNo', 'region', 'country', 'program', 'startDayMs', 'endDayMs', 'leadTimeDays', 'durationWorkHours', 'endorsementYearMonth'],
  timeline: ['endorsementNo', 'country', 'endDayMs', 'durationWorkHours', 'startYearMonth', 'endYearMonth'],
  hei: ['endorsementNo', 'region', 'sex', 'hei', 'typeOfHei', 'country', 'host'],
  geography: ['endorsementNo', 'country', 'host', 'fromCity', 'toCity', 'originLat', 'originLng', 'destLat', 'destLng'],
}

function cacheId(section, filters, includeOptions) {
  return createHash('sha256').update(JSON.stringify({ section, filters, includeOptions })).digest('hex')
}

function formattedTimestamp(value) {
  const date = value?.toDate ? value.toDate() : value instanceof Date ? value : new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replace(',', '')
}

function validateFilters(filters, options = {}) {
  const allowed = {
    year: options.years || [],
    quarter: ['Q1', 'Q2', 'Q3', 'Q4'],
    country: options.countries || [],
    region: options.regions || [],
    sex: options.sexes || [],
  }
  for (const [field, value] of Object.entries(filters)) {
    if (value && !allowed[field]?.includes(value)) {
      const error = new Error(`Unsupported ${field} filter.`)
      error.status = 400
      throw error
    }
  }
}

function memoryGet(key) {
  const value = memoryCache.get(key)
  if (!value || value.expiresAt <= Date.now()) {
    memoryCache.delete(key)
    return null
  }
  memoryCache.delete(key)
  memoryCache.set(key, value)
  return value.payload
}

function memorySet(key, payload) {
  memoryCache.set(key, { payload, expiresAt: Date.now() + CACHE_SECONDS * 1000 })
  while (memoryCache.size > MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value)
}

async function readCachedPayload(cacheRef) {
  const snapshot = await cacheRef.get()
  if (!snapshot.exists) return null
  const data = snapshot.data()
  if (!data.expiresAt || data.expiresAt.toMillis() <= Date.now()) return null
  return data.payload || null
}

export async function writeCachedPayload(datasetRef, section, filters, includeOptions, payload) {
  const id = cacheId(section, filters, includeOptions)
  await datasetRef.collection('cache').doc(id).set({
    payload,
    section,
    filterKey: canonicalFilterKey(filters),
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() + CACHE_SECONDS * 1000),
  })
  memorySet(`${datasetRef.id}:${id}`, payload)
}

export async function buildAndCachePayload(datasetRef, dataset, section, filters, includeOptions, rows) {
  const payload = {
    ok: true,
    section,
    filters,
    dataVersion: datasetRef.id,
    lastUpdatedAt: formattedTimestamp(dataset.activatedAt || dataset.importedAt),
    [section]: buildSection(section, rows),
  }
  if (includeOptions) payload.options = dataset.options || buildOptions(rows)
  await writeCachedPayload(datasetRef, section, filters, includeOptions, payload)
  return payload
}

export async function getDashboardData(db, request) {
  const startedAt = Date.now()
  const section = String(request.section || 'overview').toLowerCase()
  if (!DASHBOARD_SECTIONS.includes(section)) throw new Error('Unsupported dashboard section.')
  const filters = normalizeFilters(request.filters || {})
  const includeOptions = request.includeOptions === true

  const configSnapshot = await db.doc('config/dashboard').get()
  const currentVersion = configSnapshot.data()?.currentVersion
  if (!currentVersion) {
    const error = new Error('No Firebase dataset is active. Import and activate a CSV dataset first.')
    error.status = 503
    throw error
  }

  const datasetRef = db.doc(`datasets/${currentVersion}`)
  const datasetSnapshot = await datasetRef.get()
  if (!datasetSnapshot.exists || datasetSnapshot.data()?.status !== 'active') {
    const error = new Error('The active Firebase dataset is unavailable.')
    error.status = 503
    throw error
  }
  const dataset = datasetSnapshot.data()
  validateFilters(filters, dataset.options)
  const id = cacheId(section, filters, includeOptions)
  const memoryKey = `${currentVersion}:${id}`

  const inMemory = memoryGet(memoryKey)
  if (inMemory) return { ...inMemory, cacheHit: 'memory', serverElapsedMs: Date.now() - startedAt }

  const cacheRef = datasetRef.collection('cache').doc(id)
  const cached = await readCachedPayload(cacheRef)
  if (cached) {
    memorySet(memoryKey, cached)
    return { ...cached, cacheHit: 'firestore', serverElapsedMs: Date.now() - startedAt }
  }

  let query = datasetRef.collection('interns').where('filterKeys', 'array-contains', canonicalFilterKey(filters))
  const fields = SECTION_FIELDS[section]
  if (fields?.length) query = query.select(...fields)
  const rowsSnapshot = await query.get()
  const rows = rowsSnapshot.docs.map((document) => document.data())
  const payload = await buildAndCachePayload(datasetRef, dataset, section, filters, includeOptions, rows)
  return { ...payload, cacheHit: false, serverElapsedMs: Date.now() - startedAt }
}

export function clearMemoryCache() {
  memoryCache.clear()
}
