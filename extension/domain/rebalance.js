/** 權重合計容差（百分點） */
export const WEIGHT_TOLERANCE = 0.1

function isPrice(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function quoteOf(quotes, code) {
  if (quotes instanceof Map) return quotes.get(code) ?? null
  if (typeof quotes === 'object' && quotes !== null) return quotes[code] ?? null
  return null
}

/**
 * 依目前市值計算再平衡。純函式，不碰 DOM 與 chrome API。
 *
 * `quotes` 可傳 Map 或以代號為鍵的物件；使用 `valuationPrice`，
 * 當日無成交但有昨收時仍可估值。
 */
export function computeRebalance({ holdings, quotes, targets }) {
  const weights = targets?.weights ?? {}
  const cash = typeof targets?.cash === 'number' && Number.isFinite(targets.cash) ? targets.cash : 0
  const cashWeight =
    typeof targets?.cashWeight === 'number' && Number.isFinite(targets.cashWeight) ? targets.cashWeight : 0

  const sharesByCode = new Map(holdings.map((holding) => [holding.code, holding.shares]))
  const missing = []
  const stockRows = []
  let stockValue = 0

  for (const holding of holdings) {
    const quote = quoteOf(quotes, holding.code)
    const price = quote?.valuationPrice ?? null

    if (!isPrice(price)) {
      missing.push(holding.code)
      stockRows.push({
        kind: 'stock',
        code: holding.code,
        name: holding.name,
        price: null,
        value: null,
        targetWeight: weights[holding.code] ?? 0,
        currentWeight: null,
        delta: null,
        suggestedShares: null,
        suggestedAmount: null,
      })
      continue
    }

    const value = price * holding.shares
    stockValue += value
    stockRows.push({
      kind: 'stock',
      code: holding.code,
      name: holding.name,
      price,
      value,
      targetWeight: weights[holding.code] ?? 0,
      currentWeight: null,
      delta: null,
      suggestedShares: null,
      suggestedAmount: null,
    })
  }

  const total = stockValue + cash
  const weightSum = cashWeight + holdings.reduce((sum, holding) => sum + (weights[holding.code] ?? 0), 0)
  const configured = cashWeight > 0 || holdings.some((holding) => weights[holding.code] !== undefined)

  let reason = null
  if (holdings.length === 0 && cash <= 0) reason = 'no-assets'
  else if (missing.length > 0) reason = 'missing-quotes'
  else if (!configured) reason = 'no-weights'
  else if (Math.abs(weightSum - 100) > WEIGHT_TOLERANCE) reason = 'weight-sum'
  else if (total <= 0) reason = 'no-assets'

  const ok = reason === null
  // 只有合計錯誤與尚未設定時，總資產仍完整，可以顯示現況權重
  const canShowCurrent = ok || reason === 'no-weights' || reason === 'weight-sum'

  if (canShowCurrent && total > 0) {
    for (const row of stockRows) row.currentWeight = row.value / total
  }

  if (ok) {
    for (const row of stockRows) {
      row.delta = (row.targetWeight / 100) * total - row.value
      // 四捨五入對稱處理正負：-1.5 股取 -2 股，而不是 -1 股
      const rawShares = Math.sign(row.delta) * Math.round(Math.abs(row.delta) / row.price)
      row.suggestedShares = Math.max(rawShares, -sharesByCode.get(row.code))
      row.suggestedAmount = row.suggestedShares * row.price
    }
  }

  const cashRow = {
    kind: 'cash',
    code: null,
    name: '現金',
    price: null,
    value: cash,
    targetWeight: cashWeight,
    currentWeight: canShowCurrent && total > 0 ? cash / total : null,
    delta: null,
    suggestedShares: null,
    suggestedAmount: null,
  }

  if (ok) {
    cashRow.delta = (cashWeight / 100) * total - cash
    // 現金調整量用取整後的股票交易回推，確保計畫守恆
    cashRow.suggestedAmount = -stockRows.reduce((sum, row) => sum + row.suggestedAmount, 0)
  }

  const rows = [...stockRows, cashRow]
  if (reason === 'no-assets' && holdings.length === 0 && cash <= 0) rows.length = 0

  const residual = ok ? stockRows.reduce((sum, row) => sum + row.suggestedAmount, 0) + cashRow.suggestedAmount : null

  return {
    ok,
    reason,
    weightSum,
    total,
    stockValue,
    cash,
    missing,
    rows,
    residual,
  }
}
