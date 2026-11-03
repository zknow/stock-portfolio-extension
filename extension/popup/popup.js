import { isStale } from '../domain/quote.js'
import { dateKey, errorText } from '../domain/time.js'
import { computePnlRow, computeTotals } from '../domain/pnl.js'
import { fetchBatch } from '../data/quotes.js'
import {
  DEFAULT_PREFS,
  PORTFOLIO_KEY,
  PREFS_KEY,
  load,
  parseHoldings,
  readPrefs,
  saveQuotes,
  savePrefs,
} from '../data/storage.js'
import { createStatusBar } from '../ui/statusBar.js'
import { createTable, defaultDirection, mapSortKey, sortRows, visibleSortKey } from '../ui/table.js'
import { createPopupToolbar } from '../ui/toolbar.js'

const root = document.querySelector('#app')
if (root === null) throw new Error('#app not found')

let holdings = []
let prefs = { ...DEFAULT_PREFS }
/** 非 null 代表持股資料損毀，已停用偏好寫入 */
let loadError = null
let batch = null
let fetchError = null
let refreshing = false

const toolbar = createPopupToolbar({
  onRefresh: () => void refresh(),
  onEdit: openEditPage,
  onDisplayChange: setDisplay,
  onCostChange: setCost,
})
root.append(toolbar.element)

const table = createTable(root, { sort })
const statusBar = createStatusBar(root)

function openEditPage() {
  void chrome.tabs.create({ url: chrome.runtime.getURL('edit/edit.html') })
  window.close()
}

function render() {
  const quotes = new Map((batch?.quotes ?? []).map((quote) => [quote.code, quote]))
  const rows = holdings.map((holding) => computePnlRow(holding, quotes.get(holding.code) ?? null))

  table.render({
    rows: sortRows(rows, prefs.sortKey, prefs.sortDirection),
    totals: computeTotals(rows),
    sort: { key: prefs.sortKey, direction: prefs.sortDirection },
    mode: 'view',
    draft: null,
    error: null,
    display: prefs.returnDisplay,
    showCost: prefs.showCost,
  })
  toolbar.setTally(`共 ${rows.length} 檔`)

  const today = dateKey(new Date())
  statusBar.render({
    fetchedAt: batch?.fetchedAt ?? null,
    source: batch?.source ?? null,
    stale: batch !== null && batch.quotes.some((quote) => isStale(quote.dataDate, today)),
    error: loadError ?? fetchError,
    index: batch?.index ?? null,
  })
}

function sort(key) {
  const direction =
    prefs.sortKey === key ? (prefs.sortDirection === 'asc' ? 'desc' : 'asc') : defaultDirection(key)
  prefs = { ...prefs, sortKey: key, sortDirection: direction }
  render()
  void savePrefs(prefs)
}

function setDisplay(display) {
  prefs = { ...prefs, returnDisplay: display, sortKey: mapSortKey(prefs.sortKey, display) }
  toolbar.setDisplay(display)
  render()
  void savePrefs(prefs)
}

function setCost(showCost) {
  prefs = { ...prefs, showCost, sortKey: visibleSortKey(prefs.sortKey, prefs.returnDisplay, showCost) }
  toolbar.setCost(showCost)
  render()
  void savePrefs(prefs)
}

/** 抓一次報價：開啟 popup 與按重整時各一次，沒有排程 */
async function refresh() {
  if (refreshing || holdings.length === 0) return

  refreshing = true
  toolbar.setRefreshing(true)
  try {
    batch = await fetchBatch(holdings.map(({ code, market }) => ({ code, market })))
    fetchError = null
    await saveQuotes(batch)
  } catch (failure) {
    fetchError = errorText(failure)
    console.warn('報價抓取失敗', failure)
  } finally {
    refreshing = false
    toolbar.setRefreshing(false)
  }
  render()
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return

    if (changes[PORTFOLIO_KEY] !== undefined) {
      try {
        holdings = parseHoldings(changes[PORTFOLIO_KEY].newValue)
      } catch {
        return
      }
    }
    if (changes[PREFS_KEY] !== undefined) {
      prefs = readPrefs(changes[PREFS_KEY].newValue)
      toolbar.setDisplay(prefs.returnDisplay)
      toolbar.setCost(prefs.showCost)
    }
    render()
  })
}

async function main() {
  watchStorage()

  const loaded = await load()
  holdings = loaded.holdings
  prefs = loaded.prefs
  batch = loaded.quotes
  loadError = loaded.error

  toolbar.setDisplay(prefs.returnDisplay)
  toolbar.setCost(prefs.showCost)
  render()

  await refresh()
}

main().catch((failure) => {
  root.textContent = `啟動失敗：${errorText(failure)}`
})
