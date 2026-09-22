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
