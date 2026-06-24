import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalFilterKey, createFilterKeys, networkDaysInclusive, normalizeCsvRecord, resolveHeaders } from '../src/schema.js'

const headers = [
  'SIAP ENDORSEMENT No', 'Region', 'Sex', 'Full Name of HEI', 'Type Of HEI',
  'Full Title of the Program Enrolled In', 'Name of Foreign Host Establishment or Organization (FHE/O)',
  'Country', 'Date of CHED Endorsement to the Bureau of Immigration (BI)', 'Start of Internship', 'End of Internship',
]

test('resolves required SIAP headers', () => {
  const resolved = resolveHeaders(headers)
  assert.equal(resolved.endorsementNo, 'SIAP ENDORSEMENT No')
  assert.equal(resolved.endDate, 'End of Internship')
})

test('normalizes a CSV row without retaining intern PII', () => {
  const resolved = resolveHeaders(headers)
  const record = Object.fromEntries(headers.map((header) => [header, '']))
  Object.assign(record, {
    'SIAP ENDORSEMENT No': 'E-001', Region: 'NCR', Sex: 'Female', 'Full Name of HEI': 'Sample HEI',
    'Type Of HEI': 'Public', 'Full Title of the Program Enrolled In': 'IT',
    'Name of Foreign Host Establishment or Organization (FHE/O)': 'Sample Host', Country: 'Singapore',
    'Date of CHED Endorsement to the Bureau of Immigration (BI)': '2026-01-05',
    'Start of Internship': '2026-01-12', 'End of Internship': '2026-02-06',
  })
  const row = normalizeCsvRecord(record, resolved, 2)
  assert.equal(row.filterYear, '2026')
  assert.equal(row.filterQuarter, 'Q1')
  assert.equal(row.leadTimeDays, 7)
  assert.equal(row.durationWorkHours, 160)
  assert.ok(row.filterKeys.includes('year=2026|country=Singapore'))
  assert.equal('firstName' in row, false)
  assert.equal('lastName' in row, false)
})

test('uses one canonical array index key for any filter combination', () => {
  const values = { year: '2026', quarter: 'Q1', country: 'Singapore', region: 'NCR', sex: 'Female' }
  const keys = createFilterKeys(values)
  assert.equal(keys.length, 32)
  assert.ok(keys.includes(canonicalFilterKey({ year: '2026', region: 'NCR', sex: 'Female' })))
})

test('constant-time weekday calculation matches inclusive weekdays', () => {
  assert.equal(networkDaysInclusive(new Date('2026-01-12T12:00:00Z'), new Date('2026-01-16T12:00:00Z')), 5)
  assert.equal(networkDaysInclusive(new Date('2026-01-17T12:00:00Z'), new Date('2026-01-18T12:00:00Z')), 0)
})
