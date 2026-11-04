import { applyOrder, moveCode } from '../domain/order.js'
import { computePnlRow } from '../domain/pnl.js'
import { errorText } from '../domain/time.js'
import { isValidCost, isValidShares } from '../domain/validate.js'
import {
  PORTFOLIO_KEY,
  TARGETS_KEY,
  ORDER_KEY,
  defaultTargets,
  load,
  parseHoldings,
  parseOrder,
  parseTargets,
  saveHoldings,
  saveOrder,
  saveTargets,
} from '../data/storage.js'
import { ensureFresh } from '../data/symbols.js'
import { createAddForm, parseNumber } from '../ui/addForm.js'
import { confirmAction } from '../ui/confirm.js'
import { createTable, defaultDirection, sortRows } from '../ui/table.js'
import { createWeightTable } from '../ui/weightTable.js'

const root = document.querySelector('#app')
if (root === null) throw new Error('#app not found')

let holdings = []
let targets = defaultTargets()
/** 非 null 代表持股資料損毀，已停用編輯且不覆寫 */
let loadError = null
let draft = null
let editError = null
let saveError = null
/** 自己寫入 storage 時不要被 onChanged 再觸發一次重繪 */
let writing = false
/** 目前頁籤：'edit' | 'weight'，不持久化 */
let tab = 'edit'
/** 成本頁排序，權重頁沿用同一順序，不持久化 */
let sort = { key: 'manual', direction: 'asc' }
/** 手動順序的代號清單 */
let order = []

const toolbar = document.createElement('div')
toolbar.className = 'toolbar'

const title = document.createElement('h1')
title.textContent = '台股庫存 · 編輯'

const tabs = document.createElement('div')
tabs.className = 'tabs'
tabs.setAttribute('role', 'tablist')

const tabButtons = new Map()
for (const [key, label] of [
  ['edit', '成本'],
  ['weight', '權重'],
]) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = 'tab'
  element.dataset.tab = key
  element.setAttribute('role', 'tab')
  element.textContent = label
  element.addEventListener('click', () => selectTab(key))
  tabs.append(element)
  tabButtons.set(key, element)
}

const tally = document.createElement('span')
tally.className = 'tally'

toolbar.append(title, tabs, tally)

const saveErrorText = document.createElement('p')
saveErrorText.className = 'form-error'
saveErrorText.hidden = true
saveErrorText.style.padding = '0 var(--pad-x)'

const editView = document.createElement('div')
editView.className = 'tab-view'

const weightView = document.createElement('div')
weightView.className = 'tab-view'

root.append(toolbar, saveErrorText, editView, weightView)

const addForm = createAddForm({
  exists: (code) => holdings.some((holding) => holding.code === code),
  submit: addHolding,
})
editView.append(addForm.element)

const table = createTable(editView, {
  startEdit,
  changeDraft,
  commit: (code) => void commit(code),
  cancelEdit,
  remove: (code) => void remove(code),
  requestAdd: () => addForm.focus(),
  sort: sortBy,
  reorder,
})

const weightTable = createWeightTable({
  onChange: (next) => void saveWeights(next),
  onReorder: (from, to) => void reorder(from, to),
})
weightView.append(weightTable.element)

function renderSaveError() {
  saveErrorText.textContent = saveError ?? (loadError === null ? '' : `無法讀取持股資料：${loadError}`)
  saveErrorText.hidden = saveError === null && loadError === null
}

function shownRows() {
  const rows = applyOrder(holdings, order).map((holding) => computePnlRow(holding, null))
  return sortRows(rows, sort.key, sort.direction)
}

/** 拖曳排序：以目前畫面順序為基礎移動，結果存為手動排序 */
async function reorder(fromCode, toCode) {
  order = moveCode(shownRows().map((row) => row.holding.code), fromCode, toCode)
  sort = { key: 'manual', direction: 'asc' }
  writing = true
  try {
    await saveOrder(order)
  } catch (failure) {
    console.warn('排序儲存失敗', failure)
  } finally {
    writing = false
  }
  render()
}

function sortBy(key) {
  const direction = sort.key === key ? (sort.direction === 'asc' ? 'desc' : 'asc') : defaultDirection(key)
  sort = { key, direction }
  render()
}

function selectTab(next) {
  tab = next
  render()
}

function render() {
  const rows = shownRows()
  table.render({
    rows,
    totals: null,
    sort,
    mode: 'edit',
    draft,
    error: editError,
    display: 'rate',
    showCost: true,
    cash: { value: targets.cash, disabled: loadError !== null, onChange: (text) => void saveCash(text) },
  })
  weightTable.render({ holdings: rows.map((row) => row.holding), targets, disabled: loadError !== null })
  tally.textContent = `共 ${holdings.length} 檔`
  editView.hidden = tab !== 'edit'
  weightView.hidden = tab !== 'weight'
  for (const [key, button] of tabButtons) button.setAttribute('aria-selected', String(key === tab))
  renderSaveError()
  addForm.setEnabled(loadError === null)
}

/** 每次變更立即寫入，回傳錯誤訊息，null 代表成功 */
async function persist(next) {
  if (loadError !== null) return '持股資料損毀，已停用編輯'

  writing = true
  try {
    await saveHoldings(next)
    saveError = null
    return null
  } catch (failure) {
    saveError = errorText(failure)
    console.warn('持股儲存失敗', failure)
    return saveError
  } finally {
    writing = false
  }
}

async function saveWeights(next) {
  targets = next
  if (loadError !== null) return

  writing = true
  try {
    await saveTargets(next)
    saveError = null
  } catch (failure) {
    saveError = errorText(failure)
    console.warn('權重儲存失敗', failure)
  } finally {
    writing = false
  }
  renderSaveError()
}

/** 現金金額變更：驗證後寫入，無效輸入時還原輸入框 */
async function saveCash(text) {
  const value = Number(text)
  if (text === '' || !Number.isFinite(value) || value < 0) {
    saveError = '現金金額必須是 0 以上的數字'
    render()
    return
  }
  await saveWeights({ ...targets, cash: Math.round(value) })
  render()
}

/** 刪除持股後清掉對應權重；失敗只記 console，不影響刪除結果 */
async function clearWeight(code) {
  if (targets.weights[code] === undefined) return

  const next = { ...targets, weights: { ...targets.weights } }
  delete next.weights[code]
  targets = next

  writing = true
  try {
    await saveTargets(next)
  } catch (failure) {
    console.warn('權重清除失敗', failure)
  } finally {
    writing = false
  }
}

/** 重新繪製後把焦點放回指定欄位，避免使用者要再點一次才能輸入 */
function focusField(code, field) {
  const input = root.querySelector(`.cell-input[data-code="${code}"][data-field="${field}"]`)
  if (input === null) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

function startEdit(code, field) {
  // 一次只編輯一列：已有草稿時不切換，避免默默丟掉輸入中的內容
  if (draft !== null && draft.code !== code) return

  const holding = holdings.find((entry) => entry.code === code)
  if (holding === undefined) return

  draft = { code, shares: String(holding.shares), averageCost: String(holding.averageCost) }
  editError = null
  render()
  focusField(code, field)
}

function changeDraft(code, field, value) {
  if (draft === null || draft.code !== code) return
  draft = field === 'shares' ? { ...draft, shares: value } : { ...draft, averageCost: value }
  editError = null
}

function cancelEdit() {
  draft = null
  editError = null
  render()
}

async function commit(code) {
  if (draft === null || draft.code !== code) return

  const shares = parseNumber(draft.shares)
  const averageCost = parseNumber(draft.averageCost)
  const sharesValid = isValidShares(shares)
  const costValid = isValidCost(averageCost)
  const error = !sharesValid
    ? '股數必須為正整數'
    : !costValid
      ? '平均成本必須為正數'
      : null
  if (error !== null) {
    editError = error
    render()
    focusField(code, sharesValid ? 'averageCost' : 'shares')
    return
  }

  const next = holdings.map((holding) =>
    holding.code === code ? { ...holding, shares, averageCost } : holding,
  )
  const failure = await persist(next)
  if (failure !== null) {
    editError = failure
    render()
    return
  }

  holdings = next
  draft = null
  editError = null
  render()
}

/** F2：新增。對照表由代號自動帶出名稱與市場 */
async function addHolding(holding) {
  const failure = await persist([...holdings, holding])
  if (failure !== null) return failure

  holdings = [...holdings, holding]
  render()
  return null
}

/** F3：刪除需二次確認，確認內容含代號與名稱 */
async function remove(code) {
  const holding = holdings.find((entry) => entry.code === code)
  if (holding === undefined) return

  const confirmed = await confirmAction({
    title: `刪除 ${holding.code} ${holding.name}？`,
    detail: '此動作不可復原。',
  })
  if (!confirmed) return

  const next = holdings.filter((entry) => entry.code !== code)
  const failure = await persist(next)
  if (failure !== null) return

  holdings = next
  if (draft?.code === code) {
    draft = null
    editError = null
  }
  await clearWeight(code)
  render()
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || writing || draft !== null) return

    if (changes[PORTFOLIO_KEY] !== undefined) {
      try {
        holdings = parseHoldings(changes[PORTFOLIO_KEY].newValue)
      } catch {
        return
      }
    }
    if (changes[TARGETS_KEY] !== undefined) targets = parseTargets(changes[TARGETS_KEY].newValue)
    if (changes[ORDER_KEY] !== undefined) order = parseOrder(changes[ORDER_KEY].newValue)
    if (changes[PORTFOLIO_KEY] !== undefined || changes[TARGETS_KEY] !== undefined || changes[ORDER_KEY] !== undefined) render()
  })
}

async function main() {
  watchStorage()

  const loaded = await load()
  holdings = loaded.holdings
  targets = loaded.targets
  order = loaded.order
  loadError = loaded.error
  render()

  const symbols = await ensureFresh()
  addForm.setTable(symbols)
}

main().catch((failure) => {
  root.textContent = `啟動失敗：${errorText(failure)}`
})
