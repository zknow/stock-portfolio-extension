import { MISSING, directionOf, formatAmount, formatPrice, formatRate, formatShares } from '../domain/format.js'
import { createDragHandle } from './rowDrag.js'

/** 欄位順序即表格順序。成本欄位整組受 F17 的開關控制 */
const IDENTITY_COLUMNS = [
  { key: 'code', label: '代號', width: null },
  { key: 'name', label: '名稱', width: null },
]

const COST_COLUMNS = [
  { key: 'shares', label: '股數', width: null },
  { key: 'averageCost', label: '平均成本', width: null },
]

const PRICE_COLUMN = { key: 'price', label: '現價', width: null }

const RETURN_COLUMNS = {
  rate: [
    { key: 'totalReturnRate', label: '總報酬率', width: null },
    { key: 'todayReturnRate', label: '今日報酬率', width: null },
  ],
  amount: [
    { key: 'totalReturn', label: '總報酬金額', width: null },
    { key: 'todayReturn', label: '今日報酬金額', width: null },
  ],
}

const EDIT_COLUMNS = [
  { key: 'code', label: '代號', width: 96 },
  { key: 'name', label: '名稱', width: null },
  { key: 'shares', label: '股數', width: 130 },
  { key: 'averageCost', label: '平均成本', width: 140 },
]

/**
 * F1 / F17：成本顯示時 7 欄，隱藏時只留代號、名稱、現價、今日報酬。
 * 編輯頁不抓報價，只出四欄，另加「操作」欄。
 */
export function columnsFor(display, showCost = true, mode = 'view') {
  if (mode === 'edit') return EDIT_COLUMNS

  const [total, today] = RETURN_COLUMNS[display]
  return [
    ...IDENTITY_COLUMNS,
    ...(showCost ? COST_COLUMNS : []),
    PRICE_COLUMN,
    ...(showCost ? [total, today] : [today]),
  ]
}

/** 同一個指標的兩個排序鍵：金額與比率 */
const RETURN_KEY_PAIRS = [
  ['totalReturn', 'totalReturnRate'],
  ['todayReturn', 'todayReturnRate'],
]

/** 切換顯示模式時，被隱藏的排序鍵換成同組的另一個，方向不變（F13） */
export function mapSortKey(key, display) {
  const pair = RETURN_KEY_PAIRS.find((keys) => keys.includes(key))
  if (pair === undefined) return key
  return display === 'rate' ? pair[1] : pair[0]
}

/** 關閉成本時會一起消失的排序鍵（F17） */
const COST_SORT_KEYS = new Set([
  'shares',
  'averageCost',
  'totalReturn',
  'totalReturnRate',
  'marketValue',
])

/** 切換成本顯示時，若排序鍵落在被隱藏的欄位就改用今日報酬，方向不變（F17） */
export function visibleSortKey(key, display, showCost) {
  return showCost || !COST_SORT_KEYS.has(key) ? key : mapSortKey('todayReturn', display)
}

/** 數字欄：決定欄頭對齊與首次點擊的方向。`marketValue` 不顯示但仍為數字欄 */
const NUMERIC_KEYS = new Set([
  'shares',
  'averageCost',
  'price',
  'totalReturn',
  'totalReturnRate',
  'todayReturn',
  'todayReturnRate',
  'marketValue',
])

const SORT_VALUES = {
  code: (row) => row.holding.code,
  name: (row) => row.holding.name,
  shares: (row) => row.holding.shares,
  averageCost: (row) => row.holding.averageCost,
  price: (row) => row.quote?.price ?? null,
  totalReturn: (row) => row.totalReturn,
  totalReturnRate: (row) => row.totalReturnRate,
  todayReturn: (row) => row.todayReturn,
  todayReturnRate: (row) => row.todayReturnRate,
  marketValue: (row) => row.marketValue,
}

/** 首次點擊某欄時的起始方向：數字欄遞減，文字欄遞增 */
export function defaultDirection(key) {
  return NUMERIC_KEYS.has(key) ? 'desc' : 'asc'
}

/** 缺值一律排最後，不受升冪或降冪影響（F13） */
export function sortRows(rows, key, direction) {
  if (key === 'manual') return [...rows]
  const factor = direction === 'asc' ? 1 : -1
  const valueOf = SORT_VALUES[key]

  return [...rows].sort((a, b) => {
    const left = valueOf(a)
    const right = valueOf(b)
    if (left === null || right === null) {
      return left === right ? 0 : left === null ? 1 : -1
    }
    if (typeof left === 'string' || typeof right === 'string') {
      return factor * String(left).localeCompare(String(right), 'zh-Hant')
    }
    return factor * (left - right)
  })
}

function cell(text, className) {
  const element = document.createElement('td')
  element.className = className
  element.textContent = text
  return element
}

function span(text, className) {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

function button(text, className) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.textContent = text
  return element
}

function valueCell(value, text) {
  return cell(text, `numeric ${value === null ? 'missing' : directionOf(value)}`)
}

/** 漲跌不得只靠顏色，數字旁必須帶方向符號（ADR-0007） */
function priceCell(row) {
  const price = row.quote?.price ?? null
  if (price === null) return cell(MISSING, 'numeric missing')

  const previousClose = row.quote?.previousClose ?? null
  const direction = previousClose === null ? 'flat' : directionOf(price - previousClose)
  const element = cell(formatPrice(price), `numeric ${direction}`)

  if (direction !== 'flat') {
    const arrow = span(direction === 'up' ? '▲' : '▼', 'arrow')
    arrow.setAttribute('aria-hidden', 'true')
    element.prepend(arrow)
  }
  return element
}

/** 編輯模式：股數與平均成本可點擊就地編輯（F4） */
function editableCell(row, edit, handlers, field) {
  const draft = edit.draft?.code === row.holding.code ? edit.draft : null
  const text = field === 'shares' ? formatShares(row.holding.shares) : formatPrice(row.holding.averageCost)

  if (draft === null) {
    const element = cell(text, 'numeric editable')
    element.addEventListener('click', () => handlers.startEdit?.(row.holding.code, field))
    return element
  }

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'cell-input'
  input.value = field === 'shares' ? draft.shares : draft.averageCost
  input.dataset.code = row.holding.code
  input.dataset.field = field
  input.addEventListener('input', () => handlers.changeDraft?.(row.holding.code, field, input.value))
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handlers.commit?.(row.holding.code)
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      handlers.cancelEdit?.()
    }
  })

  const element = cell('', 'numeric')
  element.replaceChildren(input)
  return element
}

function actionsCell(row, edit, handlers) {
  const element = cell('', 'actions')
  const { code } = row.holding

  const remove = button('刪除', 'ghost')
  remove.addEventListener('click', () => handlers.remove?.(code))
  element.append(remove)

  if (edit.draft?.code === code) {
    const save = button('儲存', 'primary')
    save.addEventListener('click', () => handlers.commit?.(code))

    const cancel = button('取消', 'ghost')
    cancel.addEventListener('click', () => handlers.cancelEdit?.())

    element.append(save, cancel)
    if (edit.error !== null) element.append(span(edit.error, 'row-error'))
  }

  return element
}

function returnCells(row, display, showCost) {
  const today =
    display === 'rate'
      ? valueCell(row.todayReturnRate, formatRate(row.todayReturnRate))
      : valueCell(row.todayReturn, formatAmount(row.todayReturn))
  if (!showCost) return [today]

  const total =
    display === 'rate'
      ? valueCell(row.totalReturnRate, formatRate(row.totalReturnRate))
      : valueCell(row.totalReturn, formatAmount(row.totalReturn))
  return [total, today]
}

function rowFor(row, edit, handlers, display, showCost) {
  const element = document.createElement('tr')
  if (row.quote !== null && !row.quote.traded) element.className = 'untraded'

  const { code, name } = row.holding
  const nameCell = cell('', '')
  nameCell.title = name
  nameCell.append(span(name, 'name-text'))
  const codeCell = cell(code, '')
  codeCell.prepend(createDragHandle((from, to) => handlers.reorder?.(from, to)))
  element.dataset.code = code
  element.append(codeCell, nameCell)

  if (edit.mode === 'edit') {
    element.append(editableCell(row, edit, handlers, 'shares'), editableCell(row, edit, handlers, 'averageCost'), actionsCell(row, edit, handlers))
    return element
  }

  if (showCost) element.append(cell(formatShares(row.holding.shares), 'numeric'), cell(formatPrice(row.holding.averageCost), 'numeric'))
  element.append(priceCell(row), ...returnCells(row, display, showCost))
  return element
}

function pair(label, text, direction) {
  const box = document.createElement('div')
  box.className = 'pair'

  const value = span(text, 'value')
  value.classList.add(direction)

  box.append(span(label, 'label'), value)
  return box
}

/** 總計列的報酬項目跟著顯示模式（F12）；關閉成本時只留今日報酬（F17） */
function returnPairs(values, display, showCost) {
  const today =
    display === 'rate'
      ? pair('今日報酬率', formatRate(values.todayReturnRate), directionOf(values.todayReturnRate))
      : pair('今日報酬金額', `NT$${formatAmount(values.todayReturn)}`, directionOf(values.todayReturn))
  if (!showCost) return [today]

  const total =
    display === 'rate'
      ? pair('總報酬率', formatRate(values.totalReturnRate), directionOf(values.totalReturnRate))
      : pair('總報酬金額', `NT$${formatAmount(values.totalReturn)}`, directionOf(values.totalReturn))
  return [total, today]
}

/** 編輯模式的現金列：金額輸入框，變更時交給 onChange 處理 */
function cashRow({ value, disabled, onChange }) {
  const element = document.createElement('tr')
  element.className = 'cash-row'

  const input = document.createElement('input')
  input.type = 'number'
  input.min = '0'
  input.step = '1'
  input.className = 'cash-input'
  input.value = String(value)
  input.disabled = disabled
  input.addEventListener('change', () => onChange(input.value))

  const amountCell = cell('', 'numeric')
  amountCell.colSpan = 2
  amountCell.append(input, document.createTextNode(' 元'))
  element.append(cell('—', ''), cell('現金', ''), amountCell, cell('', 'actions'))
  return element
}

export function createTable(host, handlers = {}) {
  let headers = []
  let shownDisplay = null
  let shownShowCost = null
  let shownMode = null

  const colgroup = document.createElement('colgroup')
  const head = document.createElement('thead')
  const body = document.createElement('tbody')
  const table = document.createElement('table')
  table.append(colgroup, head, body)

  const board = document.createElement('div')
  board.className = 'board'
  board.append(table)
  host.append(board)

  const totals = document.createElement('footer')
  totals.className = 'totals'
  host.append(totals)

  function buildHead(display, showCost, mode) {
    shownDisplay = display
    shownShowCost = showCost
    shownMode = mode

    const columns = columnsFor(display, showCost, mode)
    const headRow = document.createElement('tr')

    headers = columns.map((column) => {
      const th = document.createElement('th')
      if (NUMERIC_KEYS.has(column.key)) th.className = 'numeric'

      const toggle = button(column.label, '')
      toggle.addEventListener('click', () => handlers.sort?.(column.key))
      th.append(toggle)

      headRow.append(th)
      return { column, th }
    })

    if (mode === 'edit') {
      const actionsHead = document.createElement('th')
      actionsHead.className = 'actions'
      actionsHead.textContent = '操作'
      headRow.append(actionsHead)
    }

    const cols = columns.map((column) => {
      const col = document.createElement('col')
      if (column.width !== null) col.style.width = `${column.width}px`
      return col
    })
    if (mode === 'edit') {
      const actionsCol = document.createElement('col')
      actionsCol.style.width = '200px'
      cols.push(actionsCol)
    }

    colgroup.replaceChildren(...cols)
    head.replaceChildren(headRow)
  }

  /** 空狀態：訊息放在表格內的一列，欄頭照常顯示（F1） */
  function emptyRow(mode, display, showCost) {
    const row = document.createElement('tr')
    const element = cell('', 'empty')
    element.colSpan = columnsFor(display, showCost, mode).length + (mode === 'edit' ? 1 : 0)

    element.append(span('尚未新增任何持股', 'empty-title'))
    if (mode === 'edit') {
      const add = button('新增股票', 'primary')
      add.addEventListener('click', () => handlers.requestAdd?.())
      element.append(add)
    } else {
      element.append(span('按右上角鉛筆即可新增', 'empty-hint'))
    }

    row.append(element)
    return row
  }

  function renderTotals(values, display, showCost) {
    const notes = document.createElement('div')
    notes.className = 'notes'
    if (values.excludedCount > 0) notes.append(span(`已排除 ${values.excludedCount} 檔：缺估值價`, ''))
    if (values.todayExcludedCount > 0) notes.append(span(`今日排除 ${values.todayExcludedCount} 檔：缺昨收`, ''))

    const parts = showCost
      ? [pair('總成本', `NT$${formatAmount(values.cost)}`, 'flat'), pair('總市值', `NT$${formatAmount(values.marketValue)}`, 'flat')]
      : []
    totals.replaceChildren(...parts, ...returnPairs(values, display, showCost), notes)
  }

  return {
    render({ rows, totals: values, sort, mode, draft, error, display, showCost, cash = null }) {
      if (shownDisplay !== display || shownShowCost !== showCost || shownMode !== mode) {
        buildHead(display, showCost, mode)
      }

      for (const { column, th } of headers) {
        if (column.key === sort.key) {
          th.setAttribute('aria-sort', sort.direction === 'asc' ? 'ascending' : 'descending')
        } else {
          th.removeAttribute('aria-sort')
        }
      }

      const bodyRows =
        rows.length === 0
          ? [emptyRow(mode, display, showCost)]
          : rows.map((row) => rowFor(row, { mode, draft, error }, handlers, display, showCost))
      if (mode === 'edit' && cash !== null) bodyRows.push(cashRow(cash))
      body.replaceChildren(...bodyRows)

      totals.hidden = mode === 'edit'
      if (mode !== 'edit') renderTotals(values, display, showCost)
    },
  }
}
