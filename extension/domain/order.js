/** 依手動順序排列持股；不在順序內的持股依代號排在最後 */
export function applyOrder(holdings, order) {
  const position = new Map(order.map((code, index) => [code, index]))
  return [...holdings].sort((a, b) => {
    const left = position.get(a.code)
    const right = position.get(b.code)
    if (left !== undefined && right !== undefined) return left - right
    if (left !== undefined) return -1
    if (right !== undefined) return 1
    return a.code.localeCompare(b.code, 'zh-Hant')
  })
}

/** 把 fromCode 移到 toCode 的位置；任一代號不在清單內時原樣回傳 */
export function moveCode(codes, fromCode, toCode) {
  const from = codes.indexOf(fromCode)
  const to = codes.indexOf(toCode)
  if (from === -1 || to === -1 || from === to) return codes

  const next = [...codes]
  next.splice(from, 1)
  next.splice(to, 0, fromCode)
  return next
}
