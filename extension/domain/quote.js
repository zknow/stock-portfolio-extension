/** 解析來源的價格值。無法解析、非數字或非正數時回傳 null */
export function parsePrice(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string' || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** 估值價 = 現價；當日無成交時 = 昨收；兩者皆缺時為 null */
export function buildQuote(input) {
  return {
    code: input.code,
    price: input.price,
    valuationPrice: input.price ?? input.previousClose,
    previousClose: input.previousClose,
    traded: input.price !== null,
    dataDate: input.dataDate,
  }
}

export function isStale(dataDate, today) {
  return dataDate !== today
}

/** 回傳 targets 中沒有對應報價的代號。來源對查無資料會回傳佔位物件，解析後已被略過 */
export function codesWithoutQuote(targets, quotes) {
  const covered = new Set(quotes.map((quote) => quote.code))
  return targets.filter((target) => !covered.has(target.code)).map((target) => target.code)
}
