import assert from 'node:assert/strict'
import test from 'node:test'
import { applyOrder, moveCode } from '../extension/domain/order.js'

function holding(code) {
  return { code, name: code, market: 'listing', shares: 1, averageCost: 1 }
}

test('applyOrder 依手動順序排列，不在順序內的依代號排最後', () => {
  const result = applyOrder([holding('2330'), holding('0050'), holding('2454')], ['2454', '2330'])
  assert.deepEqual(
    result.map((item) => item.code),
    ['2454', '2330', '0050'],
  )
})

test('moveCode 把來源移到目標位置', () => {
  assert.deepEqual(moveCode(['A', 'B', 'C'], 'C', 'A'), ['C', 'A', 'B'])
  assert.deepEqual(moveCode(['A', 'B', 'C'], 'A', 'B'), ['B', 'A', 'C'])
  assert.deepEqual(moveCode(['A', 'B', 'C'], 'A', 'A'), ['A', 'B', 'C'])
  assert.deepEqual(moveCode(['A', 'B', 'C'], 'X', 'A'), ['A', 'B', 'C'])
})
