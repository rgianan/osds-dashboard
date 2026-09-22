import test from 'node:test'
import assert from 'node:assert/strict'
import { clearReportsCache, getReportsResponse, validateReport } from '../src/reports.js'

const report = {
  id: 'tosf-increase',
  title: 'Tuition and Other School Fees (TOSF) Increase',
  academicYear: '2026-2027',
  tables: [{
    key: 'applications',
    columns: [{ key: 'applicationsReceived', label: 'No. of Applications received by CHEDRO' }],
    rows: [{ label: '01 - Ilocos Region', values: { applicationsReceived: 30 } }],
    totals: { applicationsReceived: 30 },
  }],
}

// Minimal stand-in for the Firestore Admin SDK calls reports.js makes.
function fakeDb(docs) {
  const snapshot = (path) => ({ exists: path in docs, data: () => docs[path] })
  return {
    doc: (path) => ({ get: async () => snapshot(path) }),
    collection: (name) => ({
      get: async () => ({ docs: Object.keys(docs).filter((path) => path.split('/').length === 2 && path.startsWith(`${name}/`)).map(snapshot) }),
    }),
  }
}

const db = fakeDb({
  'reports/tosf-increase': { id: 'tosf-increase', title: report.title, currentVersion: 'v-1', activatedAt: '2026-09-22T00:00:00.000Z' },
  'reports/tosf-increase/versions/v-1': { version: 'v-1', report, publishedAt: '2026-09-22T00:00:00.000Z' },
})

test('validates report structure', () => {
  assert.equal(validateReport(report), report)
  assert.throws(() => validateReport({ ...report, id: 'Bad Id' }), /id/)
  const missingValue = { ...report, tables: [{ ...report.tables[0], rows: [{ label: 'X', values: {} }] }] }
  assert.throws(() => validateReport(missingValue), /no number/)
})

test('lists published reports and returns one by id', async () => {
  clearReportsCache()
  const list = await getReportsResponse(db, {})
  assert.deepEqual(list.reports.map((item) => item.id), ['tosf-increase'])
  const one = await getReportsResponse(db, { id: 'TOSF-Increase' })
  assert.equal(one.version, 'v-1')
  assert.equal(one.tables[0].rows[0].values.applicationsReceived, 30)
})

test('rejects unknown and malformed ids', async () => {
  clearReportsCache()
  await assert.rejects(getReportsResponse(db, { id: 'missing-report' }), (error) => error.status === 404)
  await assert.rejects(getReportsResponse(db, { id: '../config' }), (error) => error.status === 400)
})
