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
