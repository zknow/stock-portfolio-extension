import { computePnlRow } from '../domain/pnl.js'
import { errorText } from '../domain/time.js'
import { isValidCost, isValidShares } from '../domain/validate.js'
import { PORTFOLIO_KEY, load, parseHoldings, saveHoldings } from '../data/storage.js'
import { ensureFresh } from '../data/symbols.js'
import { createAddForm, parseNumber } from '../ui/addForm.js'
import { confirmAction } from '../ui/confirm.js'
import { createTable } from '../ui/table.js'

const root = document.querySelector('#app')
if (root === null) throw new Error('#app not found')

let holdings = []
/** 非 null 代表持股資料損毀，已停用編輯且不覆寫 */
let loadError = null
let draft = null
let editError = null
let saveError = null
/** 自己寫入 storage 時不要被 onChanged 再觸發一次重繪 */
let writing = false

const toolbar = document.createElement('div')
toolbar.className = 'toolbar'

const title = document.createElement('h1')
title.textContent = '台股庫存 · 編輯'

const tally = document.createElement('span')
tally.className = 'tally'

const addButton = document.createElement('button')
addButton.type = 'button'
addButton.className = 'primary'
addButton.textContent = '新增股票'
addButton.addEventListener('click', () => addForm.open())

const group = document.createElement('div')
group.className = 'actions-group'
group.append(addButton)

toolbar.append(title, tally, group)

const saveErrorText = document.createElement('p')
saveErrorText.className = 'form-error'
saveErrorText.hidden = true
saveErrorText.style.padding = '0 var(--pad-x)'

const addForm = createAddForm({
  exists: (code) => holdings.some((holding) => holding.code === code),
  submit: addHolding,
})

root.append(toolbar, saveErrorText, addForm.element)

const table = createTable(root, {
  startEdit,
  changeDraft,
  commit: (code) => void commit(code),
  cancelEdit,
  remove: (code) => void remove(code),
  requestAdd: () => addForm.open(),
})

function render() {
  table.render({
    rows: holdings.map((holding) => computePnlRow(holding, null)),
    totals: null,
    sort: { key: 'code', direction: 'asc' },
    mode: 'edit',
    draft,
    error: editError,
    display: 'rate',
    showCost: true,
  })
  tally.textContent = `共 ${holdings.length} 檔`
  saveErrorText.textContent = saveError ?? (loadError === null ? '' : `無法讀取持股資料：${loadError}`)
  saveErrorText.hidden = saveError === null && loadError === null
  addButton.disabled = loadError !== null
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

function startEdit(code) {
  // 一次只編輯一列：已有草稿時不切換，避免默默丟掉輸入中的內容
  if (draft !== null && draft.code !== code) return

  const holding = holdings.find((entry) => entry.code === code)
  if (holding === undefined) return

  draft = { code, shares: String(holding.shares), averageCost: String(holding.averageCost) }
  editError = null
  render()
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
  const error = !isValidShares(shares)
    ? '股數必須為正整數'
    : !isValidCost(averageCost)
      ? '平均成本必須為正數'
      : null
  if (error !== null) {
    editError = error
    render()
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
  render()
}

function watchStorage() {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || writing || draft !== null) return
    if (changes[PORTFOLIO_KEY] === undefined) return

    try {
      holdings = parseHoldings(changes[PORTFOLIO_KEY].newValue)
    } catch {
      return
    }
    render()
  })
}

async function main() {
  watchStorage()

  const loaded = await load()
  holdings = loaded.holdings
  loadError = loaded.error
  render()

  const symbols = await ensureFresh()
  addForm.setTable(symbols)
}

main().catch((failure) => {
  root.textContent = `啟動失敗：${errorText(failure)}`
})
