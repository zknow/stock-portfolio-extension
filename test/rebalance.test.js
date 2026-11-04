import assert from 'node:assert/strict'
import test from 'node:test'
import { computeRebalance } from '../extension/domain/rebalance.js'

function holding(code, shares, averageCost = 10) {
  return { code, name: code, market: 'listing', shares, averageCost }
}

function quote(code, valuationPrice) {
  return { code, price: valuationPrice, valuationPrice, previousClose: valuationPrice, traded: true, dataDate: '2026-11-03' }
}

function targets(cash, weights) {
  return { schemaVersion: 1, cash, weights }
}

function rowOf(result, code) {
  return result.rows.find((row) => row.code === code)
}

test('兩檔股票加現金，權重 100%', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100), holding('0050', 100)],
    quotes: new Map([
      ['2330', quote('2330', 100)],
      ['0050', quote('0050', 50)],
    ]),
    targets: targets(5000, { 2330: 50, '0050': 30 }),
  })

  assert.equal(result.ok, true)
  assert.equal(result.reason, null)
  assert.equal(result.stockWeightSum, 80)
  assert.equal(result.stockValue, 15000)
  assert.equal(result.total, 20000)

  const first = rowOf(result, '2330')
  assert.equal(first.value, 10000)
  assert.equal(first.currentWeight, 0.5)
  assert.equal(first.delta, 0)
  assert.equal(first.suggestedShares, 0)
  assert.equal(first.suggestedAmount, 0)

  const second = rowOf(result, '0050')
  assert.equal(second.value, 5000)
  assert.equal(second.delta, 1000)
  assert.equal(second.suggestedShares, 20)
  assert.equal(second.suggestedAmount, 1000)

  const cash = result.rows.at(-1)
  assert.equal(cash.kind, 'cash')
  assert.equal(cash.currentWeight, 0.25)
  assert.equal(cash.delta, -1000)
  assert.equal(cash.suggestedAmount, -1000)
})

test('股票權重合計超過 100% 只警告不給建議', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100), holding('0050', 100)],
    quotes: new Map([
      ['2330', quote('2330', 100)],
      ['0050', quote('0050', 100)],
    ]),
    targets: targets(0, { 2330: 100, '0050': 20 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'weight-sum')
  assert.equal(result.stockWeightSum, 120)
  for (const row of result.rows) {
    assert.equal(row.delta, null)
    assert.equal(row.suggestedShares, null)
    assert.equal(row.suggestedAmount, null)
  }
  assert.equal(result.residual, null)
})

test('缺 valuationPrice 整份不給建議', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100), holding('0050', 100)],
    quotes: new Map([['2330', quote('2330', 100)]]),
    targets: targets(0, { 2330: 50, '0050': 50 }),
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'missing-quotes')
  assert.deepEqual(result.missing, ['0050'])
  assert.equal(rowOf(result, '0050').value, null)
  for (const row of result.rows) {
    assert.equal(row.currentWeight, null)
    assert.equal(row.delta, null)
  }
})

test('股票目標 0%，全部賣出轉為現金', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map([['2330', quote('2330', 100)]]),
    targets: targets(0, { 2330: 0 }),
  })

  assert.equal(result.ok, true)
  const stock = rowOf(result, '2330')
  assert.equal(stock.delta, -10000)
  assert.equal(stock.suggestedShares, -100)
  assert.equal(stock.suggestedAmount, -10000)
  assert.equal(result.rows.at(-1).suggestedAmount, 10000)
})

test('目標權重 0 賣到 0 股且不超過持有股數', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map([['2330', quote('2330', 100)]]),
    targets: targets(0, { 2330: 0 }),
  })

  assert.equal(result.ok, true)
  const stock = rowOf(result, '2330')
  assert.equal(stock.targetWeight, 0)
  assert.equal(stock.suggestedShares, -100)
  assert.equal(stock.suggestedAmount, -10000)
})

test('取整後股票與現金建議金額守恆', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map([['2330', quote('2330', 7)]]),
    targets: targets(1000, { 2330: 33 }),
  })

  assert.equal(result.ok, true)
  const stock = rowOf(result, '2330')
  assert.equal(stock.suggestedShares, -20)
  assert.equal(stock.suggestedAmount, -140)
  assert.equal(result.rows.at(-1).suggestedAmount, 140)
  assert.equal(result.residual, 0)
})

test('負數股數四捨五入對稱處理', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 1)],
    quotes: new Map([['2330', quote('2330', 1)]]),
    targets: targets(0, { 2330: 50 }),
  })

  assert.equal(result.ok, true)
  assert.equal(rowOf(result, '2330').suggestedShares, -1)
  assert.equal(result.residual, 0)
})

test('總資產 0', () => {
  const result = computeRebalance({ holdings: [], quotes: new Map(), targets: targets(0, {}) })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'no-assets')
  assert.deepEqual(result.rows, [])
})

test('當日無成交但有昨收仍可計算', () => {
  const untraded = {
    code: '2330',
    price: null,
    valuationPrice: 90,
    previousClose: 90,
    traded: false,
    dataDate: '2026-11-03',
  }
  const result = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map([['2330', untraded]]),
    targets: targets(0, { 2330: 100 }),
  })

  assert.equal(result.ok, true)
  assert.equal(rowOf(result, '2330').value, 9000)
})

test('完全沒設權重', () => {
  const result = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map([['2330', quote('2330', 100)]]),
    targets: targets(0, {}),
  })

  assert.equal(result.ok, false)
  assert.equal(result.reason, 'no-weights')
  assert.equal(result.rows[0].currentWeight, 1)
  assert.equal(result.rows[0].delta, null)
})

test('合計錯誤仍顯示現況權重，缺價則不顯示', () => {
  const weightSum = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map([['2330', quote('2330', 100)]]),
    targets: targets(0, { 2330: 120 }),
  })
  assert.equal(weightSum.reason, 'weight-sum')
  assert.equal(weightSum.stockWeightSum, 120)
  assert.equal(weightSum.rows[0].currentWeight, 1)

  const missing = computeRebalance({
    holdings: [holding('2330', 100)],
    quotes: new Map(),
    targets: targets(0, { 2330: 50 }),
  })
  assert.equal(missing.reason, 'missing-quotes')
  assert.equal(missing.rows[0].currentWeight, null)
  assert.equal(missing.rows.at(-1).currentWeight, null)
})
