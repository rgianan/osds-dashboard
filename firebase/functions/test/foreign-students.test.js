import test from 'node:test'
import assert from 'node:assert/strict'
import { buildResponse, parseQuery, summarize, validateDataset } from '../src/foreign-students.js'

const dataset = {
  meta: { generatedAt: '2026-09-22T00:00:00+00:00', totalRecords: 10, cellFields: ['academicYear', 'region', 'sex', 'nationality', 'heiType', 'city', 'province', 'count'] },
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
  },
  // [academicYear, region, sex, nationality, heiType, city, province, count]
  cells: [
    [1, 1, 1, 1, 0, 1, 1, 4],
    [1, 1, 0, 1, 0, 1, 1, 2],
    [0, 0, 0, 0, 1, 0, 0, 3],
    [1, 0, 1, 0, 1, 0, 0, 1],
  ],
}

test('validates cell shape and totals', () => {
  assert.equal(validateDataset(dataset), 10)
  assert.throws(() => validateDataset({ ...dataset, cells: [[0, 0, 0, 0, 9, 0, 0, 1]] }), /invalid index/)
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
})
