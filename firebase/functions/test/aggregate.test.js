import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGeography, buildHeiRisk, buildOptions, buildOverview, buildTimeline } from '../src/aggregate.js'

const rows = [
  { endorsementNo: 'E-1', region: 'NCR', country: 'Singapore', program: 'IT', hei: 'HEI A', typeOfHei: 'Public', sex: 'Female', host: 'Host A', filterYear: '2026', endorsementYearMonth: '2026-01', startYearMonth: '2026-02', endYearMonth: '2026-03', leadTimeDays: 7, durationWorkHours: 160, startDayMs: 0, endDayMs: 1, originLat: 14, originLng: 121, destLat: 1, destLng: 104, fromCity: 'Manila', toCity: 'Singapore' },
  { endorsementNo: 'E-1', region: 'NCR', country: 'Singapore', program: 'IT', hei: 'HEI A', typeOfHei: 'Public', sex: 'Male', host: 'Host A', filterYear: '2026', endorsementYearMonth: '2026-01', startYearMonth: '2026-02', endYearMonth: '2026-03', leadTimeDays: 9, durationWorkHours: 200, startDayMs: 0, endDayMs: 1, originLat: 14, originLng: 121, destLat: 1, destLng: 104, fromCity: 'Manila', toCity: 'Singapore' },
  { endorsementNo: 'E-2', region: 'Region VII', country: 'Thailand', program: 'Tourism', hei: 'HEI B', typeOfHei: 'Private', sex: 'Female', host: 'Host B', filterYear: '2025', endorsementYearMonth: '2025-12', startYearMonth: '2026-01', endYearMonth: '2026-04', leadTimeDays: 12, durationWorkHours: 240, startDayMs: 0, endDayMs: 1 },
]

test('builds dashboard aggregates with unique endorsement counts', () => {
  const overview = buildOverview(rows)
  assert.equal(overview.totalInterns, 3)
  assert.equal(overview.totalEndorsements, 2)
  assert.equal(overview.avgLeadTimeDays, 9.33)
  assert.equal(overview.internsByCountry[0].name, 'Singapore')
})

test('builds all section shapes', () => {
  assert.equal(buildTimeline(rows).countrySummary.length, 2)
  assert.equal(buildHeiRisk(rows).table.length, 2)
  assert.equal(buildGeography(rows).routes.length, 1)
  assert.deepEqual(buildOptions(rows).years, ['2026', '2025'])
})
