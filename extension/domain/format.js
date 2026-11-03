export const MISSING = '—'

function groupThousands(value, fractionDigits) {
  const text = Math.abs(value).toFixed(fractionDigits)
  const dot = text.indexOf('.')
  const integer = dot === -1 ? text : text.slice(0, dot)
  const fraction = dot === -1 ? '' : text.slice(dot)
  return `${value < 0 ? '-' : ''}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction}`
}

export function formatPrice(value) {
  return value === null ? MISSING : groupThousands(value, 2)
}

export function formatShares(value) {
  return groupThousands(value, 0)
}

export function formatAmount(value) {
  return value === null ? MISSING : groupThousands(value, 0)
}

export function formatRate(value) {
  if (value === null) return MISSING
  return `${value > 0 ? '+' : ''}${groupThousands(value * 100, 2)}%`
}

/** 目標權重與現況權重：固定一位小數加 % */
export function formatWeight(value) {
  return value === null ? MISSING : `${groupThousands(value, 1)}%`
}

/** 'up' | 'down' | 'flat' */
export function directionOf(value) {
  if (value === null || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}
