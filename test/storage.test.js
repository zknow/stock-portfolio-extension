import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultTargets, parseOrder, parseTargets, readPrefs } from '../extension/data/storage.js'

test('parseTargets 對非物件回預設', () => {
  assert.deepEqual(parseTargets(null), defaultTargets())
  assert.deepEqual(parseTargets('x'), defaultTargets())
})

test('parseTargets 正規化現金與權重', () => {
  const targets = parseTargets({
    schemaVersion: 1,
    cash: 49999.6,
    weights: { 2330: 40.04, '0050': 0.04, 2454: 0, bad: 10, 2317: '20' },
  })

  assert.equal(targets.cash, 50000)
  assert.deepEqual(targets.weights, { 2330: 40 })
})

test('parseTargets 丟棄超範圍與非數字', () => {
  const targets = parseTargets({
    schemaVersion: 1,
    cash: -1,
    weights: { 2330: -5, '0050': 101, 2454: Number.NaN, 2317: Infinity },
  })

  assert.equal(targets.cash, 0)
  assert.deepEqual(targets.weights, {})
})

test('parseTargets 遇到較高的 schemaVersion 回預設', () => {
  assert.deepEqual(parseTargets({ schemaVersion: 2, cash: 100, weights: { 2330: 100 } }), defaultTargets())
})

test('parseOrder 略過非法與重複的代號', () => {
  assert.deepEqual(parseOrder(['2330', '2330', '!!', 1, '0050']), ['2330', '0050'])
  assert.deepEqual(parseOrder('x'), [])
})

test('readPrefs 不保留再平衡檢視', () => {
  assert.equal(readPrefs({ rebalance: true }).rebalance, undefined)
})
