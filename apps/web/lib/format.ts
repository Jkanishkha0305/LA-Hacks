/**
 * Format a number with commas: 12345 → "12,345"
 */
export function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/**
 * Format a number as square feet: 12345 → "12,345 SF"
 */
export function formatSF(n: number): string {
  return `${formatNumber(n)} SF`
}

/**
 * Format a FAR value: 6.5 → "6.50"
 */
export function formatFAR(n: number): string {
  return n.toFixed(2)
}

/**
 * Format a FAR delta with sign: 4.4 → "+4.40"
 */
export function formatFARDelta(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

/**
 * Format a dollar value: 3800172 → "$3,800,172"
 */
export function formatCurrency(n: number): string {
  if (!n) return '$0'
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}
