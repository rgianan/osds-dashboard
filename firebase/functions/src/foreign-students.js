// Foreign students summary: a versioned counts-only dataset in Firestore, served
// read-only by the public foreignStudentsApi function.
//
// Firestore layout:
//   config/foreignStudents                  { currentVersion, previousVersion, activatedAt, totalRecords }
//   foreignStudentsDatasets/{version}       { version, meta, dimensions, cellsJson, cellCount, totalRecords, publishedAt }
// Cells are stored as a JSON string: Firestore does not allow nested arrays, and a
// string keeps the ~5,000 cells out of the per-document index-entry limit.

export const CONFIG_DOC = 'config/foreignStudents'
export const DATASET_COLLECTION = 'foreignStudentsDatasets'
export const FILTER_FIELDS = ['academicYear', 'region', 'sex', 'nationality']
export const FORMATS = ['summary', 'cube', 'dimensions']

// Position of each field in a cell: [academicYear, region, sex, nationality, city, count]
const CELL_POSITION = { academicYear: 0, region: 1, sex: 2, nationality: 3, city: 4 }
const COUNT = 5
const CONFIG_TTL_MS = 60 * 1000

let cache = { version: null, dataset: null, checkedAt: 0 }

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export function validateDataset(dataset) {
  const { meta, dimensions, cells } = dataset || {}
  if (!meta || !dimensions || !Array.isArray(cells)) throw new Error('Dataset must contain meta, dimensions, and cells.')
  const sizes = FILTER_FIELDS.concat('city').map((field) => {
    if (!Array.isArray(dimensions[field]) || !dimensions[field].length) throw new Error(`dimensions.${field} must be a non-empty array.`)
    return dimensions[field].length
  })
  let total = 0
  cells.forEach((cell, row) => {
    if (!Array.isArray(cell) || cell.length !== 6) throw new Error(`Cell ${row} must have 6 values.`)
    sizes.forEach((size, position) => {
      if (!Number.isInteger(cell[position]) || cell[position] < 0 || cell[position] >= size) throw new Error(`Cell ${row} has an invalid index at position ${position}.`)
    })
    if (!Number.isInteger(cell[COUNT]) || cell[COUNT] <= 0) throw new Error(`Cell ${row} has an invalid count.`)
    total += cell[COUNT]
  })
  if (Number.isFinite(meta.totalRecords) && meta.totalRecords !== total) throw new Error(`Cell counts add up to ${total}, but meta.totalRecords is ${meta.totalRecords}.`)
  return total
}

export function parseQuery(query = {}, dimensions) {
  const format = String(query.format || 'summary').toLowerCase()
  if (!FORMATS.includes(format)) throw httpError(400, `Unsupported format. Use one of: ${FORMATS.join(', ')}.`)
  const filters = {}
  for (const field of FILTER_FIELDS) {
    const value = String(query[field] ?? '').trim()
    if (!value) continue
    const index = dimensions[field].findIndex((option) => option.toLowerCase() === value.toLowerCase())
    if (index < 0) throw httpError(400, `Unknown ${field} "${value}". Request format=dimensions for the valid values.`)
    filters[field] = dimensions[field][index]
  }
  return { format, filters }
}

function matchingCells(dataset, filters) {
  const active = Object.entries(filters).map(([field, value]) => [CELL_POSITION[field], dataset.dimensions[field].indexOf(value)])
  return dataset.cells.filter((cell) => active.every(([position, index]) => cell[position] === index))
}

function ranked(names, counts) {
  return names
    .map((name, index) => ({ name, count: counts[index] }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function summarize(dataset, filters = {}) {
  const { dimensions } = dataset
  const totals = Object.fromEntries(Object.keys(CELL_POSITION).map((field) => [field, new Array(dimensions[field].length).fill(0)]))
  let total = 0
  for (const cell of matchingCells(dataset, filters)) {
    total += cell[COUNT]
    for (const [field, position] of Object.entries(CELL_POSITION)) totals[field][cell[position]] += cell[COUNT]
  }
  return {
    total,
    byAcademicYear: dimensions.academicYear.map((name, index) => ({ name, count: totals.academicYear[index] })).filter((row) => row.count > 0),
    byRegion: ranked(dimensions.region, totals.region),
    bySex: ranked(dimensions.sex, totals.sex),
    byNationality: ranked(dimensions.nationality, totals.nationality),
    byCity: dimensions.city
      .map((city, index) => ({ ...city, count: totals.city[index] }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}

export function buildResponse(dataset, version, query) {
  const { format, filters } = parseQuery(query, dataset.dimensions)
  const base = { ok: true, version, generatedAt: dataset.meta.generatedAt, totalRecords: dataset.meta.totalRecords, countBasis: 'Enrollment records per academic year' }
  if (format === 'dimensions') {
    const { city, ...filterValues } = dataset.dimensions
    return { ...base, dimensions: filterValues, cities: city }
  }
  if (format === 'cube') {
    return { ...base, filters, meta: dataset.meta, dimensions: dataset.dimensions, cells: matchingCells(dataset, filters) }
  }
  return { ...base, filters, ...summarize(dataset, filters) }
}

async function loadActiveDataset(db) {
  const now = Date.now()
  if (cache.dataset && now - cache.checkedAt < CONFIG_TTL_MS) return cache
  const config = await db.doc(CONFIG_DOC).get()
  const version = config.data()?.currentVersion
  if (!version) throw httpError(503, 'No foreign students dataset has been published yet.')
  if (version !== cache.version) {
    const snapshot = await db.doc(`${DATASET_COLLECTION}/${version}`).get()
    if (!snapshot.exists) throw httpError(503, 'The active foreign students dataset is unavailable.')
    const stored = snapshot.data()
    cache = { version, dataset: { meta: stored.meta, dimensions: stored.dimensions, cells: JSON.parse(stored.cellsJson) }, checkedAt: now }
  } else {
    cache.checkedAt = now
  }
  return cache
}

export async function getForeignStudents(db, query) {
  const { version, dataset } = await loadActiveDataset(db)
  return buildResponse(dataset, version, query)
}

export function clearForeignStudentsCache() {
  cache = { version: null, dataset: null, checkedAt: 0 }
}
