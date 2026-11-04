import { formatWeight } from '../domain/format.js'
import { WEIGHT_TOLERANCE } from '../domain/rebalance.js'
import { defaultTargets } from '../data/storage.js'
import { createDragHandle } from './rowDrag.js'

function div(className) {
  const element = document.createElement('div')
  element.className = className
  return element
}

function cell(text, className = '') {
  const element = document.createElement('td')
  element.className = className
  element.textContent = text
  return element
}

function weightInput(value, disabled) {
  const input = document.createElement('input')
  input.type = 'number'
  input.min = '0'
  input.max = '100'
  input.step = '0.1'
  input.className = 'weight-input'
  input.value = String(value)
  input.disabled = disabled
  return input
}

/**
 * 權重設定表格：股票列加一列唯讀的現金。`input` 只更新畫面，
 * `change`（失焦或 Enter）才透過 `onChange` 儲存。
 */
export function createWeightTable({ onChange, onReorder }) {
  const element = div('weight-view')

  const board = div('board')
  const table = document.createElement('table')
  table.className = 'weight-table'

  const colgroup = document.createElement('colgroup')
  for (const width of [96, null, 160]) {
    const col = document.createElement('col')
    if (width !== null) col.style.width = `${width}px`
    colgroup.append(col)
  }

  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const [label, className] of [
    ['代號', ''],
    ['名稱', ''],
    ['目標權重', 'numeric'],
  ]) {
    const th = document.createElement('th')
    th.className = className
    th.textContent = label
    headRow.append(th)
  }
  head.append(headRow)

  const body = document.createElement('tbody')

  const foot = document.createElement('tfoot')
  const footRow = document.createElement('tr')
  const footLabel = document.createElement('td')
  footLabel.colSpan = 2
  footLabel.textContent = '權重合計'
  const footValue = document.createElement('td')
  footValue.className = 'numeric'
  const sumText = document.createElement('span')
  sumText.className = 'weight-sum'
  footValue.append(sumText)
  footRow.append(footLabel, footValue)
  foot.append(footRow)

  table.append(colgroup, head, body, foot)
  board.append(table)

  const warning = document.createElement('p')
  warning.className = 'weight-warning'
  warning.textContent = '股票權重合計不可超過 100%'
  warning.hidden = true

  const errorText = document.createElement('p')
  errorText.className = 'weight-warning'
  errorText.hidden = true

  element.append(board, warning, errorText)

  let holdings = []
  let targets = defaultTargets()
  let disabled = false
  let cashWeightCell = null

  function readInputs() {
    let sum = 0
    for (const input of body.querySelectorAll('input[data-kind]')) {
      const value = Number(input.value)
      sum += Number.isFinite(value) ? value : 0
    }
    return sum
  }

  function updateSum() {
    const stockSum = readInputs()
    const cashWeight = Math.max(0, 100 - stockSum)
    sumText.textContent = formatWeight(stockSum + cashWeight)
    const off = stockSum > 100 + WEIGHT_TOLERANCE
    sumText.classList.toggle('alert', off)
    warning.hidden = !off
    if (cashWeightCell !== null) cashWeightCell.textContent = formatWeight(cashWeight)
  }

  function showError(text) {
    errorText.textContent = text
    errorText.hidden = false
  }

  function clearError() {
    errorText.hidden = true
  }

  function emit() {
    onChange?.({ ...targets, weights: { ...targets.weights } })
  }

  function parseWeight(input, code) {
    const value = Number(input.value)
    if (input.value === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      input.value = String(targets.weights[code] ?? 0)
      showError('目標權重必須是 0–100 的數字')
      updateSum()
      return null
    }

    const normalized = Math.round(value * 10) / 10
    input.value = String(normalized)
    clearError()
    return normalized
  }

  function stockRow(holding) {
    const row = document.createElement('tr')
    row.dataset.code = holding.code
    const codeCell = cell(holding.code)
    codeCell.prepend(createDragHandle((from, to) => onReorder?.(from, to)))
    row.append(codeCell, cell(holding.name))

    const weightCell = cell('', 'numeric')
    const input = weightInput(targets.weights[holding.code] ?? 0, disabled)
    input.dataset.kind = 'weight'
    input.dataset.code = holding.code
    input.addEventListener('input', updateSum)
    input.addEventListener('change', () => {
      const normalized = parseWeight(input, holding.code)
      if (normalized === null) return
      if (normalized === 0) delete targets.weights[holding.code]
      else targets.weights[holding.code] = normalized
      updateSum()
      emit()
    })

    weightCell.append(input, document.createTextNode(' %'))
    row.append(weightCell)
    return row
  }

  function cashRow() {
    const row = document.createElement('tr')
    row.className = 'cash-row'
    row.append(cell('—'), cell('現金'))

    cashWeightCell = cell('', 'numeric')
    row.append(cashWeightCell)
    return row
  }

  function render(next) {
    holdings = next.holdings
    targets = { ...next.targets, weights: { ...next.targets.weights } }
    disabled = next.disabled === true
    clearError()

    body.replaceChildren(...holdings.map(stockRow), cashRow())
    updateSum()
  }

  return { element, render }
}
