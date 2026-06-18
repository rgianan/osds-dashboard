export function n(value, digits = 0) {
  const num = Number(value || 0)
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(num)
}

export function pct(value, total) {
  const v = Number(value || 0)
  const t = Number(total || 0)
  return t ? `${((v / t) * 100).toFixed(2)}%` : '0%'
}

export function compact(value) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0))
}
