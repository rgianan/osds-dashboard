const DAY_MS = 86400000
const DASHBOARD_TZ = 'Asia/Manila'
const DIMENSION_ORDER = ['year', 'quarter', 'country', 'region', 'sex']

export const HEADER_ALIASES = {
  endorsementNo: ['SIAP ENDORSEMENT No', 'Endorsement No', 'Endorsement Number'],
  region: ['Region'],
  sex: ['Sex', 'Gender'],
  hei: ['Full Name of HEI', 'HEI', 'Higher Education Institution'],
  typeOfHei: ['Type Of HEI', 'Type of HEI', 'HEI Type'],
  program: ['Full Title of the Program Enrolled In', 'Program', 'Program Enrolled In'],
  host: ['Name of Foreign Host Establishment or Organization (FHE/O)', 'Host Organization', 'Foreign Host Organization'],
  country: ['Country', 'Destination Country'],
  endorsementDate: ['Date of CHED Endorsement to the Bureau of Immigration (BI)', 'Endorsement Date'],
  startDate: ['Start of Internship', 'Internship Start Date'],
  endDate: ['End of Internship', 'Internship End Date'],
  fromCity: ['from City', 'From City', 'Origin City'],
  toCity: ['to City', 'To City', 'Destination City'],
  originLat: ['Origin Latitude'],
  originLng: ['Origin Longitude'],
  destLat: ['Destination Latitude'],
  destLng: ['Destination Longitude'],
  pathKey: ['Path Key'],
  pathId: ['Path ID'],
  odKey: ['Path ID (OD)'],
}

const REQUIRED_HEADERS = ['endorsementNo', 'region', 'sex', 'hei', 'typeOfHei', 'program', 'host', 'country', 'endorsementDate', 'startDate', 'endDate']

function normalizedHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function clean(value, limit = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function resolveHeaders(headers) {
  const sourceByAlias = new Map(headers.map((header) => [normalizedHeader(header), header]))
  const resolved = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const source = aliases.map((alias) => sourceByAlias.get(normalizedHeader(alias))).find(Boolean)
    if (source) resolved[field] = source
  }
  const missing = REQUIRED_HEADERS.filter((field) => !resolved[field])
  if (missing.length) {
    const readable = missing.map((field) => HEADER_ALIASES[field][0])
    throw new Error(`Missing required CSV columns: ${readable.join(', ')}`)
  }
  return resolved
}

function dateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  return Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
}

export function parseDate(value, fieldName = 'date') {
  if (value == null || String(value).trim() === '') return null
  const text = String(value).trim()
  let date

  if (/^\d+(\.\d+)?$/.test(text) && Number(text) > 10000 && Number(text) < 100000) {
    date = new Date(Date.UTC(1899, 11, 30) + Number(text) * DAY_MS)
  } else {
    const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
    const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (iso) date = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12))
    else if (us) date = new Date(Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]), 12))
    else date = new Date(text)
  }

  if (!date || Number.isNaN(date.getTime())) throw new Error(`Invalid ${fieldName}: ${text}`)
  return date
}

function dayMs(date) {
  if (!date) return null
  const { year, month, day } = dateParts(date)
  return Date.UTC(year, month - 1, day)
}

function yearMonth(date) {
  if (!date) return ''
  const { year, month } = dateParts(date)
  return `${year}-${String(month).padStart(2, '0')}`
}

function quarter(month) {
  return `Q${Math.ceil(month / 3)}`
}

export function networkDaysInclusive(startDate, endDate) {
  const start = dayMs(startDate)
  const end = dayMs(endDate)
  if (start == null || end == null || end < start) return 0
  const totalDays = Math.round((end - start) / DAY_MS) + 1
  const fullWeeks = Math.floor(totalDays / 7)
  const remainder = totalDays % 7
  const sundayBased = new Date(start).getUTCDay()
  const startWeekday = (sundayBased + 6) % 7
  const weekdaysBeforeWeekend = Math.max(0, 5 - startWeekday)
  const firstWeek = Math.min(remainder, weekdaysBeforeWeekend)
  const wrappedWeek = Math.max(0, startWeekday + remainder - 7)
  return fullWeeks * 5 + firstWeek + wrappedWeek
}

function numberOrNull(value, min, max) {
  if (value == null || String(value).trim() === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= min && number <= max ? number : null
}

function filterPart(field, value) {
  return `${field}=${encodeURIComponent(String(value))}`
}

export function canonicalFilterKey(filters = {}) {
  const parts = DIMENSION_ORDER.filter((field) => filters[field]).map((field) => filterPart(field, filters[field]))
  return parts.length ? parts.join('|') : 'all'
}

export function createFilterKeys(values) {
  const dimensions = DIMENSION_ORDER.map((field) => [field, values[field]]).filter(([, value]) => value)
  const keys = new Set(['all'])
  const combinations = 1 << dimensions.length
  for (let mask = 1; mask < combinations; mask++) {
    const selected = {}
    dimensions.forEach(([field, value], index) => { if (mask & (1 << index)) selected[field] = value })
    keys.add(canonicalFilterKey(selected))
  }
  return [...keys]
}

export function normalizeFilters(filters = {}) {
  return Object.fromEntries(DIMENSION_ORDER.map((field) => [field, clean(filters[field], 120)]))
}

export function normalizeCsvRecord(record, headers, rowNumber) {
  const value = (field) => headers[field] ? record[headers[field]] : ''
  let endorsementDate
  let startDate
  let endDate
  try {
    endorsementDate = parseDate(value('endorsementDate'), 'endorsement date')
    startDate = parseDate(value('startDate'), 'internship start date')
    endDate = parseDate(value('endDate'), 'internship end date')
  } catch (error) {
    throw new Error(`Row ${rowNumber}: ${error.message}`)
  }

  const referenceDate = endorsementDate || startDate || endDate
  const referenceParts = referenceDate ? dateParts(referenceDate) : null
  const startDayMs = dayMs(startDate)
  const endDayMs = dayMs(endDate)
  const endorsementDayMs = dayMs(endorsementDate)
  const filterValues = {
    year: referenceParts ? String(referenceParts.year) : '',
    quarter: referenceParts ? quarter(referenceParts.month) : '',
    country: clean(value('country'), 120),
    region: clean(value('region'), 120),
    sex: clean(value('sex'), 80),
  }

  const document = {
    endorsementNo: clean(value('endorsementNo'), 120),
    region: filterValues.region,
    sex: filterValues.sex,
    hei: clean(value('hei')),
    typeOfHei: clean(value('typeOfHei'), 160),
    program: clean(value('program')),
    host: clean(value('host')),
    country: filterValues.country,
    endorsementDate,
    startDate,
    endDate,
    fromCity: clean(value('fromCity'), 160),
    toCity: clean(value('toCity'), 160),
    originLat: numberOrNull(value('originLat'), -90, 90),
    originLng: numberOrNull(value('originLng'), -180, 180),
    destLat: numberOrNull(value('destLat'), -90, 90),
    destLng: numberOrNull(value('destLng'), -180, 180),
    pathKey: clean(value('pathKey'), 200),
    pathId: clean(value('pathId'), 200),
    odKey: clean(value('odKey'), 200),
    filterYear: filterValues.year,
    filterQuarter: filterValues.quarter,
    endorsementYearMonth: endorsementDate ? yearMonth(endorsementDate) : 'Unknown',
    startYearMonth: yearMonth(startDate),
    endYearMonth: yearMonth(endDate),
    startDayMs,
    endDayMs,
    leadTimeDays: endorsementDayMs != null && startDayMs != null ? Math.round((startDayMs - endorsementDayMs) / DAY_MS) : null,
    durationWorkHours: startDate && endDate ? networkDaysInclusive(startDate, endDate) * 8 : null,
  }
  document.filterKeys = createFilterKeys(filterValues)
  return document
}

export const REQUIRED_CSV_HEADERS = REQUIRED_HEADERS.map((field) => HEADER_ALIASES[field][0])
