import { errorText } from '../domain/time.js'
import { SORT_KEYS } from '../domain/types.js'
import { isValidCode, isValidCost, isValidShares } from '../domain/validate.js'

export const SCHEMA_VERSION = 1
export const TARGETS_SCHEMA_VERSION = 1

export const PORTFOLIO_KEY = 'portfolio'
export const PREFS_KEY = 'prefs'
export const SYMBOLS_KEY = 'symbols'
export const QUOTES_KEY = 'quotes'
export const TARGETS_KEY = 'targets'
export const ORDER_KEY = 'order'

export const DEFAULT_PREFS = {
  sortKey: 'marketValue',
  sortDirection: 'desc',
  returnDisplay: 'rate',
  showCost: true,
}

/** 權重資料預設值。`weights` 只存大於 0 的項目，0 視同未設定 */
export function defaultTargets() {
  return { schemaVersion: TARGETS_SCHEMA_VERSION, cash: 0, weights: {} }
}

function readWeight(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 0 || value > 100) return null
  return Math.round(value * 10) / 10
}

/** 缺欄位或不合法一律回預設；這是 targets 唯一的正規化邊界 */
export function parseTargets(value) {
  if (typeof value !== 'object' || value === null) return defaultTargets()

  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : TARGETS_SCHEMA_VERSION
  if (version > TARGETS_SCHEMA_VERSION) return defaultTargets()

  const cash =
    typeof value.cash === 'number' && Number.isFinite(value.cash) && value.cash >= 0 ? Math.round(value.cash) : 0
  const weights = {}
  if (typeof value.weights === 'object' && value.weights !== null && !Array.isArray(value.weights)) {
    for (const [code, raw] of Object.entries(value.weights)) {
      if (!isValidCode(code)) continue
      const weight = readWeight(raw)
      if (weight === null || weight === 0) continue
      weights[code] = weight
    }
  }

  return { schemaVersion: TARGETS_SCHEMA_VERSION, cash, weights }
}

function readHolding(value) {
  if (typeof value !== 'object' || value === null) return null
  const { code, name, market, shares, averageCost } = value
  if (typeof code !== 'string' || !isValidCode(code)) return null
  if (typeof name !== 'string' || name === '') return null
  if (market !== 'listing' && market !== 'otc') return null
  if (typeof shares !== 'number' || !isValidShares(shares)) return null
  if (typeof averageCost !== 'number' || !isValidCost(averageCost)) return null
  return { code, name, market, shares, averageCost }
}

export function parseHoldings(value) {
  if (typeof value !== 'object' || value === null) throw new Error('持股資料不是物件')

  const version = typeof value.schemaVersion === 'number' ? value.schemaVersion : SCHEMA_VERSION
  if (version > SCHEMA_VERSION) {
    throw new Error(`持股資料的 schemaVersion ${version} 高於支援的 ${SCHEMA_VERSION}`)
  }
  if (!Array.isArray(value.holdings)) throw new Error('持股資料缺少 holdings 陣列')

  const holdings = value.holdings.map(readHolding)
  if (holdings.some((holding) => holding === null)) throw new Error('持股資料含不合法的持股')
  return holdings
}

/** 缺欄位或值不合法一律回預設 */
export function readPrefs(value) {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_PREFS }
  return {
    sortKey: typeof value.sortKey === 'string' && SORT_KEYS.includes(value.sortKey) ? value.sortKey : DEFAULT_PREFS.sortKey,
    sortDirection: value.sortDirection === 'asc' ? 'asc' : 'desc',
    returnDisplay: value.returnDisplay === 'amount' ? 'amount' : 'rate',
    showCost: typeof value.showCost === 'boolean' ? value.showCost : DEFAULT_PREFS.showCost,
  }
}

/** 手動排序的代號清單；非陣列、不合法或重複的代號會被略過 */
export function parseOrder(value) {
  if (!Array.isArray(value)) return []
  const codes = []
  for (const code of value) {
    if (typeof code === 'string' && isValidCode(code) && !codes.includes(code)) codes.push(code)
  }
  return codes
}

/** 缺欄位或型別不符回 null，呼叫端視為沒有快取 */
export function readQuotes(value) {
  if (typeof value !== 'object' || value === null) return null
  if (!Array.isArray(value.quotes) || typeof value.fetchedAt !== 'string') return null
  const source = value.source === 'mis' || value.source === 'yahoo' ? value.source : null
  return { source, quotes: value.quotes, index: value.index ?? null, fetchedAt: value.fetchedAt }
}

/** 回傳 `{ holdings, prefs, quotes, targets, order, error }`。`error` 非 null 代表持股資料損毀，呼叫端不得覆寫 */
export async function load() {
  const stored = await chrome.storage.local.get([PORTFOLIO_KEY, PREFS_KEY, QUOTES_KEY, TARGETS_KEY, ORDER_KEY])

  let holdings = []
  let error = null
  if (stored[PORTFOLIO_KEY] !== undefined) {
    try {
      holdings = parseHoldings(stored[PORTFOLIO_KEY])
    } catch (failure) {
      error = errorText(failure)
    }
  }

  return {
    holdings,
    prefs: readPrefs(stored[PREFS_KEY]),
    quotes: readQuotes(stored[QUOTES_KEY]),
    targets: parseTargets(stored[TARGETS_KEY]),
    order: parseOrder(stored[ORDER_KEY]),
    error,
  }
}

export async function saveQuotes(batch) {
  await chrome.storage.local.set({ [QUOTES_KEY]: batch })
}

export async function saveHoldings(holdings) {
  await chrome.storage.local.set({ [PORTFOLIO_KEY]: { schemaVersion: SCHEMA_VERSION, holdings } })
}

export async function savePrefs(prefs) {
  await chrome.storage.local.set({
    [PREFS_KEY]: {
      sortKey: prefs.sortKey,
      sortDirection: prefs.sortDirection,
      returnDisplay: prefs.returnDisplay,
      showCost: prefs.showCost,
    },
  })
}

export async function saveOrder(order) {
  await chrome.storage.local.set({ [ORDER_KEY]: order })
}

export async function saveTargets(targets) {
  await chrome.storage.local.set({ [TARGETS_KEY]: parseTargets({ ...targets, schemaVersion: TARGETS_SCHEMA_VERSION }) })
}
