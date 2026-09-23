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
export const FILTER_FIELDS = ['academicYear', 'region', 'sex', 'nationality', 'heiType', 'city', 'province']
export const FORMATS = ['summary', 'cube', 'dimensions']

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
  const fields = meta.cellFields || []
  if (fields.at(-1) !== 'count' || new Set(fields).size !== fields.length) throw new Error('meta.cellFields must contain unique dimensions followed by count.')
  const dimensionFields = fields.slice(0, -1)
  const sizes = dimensionFields.map((field) => {
    if (!Array.isArray(dimensions[field]) || !dimensions[field].length) throw new Error(`dimensions.${field} must be a non-empty array.`)
    return dimensions[field].length
  })
  const countPosition = fields.length - 1
  let total = 0
  cells.forEach((cell, row) => {
    if (!Array.isArray(cell) || cell.length !== fields.length) throw new Error(`Cell ${row} must have ${fields.length} values.`)
    sizes.forEach((size, position) => {
      if (!Number.isInteger(cell[position]) || cell[position] < 0 || cell[position] >= size) throw new Error(`Cell ${row} has an invalid index at position ${position}.`)
    })
    if (!Number.isInteger(cell[countPosition]) || cell[countPosition] <= 0) throw new Error(`Cell ${row} has an invalid count.`)
    total += cell[countPosition]
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
    const options = dimensions[field] || []
    const index = options.findIndex((option) => String(field === 'city' ? option.name : option).toLowerCase() === value.toLowerCase())
    if (index < 0) throw httpError(400, `Unknown ${field} "${value}". Request format=dimensions for the valid values.`)
    filters[field] = field === 'city' ? options[index].name : options[index]
  }
  return { format, filters }
}

function matchingCells(dataset, filters) {
  const positions = Object.fromEntries(dataset.meta.cellFields.map((field, index) => [field, index]))
  const active = Object.entries(filters).map(([field, value]) => {
    const options = dataset.dimensions[field]
    const indexes = options.flatMap((option, index) => ((field === 'city' ? option.name : option) === value ? [index] : []))
    return [positions[field], new Set(indexes)]
  })
  return dataset.cells.filter((cell) => active.every(([position, indexes]) => indexes.has(cell[position])))
}

function ranked(names, counts) {
  return names
    .map((name, index) => ({ name, count: counts[index] }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

export function summarize(dataset, filters = {}) {
  const { dimensions } = dataset
  const positions = Object.fromEntries(dataset.meta.cellFields.map((field, index) => [field, index]))
  const countPosition = positions.count
  const summaryFields = ['academicYear', 'region', 'sex', 'nationality', 'city']
  const totals = Object.fromEntries(summaryFields.map((field) => [field, new Array(dimensions[field].length).fill(0)]))
  let total = 0
  for (const cell of matchingCells(dataset, filters)) {
    total += cell[countPosition]
    for (const field of summaryFields) totals[field][cell[positions[field]]] += cell[countPosition]
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
    return { ...base, dimensions: { ...filterValues, city: [...new Set(city.map((item) => item.name))].sort() }, cities: city }
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
