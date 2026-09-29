import test from 'node:test'
import assert from 'node:assert/strict'
import { buildResponse, parseQuery, summarize, validateDataset } from '../src/foreign-students.js'

const dataset = {
  meta: { generatedAt: '2026-09-22T00:00:00+00:00', totalRecords: 10, cellFields: ['academicYear', 'region', 'sex', 'nationality', 'heiType', 'city', 'province', 'hei', 'count'] },
  dimensions: {
    academicYear: ['2023-2024', '2024-2025'],
    region: ['07 - CENTRAL VISAYAS', '11 - DAVAO REGION'],
    sex: ['Female', 'Male'],
    nationality: ['Chinese', 'Indian'],
    heiType: ['Private', 'Public'],
    province: ['Cebu', 'Davao del Sur'],
    city: [
      { name: 'Cebu City', province: 'Cebu', lat: 10.3, lng: 123.9 },
      { name: 'Davao City', province: 'Davao del Sur', lat: 7.1, lng: 125.6 },
    ],
    hei: [
      { code: '07001', name: 'Cebu Doctors University' },
      { code: '07002', name: 'University of San Carlos' },
      { code: '11001', name: 'Ateneo de Davao University' },
      { code: 'Not specified', name: 'Not specified' },
    ],
  },
  // [academicYear, region, sex, nationality, heiType, city, province, hei, count]
  cells: [
    [1, 1, 1, 1, 0, 1, 1, 2, 4],
    [1, 1, 0, 1, 0, 1, 1, 2, 2],
    [0, 0, 0, 0, 1, 0, 0, 0, 3],
    [1, 0, 1, 0, 1, 0, 0, 1, 1],
  ],
}

test('validates cell shape and totals', () => {
  assert.equal(validateDataset(dataset), 10)
  assert.throws(() => validateDataset({ ...dataset, cells: [[0, 0, 0, 0, 9, 0, 0, 0, 1]] }), /invalid index/)
  assert.throws(() => validateDataset({ ...dataset, meta: { ...dataset.meta, totalRecords: 11 } }), /add up to 10/)
})

test('summarizes with filters', () => {
  const all = summarize(dataset)
  assert.equal(all.total, 10)
  assert.deepEqual(all.byNationality, [{ name: 'Indian', count: 6 }, { name: 'Chinese', count: 4 }])
  const filtered = summarize(dataset, { academicYear: '2024-2025', nationality: 'Indian' })
  assert.equal(filtered.total, 6)
  assert.deepEqual(filtered.bySex, [{ name: 'Male', count: 4 }, { name: 'Female', count: 2 }])
  assert.equal(filtered.byCity[0].name, 'Davao City')
})

test('counts distinct HEIs, and reports none for datasets without HEI codes', () => {
  assert.equal(summarize(dataset).heiCount, 3)
  assert.equal(summarize(dataset, { academicYear: '2024-2025', nationality: 'Indian' }).heiCount, 1)
  const unspecified = { ...dataset, cells: [[0, 0, 0, 0, 0, 0, 0, 3, 10]] }
  assert.equal(summarize(unspecified).heiCount, 0)
  const codesOnly = { ...dataset, dimensions: { ...dataset.dimensions, hei: dataset.dimensions.hei.map((hei) => hei.code) } }
  assert.equal(summarize(codesOnly).heiCount, 3)
  const legacy = {
    ...dataset,
    meta: { ...dataset.meta, cellFields: dataset.meta.cellFields.filter((field) => field !== 'hei') },
    cells: dataset.cells.map((cell) => [...cell.slice(0, 7), cell[8]]),
  }
  assert.equal(summarize(legacy).heiCount, null)
})

test('accepts case-insensitive filter values and rejects unknown ones', () => {
  assert.deepEqual(parseQuery({ nationality: 'indian' }, dataset.dimensions).filters, { nationality: 'Indian' })
  assert.deepEqual(parseQuery({ heiType: 'private', city: 'davao city', province: 'davao del sur' }, dataset.dimensions).filters,
    { heiType: 'Private', city: 'Davao City', province: 'Davao del Sur' })
  assert.throws(() => parseQuery({ nationality: 'Martian' }, dataset.dimensions), (error) => error.status === 400)
  assert.throws(() => parseQuery({ format: 'csv' }, dataset.dimensions), (error) => error.status === 400)
})

test('builds cube and dimensions responses', () => {
  const cube = buildResponse(dataset, 'fs-test', { format: 'cube', sex: 'Female' })
  assert.equal(cube.cells.length, 2)
  const dimensions = buildResponse(dataset, 'fs-test', { format: 'dimensions' })
  assert.deepEqual(dimensions.dimensions.sex, ['Female', 'Male'])
  assert.equal(dimensions.cities.length, 2)
  assert.deepEqual(dimensions.dimensions.hei, ['Ateneo de Davao University', 'Cebu Doctors University', 'University of San Carlos'])
  assert.equal(dimensions.heis.length, 3)
})

test('filters by HEI name or institution code', () => {
  assert.deepEqual(parseQuery({ hei: 'ateneo de davao university' }, dataset.dimensions).filters, { hei: 'Ateneo de Davao University' })
  assert.deepEqual(parseQuery({ hei: '11001' }, dataset.dimensions).filters, { hei: 'Ateneo de Davao University' })
  const byHei = summarize(dataset, { hei: 'Ateneo de Davao University' })
  assert.equal(byHei.total, 6)
  assert.equal(byHei.heiCount, 1)
  assert.throws(() => parseQuery({ hei: 'Hogwarts' }, dataset.dimensions), (error) => error.status === 400)
})
