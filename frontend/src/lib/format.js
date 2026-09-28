function finiteNumber(value) {
  const num = Number(value ?? 0)
  return Number.isFinite(num) ? num : 0
}

export function n(value, digits = 0) {
  const num = finiteNumber(value)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(num)
}

export function pct(value, total) {
  const v = finiteNumber(value)
  const t = finiteNumber(total)
  return t ? `${((v / t) * 100).toFixed(2)}%` : '0%'
}

export function compact(value) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(finiteNumber(value))
}

// Most SIAP programs begin with the same words, so a truncated axis label showed
// "Bachelor of Science in ..." for all of them. Shorten the degree, keep the subject.
const PROGRAM_PREFIXES = [
  [/^bachelor of science in\s+/i, 'BS '],
  [/^bachelor of arts in\s+/i, 'BA '],
  [/^bachelor of secondary education(\s+major in)?\s*/i, 'BSEd '],
  [/^bachelor of elementary education(\s+major in)?\s*/i, 'BEEd '],
  [/^master of science in\s+/i, 'MS '],
  [/^master of arts in\s+/i, 'MA '],
  [/^doctor of philosophy in\s+/i, 'PhD '],
]

export function shortProgramName(program) {
  const text = String(program || '').trim()
  const match = PROGRAM_PREFIXES.find(([pattern]) => pattern.test(text))
  return match ? `${match[1]}${text.replace(match[0], '')}`.trim() : text
}

// BARMM must come before ARMM, which is part of its name.
const REGION_ABBREVIATIONS = [
  [/national capital region/i, 'NCR'],
  [/cordillera administrative region/i, 'CAR'],
  [/bangsamoro autonomous region in muslim mindanao/i, 'BARMM'],
  [/autonomous region in muslim mindanao/i, 'ARMM'],
  [/negros island region/i, 'NIR'],
]

// Kept in capitals when a region name is re-cased; other words become title case.
const REGION_ACRONYMS = new Set(['NCR', 'CAR', 'BARMM', 'ARMM', 'NIR', 'CALABARZON', 'MIMAROPA', 'SOCCSKSARGEN'])

// The sources spell regions three ways ("13 - NATIONAL CAPITAL REGION", "13 - National
// Capital Region", "13 - NCR"); every page shows one: "13 - NCR", "01 - Ilocos Region".
export function shortRegionName(region) {
  let text = String(region || '').trim()
  const match = REGION_ABBREVIATIONS.find(([pattern]) => pattern.test(text))
  if (match) text = text.replace(match[0], match[1]).replace(new RegExp(`\\s*\\(${match[1]}\\)$`, 'i'), '')
  text = text.replace(/\b(MIMAROPA|CARAGA) Region$/i, '$1')
  return text.replace(/[A-Za-z]+/g, (word) => (REGION_ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1).toLowerCase()))
}

const SEX_LABELS = { f: 'Female', female: 'Female', m: 'Male', male: 'Male' }

// SIAP records sex as F / M; every page shows Female / Male / Not specified.
export function sexLabel(value) {
  return SEX_LABELS[String(value || '').trim().toLowerCase()] || 'Not specified'
}

// One date style for every "Data as of" line, such as "Sep 23, 2026", in Philippine time.
// A plain "YYYY-MM-DD hh:mm:ss" value is already local time, so only its date is read.
export function formatDataDate(value) {
  if (!value) return ''
  const plain = /^(\d{4})-(\d{2})-(\d{2})(?: \d{2}:\d{2}(?::\d{2})?)?$/.exec(String(value).trim())
  const date = plain ? new Date(Date.UTC(Number(plain[1]), Number(plain[2]) - 1, Number(plain[3]), 12)) : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: plain ? 'UTC' : 'Asia/Manila' }).format(date)
}
