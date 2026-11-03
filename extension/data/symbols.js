import { dateText } from '../domain/time.js'
import { isValidCode } from '../domain/validate.js'
import { fetchText } from './http.js'
import { SYMBOLS_KEY } from './storage.js'

export const TWSE_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL'
export const TPEX_URL = 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes'

function text(value) {
  return typeof value === 'string' ? value : ''
}

function readRows(body) {
  const payload = JSON.parse(body)
  if (!Array.isArray(payload)) return []
  return payload.filter((row) => typeof row === 'object' && row !== null)
}

/** TWSE `STOCK_DAY_ALL`。市場別由端點推得 */
export function parseTwse(body) {
  return readRows(body).flatMap((row) => {
    const code = text(row.Code)
    const name = text(row.Name)
    return code === '' || name === '' ? [] : [{ code, name, market: 'listing' }]
  })
}

/** TPEx `tpex_mainboard_quotes`。市場別由端點推得 */
export function parseTpex(body) {
  return readRows(body).flatMap((row) => {
    const code = text(row.SecuritiesCompanyCode)
    const name = text(row.CompanyName)
    return code === '' || name === '' ? [] : [{ code, name, market: 'otc' }]
  })
}

/** 代號為唯一鍵，先出現的來源優先 */
export function mergeEntries(groups) {
  const merged = new Map()
  for (const entries of groups) {
    for (const entry of entries) {
      if (!merged.has(entry.code)) merged.set(entry.code, entry)
    }
  }
  return [...merged.values()]
}

function readEntry(value) {
  if (typeof value !== 'object' || value === null) return null
  const { code, name, market } = value
  if (typeof code !== 'string' || !isValidCode(code)) return null
  if (typeof name !== 'string' || name === '') return null
  if (market !== 'listing' && market !== 'otc') return null
  return { code, name, market }
}

/** `{ updatedAt, entries }`；格式不對回 null */
export function parseTable(value) {
  if (typeof value !== 'object' || value === null) return null
  if (!Array.isArray(value.entries)) return null

  const entries = value.entries.map(readEntry)
  if (entries.some((entry) => entry === null)) return null
  return { updatedAt: text(value.updatedAt), entries }
}

export function lookup(table, code) {
  return table.entries.find((entry) => entry.code === code)
}

export async function load() {
  const stored = await chrome.storage.local.get(SYMBOLS_KEY)
  return parseTable(stored[SYMBOLS_KEY])
}

async function refresh(now) {
  const [twse, tpex] = await Promise.all([fetchText(TWSE_URL), fetchText(TPEX_URL)])
  if (twse.status !== 200) throw new Error(`TWSE HTTP ${twse.status}`)
  if (tpex.status !== 200) throw new Error(`TPEx HTTP ${tpex.status}`)

  const table = {
    updatedAt: dateText(now),
    entries: mergeEntries([parseTwse(twse.body), parseTpex(tpex.body)]),
  }
  await chrome.storage.local.set({ [SYMBOLS_KEY]: table })
  return table
}

/** 非當日才更新；更新失敗沿用舊快取，查不到時回空表 */
export async function ensureFresh(now = new Date()) {
  const cached = await load()
  if (cached !== null && cached.updatedAt === dateText(now)) return cached

  try {
    return await refresh(now)
  } catch (failure) {
    console.warn('對照表更新失敗', failure)
    return cached ?? { updatedAt: '', entries: [] }
  }
}
