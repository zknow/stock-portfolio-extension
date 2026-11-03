import { errorText } from '../domain/time.js'
import { SORT_KEYS } from '../domain/types.js'
import { isValidCode, isValidCost, isValidShares } from '../domain/validate.js'

export const SCHEMA_VERSION = 1

export const PORTFOLIO_KEY = 'portfolio'
export const PREFS_KEY = 'prefs'
export const SYMBOLS_KEY = 'symbols'
export const QUOTES_KEY = 'quotes'

export const DEFAULT_PREFS = {
  sortKey: 'marketValue',
  sortDirection: 'desc',
  returnDisplay: 'rate',
  showCost: true,
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

/** 缺欄位或型別不符回 null，呼叫端視為沒有快取 */
export function readQuotes(value) {
  if (typeof value !== 'object' || value === null) return null
  if (!Array.isArray(value.quotes) || typeof value.fetchedAt !== 'string') return null
  const source = value.source === 'mis' || value.source === 'yahoo' ? value.source : null
  return { source, quotes: value.quotes, index: value.index ?? null, fetchedAt: value.fetchedAt }
}

/** 回傳 `{ holdings, prefs, quotes, error }`。`error` 非 null 代表持股資料損毀，呼叫端不得覆寫 */
export async function load() {
  const stored = await chrome.storage.local.get([PORTFOLIO_KEY, PREFS_KEY, QUOTES_KEY])

  let holdings = []
  let error = null
  if (stored[PORTFOLIO_KEY] !== undefined) {
    try {
      holdings = parseHoldings(stored[PORTFOLIO_KEY])
    } catch (failure) {
      error = errorText(failure)
    }
  }

  return { holdings, prefs: readPrefs(stored[PREFS_KEY]), quotes: readQuotes(stored[QUOTES_KEY]), error }
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
