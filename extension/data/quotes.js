import { buildQuote, codesWithoutQuote, parsePrice } from '../domain/quote.js'
import { dateKey, errorText } from '../domain/time.js'
import { fetchText } from './http.js'

export const MIS_ENDPOINT = 'https://mis.twse.com.tw/stock/api/getStockInfo.jsp'
/** 發行量加權股價指數在 MIS 的代號 */
export const MIS_INDEX_CODE = 't00'

export const YAHOO_ENDPOINT = 'https://query1.finance.yahoo.com/v8/finance/chart'
/** 發行量加權股價指數在 Yahoo 的代號 */
export const YAHOO_INDEX_SYMBOL = '^TWII'

export function toExCh(target) {
  return `${target.market === 'listing' ? 'tse' : 'otc'}_${target.code}.tw`
}

export function buildMisUrl(targets) {
  const channels = [...targets.map(toExCh), toExCh({ code: MIS_INDEX_CODE, market: 'listing' })]
  return `${MIS_ENDPOINT}?ex_ch=${channels.join('|')}&json=1&delay=0`
}

function text(value) {
  return typeof value === 'string' ? value : ''
}

function readEntries(payload) {
  if (typeof payload !== 'object' || payload === null) return []
  const msgArray = payload.msgArray
  if (!Array.isArray(msgArray)) return []
  return msgArray.filter((item) => typeof item === 'object' && item !== null)
}

function priceOf(entry) {
  const trade = entry.trade
  const lastTrade = typeof trade === 'object' && trade !== null ? text(trade.z) : ''
  return parsePrice(lastTrade) ?? parsePrice(text(entry.z))
}

/**
 * 現價解析順序：`trade.z` → `z` → 當日無成交。
 * 錯誤代號或錯誤前綴時 MIS 會在原位置插入佔位物件，以空字串的 `c` 判定並略過。
 */
export function parseMisResponse(body) {
  const quotes = []
  let index = null

  for (const entry of readEntries(JSON.parse(body))) {
    const code = text(entry.c)
    if (code === '') continue

    if (code === MIS_INDEX_CODE) {
      index = {
        price: priceOf(entry),
        previousClose: parsePrice(text(entry.y)),
        dataDate: text(entry.d),
      }
      continue
    }

    quotes.push(
      buildQuote({
        code,
        price: priceOf(entry),
        previousClose: parsePrice(text(entry.y)),
        dataDate: text(entry.d),
      }),
    )
  }

  return { quotes, index }
}

export function toYahooSymbol(target) {
  return `${target.code}${target.market === 'listing' ? '.TW' : '.TWO'}`
}

function chartUrl(symbol) {
  return `${YAHOO_ENDPOINT}/${symbol}?interval=1d&range=1d`
}

export function buildChartUrl(target) {
  return chartUrl(toYahooSymbol(target))
}

export function buildIndexUrl() {
  return chartUrl(YAHOO_INDEX_SYMBOL)
}

function readMeta(payload) {
  if (typeof payload !== 'object' || payload === null) return null
  const chart = payload.chart
  if (typeof chart !== 'object' || chart === null) return null
  const result = chart.result
  if (!Array.isArray(result) || result.length === 0) return null
  const first = result[0]
  if (typeof first !== 'object' || first === null) return null
  const meta = first.meta
  return typeof meta === 'object' && meta !== null ? meta : null
}

export function parseChartResponse(body, code) {
  const meta = readMeta(JSON.parse(body))
  if (meta === null) return null

  const marketTime = meta.regularMarketTime
  const dataDate =
    typeof marketTime === 'number' ? dateKey(new Date(marketTime * 1000)) : dateKey(new Date())

  return buildQuote({
    code,
    price: parsePrice(meta.regularMarketPrice),
    previousClose: parsePrice(meta.chartPreviousClose),
    dataDate,
  })
}

async function fetchMis(targets) {
  const response = await fetchText(buildMisUrl(targets))
  if (response.status !== 200) throw new Error(`MIS HTTP ${response.status}`)

  const { quotes, index } = parseMisResponse(response.body)
  if (quotes.length === 0 && targets.length > 0) throw new Error('MIS 未回傳任何報價')

  const missing = codesWithoutQuote(targets, quotes)
  if (missing.length > 0) console.warn(`MIS 未回傳報價：${missing.join('、')}`)

  return { source: 'mis', quotes, index, fetchedAt: new Date().toISOString() }
}

/** 指數只是輔助資訊，取不到時不影響持股報價 */
async function fetchIndex() {
  try {
    const response = await fetchText(buildIndexUrl())
    if (response.status !== 200) return null
    const quote = parseChartResponse(response.body, YAHOO_INDEX_SYMBOL)
    if (quote === null) return null
    return { price: quote.price, previousClose: quote.previousClose, dataDate: quote.dataDate }
  } catch {
    return null
  }
}

async function fetchYahoo(targets) {
  const [quotes, index] = await Promise.all([
    Promise.all(
      targets.map(async (target) => {
        const response = await fetchText(buildChartUrl(target))
        if (response.status !== 200) throw new Error(`Yahoo HTTP ${response.status}`)
        return parseChartResponse(response.body, target.code)
      }),
    ),
    fetchIndex(),
  ])

  return {
    source: 'yahoo',
    quotes: quotes.filter((quote) => quote !== null),
    index,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * 抓一次報價：先 MIS（一次批次），失敗才用 Yahoo 抓一次。
 * 沒有連續失敗計數與回試，因為每次呼叫都是獨立的一次抓取。
 */
export async function fetchBatch(targets) {
  try {
    return await fetchMis(targets)
  } catch (misFailure) {
    try {
      return await fetchYahoo(targets)
    } catch (yahooFailure) {
      throw new Error(`報價失敗：MIS ${errorText(misFailure)}；Yahoo ${errorText(yahooFailure)}`)
    }
  }
}
