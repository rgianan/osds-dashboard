const DAY_MS = 86400000

function top(items, key, limit) {
  return items.sort((a, b) => Number(b[key] || 0) - Number(a[key] || 0) || String(a.name || '').localeCompare(String(b.name || ''))).slice(0, limit || items.length)
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length : 0
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function countUnique(rows, key) {
  return new Set(rows.map((row) => row[key]).filter(Boolean)).size
}

function groupInterns(rows, key, limit) {
  const grouped = new Map()
  for (const row of rows) {
    const name = row[key] || 'Unknown'
    grouped.set(name, (grouped.get(name) || 0) + 1)
  }
  return top([...grouped].map(([name, totalInterns]) => ({ name, totalInterns })), 'totalInterns', limit)
}

function groupEndorsements(rows, key, limit) {
  const grouped = new Map()
  for (const row of rows) {
    const name = row[key] || 'Unknown'
    if (!grouped.has(name)) grouped.set(name, new Set())
    if (row.endorsementNo) grouped.get(name).add(row.endorsementNo)
  }
  return top([...grouped].map(([name, ids]) => ({ name, totalEndorsements: ids.size })), 'totalEndorsements', limit)
}

function endorsementsByMonth(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const month = row.endorsementYearMonth || 'Unknown'
    if (!grouped.has(month)) grouped.set(month, new Set())
    if (row.endorsementNo) grouped.get(month).add(row.endorsementNo)
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([yearMonth, ids]) => ({ yearMonth, totalEndorsements: ids.size }))
}

function todayDayMs() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date())
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]))
  return Date.UTC(values.year, values.month - 1, values.day)
}

function activeInternships(rows) {
  const today = todayDayMs()
  return rows.filter((row) => row.startDayMs != null && row.endDayMs != null && row.startDayMs <= today && row.endDayMs >= today).length
}

export function buildOptions(rows) {
  return {
    years: unique(rows.map((row) => row.filterYear)).sort((a, b) => b.localeCompare(a)),
    countries: unique(rows.map((row) => row.country)).sort((a, b) => a.localeCompare(b)),
    regions: unique(rows.map((row) => row.region)).sort((a, b) => a.localeCompare(b)),
    sexes: unique(rows.map((row) => row.sex)).sort((a, b) => a.localeCompare(b)),
  }
}

export function buildOverview(rows) {
  return {
    totalInterns: rows.length,
    totalEndorsements: countUnique(rows, 'endorsementNo'),
    activeInternshipsToday: activeInternships(rows),
    avgLeadTimeDays: round2(average(rows.map((row) => row.leadTimeDays).filter(Number.isFinite))),
    avgDurationWorkHours: round2(average(rows.map((row) => row.durationWorkHours).filter(Number.isFinite))),
    internsByRegion: groupInterns(rows, 'region', 10),
    internsByCountry: groupInterns(rows, 'country', 10),
    internsByProgram: groupInterns(rows, 'program', 12),
    endorsementsByMonth: endorsementsByMonth(rows),
  }
}

function countrySummary(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const name = row.country || 'Unknown'
    if (!grouped.has(name)) grouped.set(name, { ids: new Set(), totalInterns: 0, durations: [] })
    const value = grouped.get(name)
    value.totalInterns++
    if (row.endorsementNo) value.ids.add(row.endorsementNo)
    if (Number.isFinite(row.durationWorkHours)) value.durations.push(row.durationWorkHours)
  }
  return top([...grouped].map(([name, value]) => ({
    name,
    totalEndorsements: value.ids.size,
    totalInterns: value.totalInterns,
    avgDurationWorkHours: round2(average(value.durations)),
  })), 'totalInterns', 20)
}

function startsEndsByMonth(rows) {
  const grouped = new Map()
  const ensure = (month) => {
    if (!grouped.has(month)) grouped.set(month, { yearMonth: month, internStarts: 0, internEnds: 0 })
    return grouped.get(month)
  }
  for (const row of rows) {
    if (row.startYearMonth) ensure(row.startYearMonth).internStarts++
    if (row.endYearMonth) ensure(row.endYearMonth).internEnds++
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
}

export function buildTimeline(rows) {
  const today = todayDayMs()
  const next30 = today + 30 * DAY_MS
  const next60 = today + 60 * DAY_MS
  return {
    endingNext30Days: rows.filter((row) => row.endDayMs != null && row.endDayMs >= today && row.endDayMs <= next30).length,
    endingNext60Days: rows.filter((row) => row.endDayMs != null && row.endDayMs >= today && row.endDayMs <= next60).length,
    countrySummary: countrySummary(rows),
    startsEndsByMonth: startsEndsByMonth(rows),
  }
}

function endorsementsByHeiCountry(rows, countries) {
  const grouped = new Map()
  for (const row of rows) {
    const hei = row.hei || 'Unknown'
    const country = row.country || 'Unknown'
    if (!grouped.has(hei)) grouped.set(hei, { total: new Set(), countries: new Map() })
    const value = grouped.get(hei)
    if (!value.countries.has(country)) value.countries.set(country, new Set())
    if (row.endorsementNo) {
      value.total.add(row.endorsementNo)
      value.countries.get(country).add(row.endorsementNo)
    }
  }
  return top([...grouped].map(([name, value]) => {
    const item = { name, totalEndorsements: value.total.size }
    countries.forEach((country) => { item[country] = value.countries.get(country)?.size || 0 })
    return item
  }), 'totalEndorsements', 10)
}

function heiTable(rows) {
  const grouped = new Map()
  for (const row of rows) {
    const name = row.hei || 'Unknown'
    if (!grouped.has(name)) grouped.set(name, { ids: new Set(), totalInterns: 0, countries: new Set(), hosts: new Set() })
    const value = grouped.get(name)
    value.totalInterns++
    if (row.endorsementNo) value.ids.add(row.endorsementNo)
    if (row.country) value.countries.add(row.country)
    if (row.host) value.hosts.add(row.host)
  }
  return top([...grouped].map(([name, value]) => ({
    name,
    totalEndorsements: value.ids.size,
    totalInterns: value.totalInterns,
    countries: value.countries.size,
    hostOrgs: value.hosts.size,
  })), 'totalInterns', 50)
}

export function buildHeiRisk(rows) {
  const countries = unique(rows.map((row) => row.country)).sort((a, b) => a.localeCompare(b))
  return {
    internsByHei: groupInterns(rows, 'hei', 12),
    endorsementsByHeiCountry: endorsementsByHeiCountry(rows, countries),
    endorsementsByRegion: groupEndorsements(rows, 'region', 12),
    bySex: groupInterns(rows, 'sex', 10),
    byTypeOfHei: groupInterns(rows, 'typeOfHei', 10),
    table: heiTable(rows),
  }
}

function routeSummary(rows) {
  const grouped = new Map()
  for (const row of rows) {
    if (![row.originLat, row.originLng, row.destLat, row.destLng].every(Number.isFinite)) continue
    const key = [row.country || 'Unknown', row.originLat, row.originLng, row.destLat, row.destLng].join('|')
    if (!grouped.has(key)) grouped.set(key, { row, ids: new Set(), totalInterns: 0 })
    const value = grouped.get(key)
    value.totalInterns++
    if (row.endorsementNo) value.ids.add(row.endorsementNo)
  }
  return top([...grouped].map(([key, value]) => ({
    key,
    country: value.row.country || 'Unknown',
    origin: value.row.fromCity || 'Origin',
    destination: value.row.toCity || value.row.host || 'Destination',
    originLat: value.row.originLat,
    originLng: value.row.originLng,
    destLat: value.row.destLat,
    destLng: value.row.destLng,
    totalInterns: value.totalInterns,
    totalEndorsements: value.ids.size,
  })), 'totalInterns', 250)
}

export function buildGeography(rows) {
  return {
    internsByCountry: groupInterns(rows, 'country', 10),
    hosts: groupInterns(rows, 'host', 15),
    routes: routeSummary(rows),
  }
}

export function buildSection(section, rows) {
  if (section === 'overview') return buildOverview(rows)
  if (section === 'timeline') return buildTimeline(rows)
  if (section === 'hei') return buildHeiRisk(rows)
  if (section === 'geography') return buildGeography(rows)
  throw new Error(`Unsupported dashboard section: ${section}`)
}
