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

// "13 - NATIONAL CAPITAL REGION" -> "13 - NCR"; "18 - Negros Island Region (NIR)" -> "18 - NIR"
export function shortRegionName(region) {
  const text = String(region || '')
  const match = REGION_ABBREVIATIONS.find(([pattern]) => pattern.test(text))
  if (!match) return text
  return text.replace(match[0], match[1]).replace(new RegExp(`\\s*\\(${match[1]}\\)$`, 'i'), '')
}
