import test from 'node:test'
import assert from 'node:assert/strict'
import { siapRequest, getSiapResponse } from '../src/siap.js'

test('SIAP GET defaults to overview with available filter options', () => {
  assert.deepEqual(siapRequest(), {
    section: 'overview', includeOptions: true,
    filters: { year: '', quarter: '', country: '', region: '', sex: '' },
  })
  assert.equal(siapRequest({ section: 'HEI', year: '2026', country: ' Japan ' }).filters.country, 'Japan')
})

test('SIAP GET rejects unknown sections, row exports, nested and repeated parameters', () => {
  for (const query of [{ section: 'interns' }, { format: 'raw' }, { sex: ['Male', 'Female'] }, { country: { value: 'Japan' } }, { year: '1'.repeat(121) }]) {
    assert.throws(() => siapRequest(query), { status: 400 })
  }
})

test('SIAP GET reports missing active data without returning records', async () => {
  const db = { doc: () => ({ get: async () => ({ data: () => ({}) }) }) }
  await assert.rejects(getSiapResponse(db, {}), { status: 503 })
})
