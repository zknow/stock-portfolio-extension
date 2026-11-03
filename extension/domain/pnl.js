export function computePnlRow(holding, quote) {
  const valuationPrice = quote?.valuationPrice ?? null
  const previousClose = quote?.previousClose ?? null
  const { shares, averageCost } = holding

  return {
    holding,
    quote,
    cost: averageCost * shares,
    marketValue: valuationPrice === null ? null : valuationPrice * shares,
    totalReturn: valuationPrice === null ? null : (valuationPrice - averageCost) * shares,
    totalReturnRate: valuationPrice === null ? null : (valuationPrice - averageCost) / averageCost,
    todayReturn:
      valuationPrice === null || previousClose === null
        ? null
        : (valuationPrice - previousClose) * shares,
    todayReturnRate:
      valuationPrice === null || previousClose === null
        ? null
        : (valuationPrice - previousClose) / previousClose,
  }
}

export function computeTotals(rows) {
  let cost = 0
  let marketValue = 0
  let totalReturn = 0
  let todayReturn = 0
  let todayBase = 0
  let excludedCount = 0
  let todayExcludedCount = 0

  for (const row of rows) {
    if (row.marketValue === null || row.totalReturn === null) {
      excludedCount += 1
      continue
    }

    cost += row.cost
    marketValue += row.marketValue
    totalReturn += row.totalReturn

    if (row.todayReturn === null) {
      todayExcludedCount += 1
    } else {
      todayReturn += row.todayReturn
      // 昨日市值 = 今日市值 − 今日報酬，不必回頭讀 quote
      todayBase += row.marketValue - row.todayReturn
    }
  }

  return {
    cost,
    marketValue,
    totalReturn,
    totalReturnRate: cost === 0 ? null : totalReturn / cost,
    todayReturn,
    todayReturnRate: todayBase === 0 ? null : todayReturn / todayBase,
    excludedCount,
    todayExcludedCount,
  }
}
