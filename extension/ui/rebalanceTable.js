import { MISSING, formatAmount, formatShares, formatWeight } from '../domain/format.js'

function div(className) {
  const element = document.createElement('div')
  element.className = className
  return element
}

function span(text, className = '') {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

function cell(text, className = '') {
  const element = document.createElement('td')
  element.className = className
  element.textContent = text
  return element
}

function nameCell(name) {
  const element = cell('', '')
  element.title = name
  element.append(span(name, 'name-text'))
  return element
}

function pair(label, text) {
  const box = div('pair')
  box.append(span(label, 'label'), span(text, 'value'))
  return box
}

function signedAmount(value) {
  const rounded = Math.round(value)
  if (rounded === 0) return 'NT$0'
  return `${rounded > 0 ? '+' : '−'}NT$${formatAmount(Math.abs(rounded))}`
}

function deltaClass(delta) {
  const rounded = Math.round(delta)
  if (rounded === 0) return 'flat'
  return rounded > 0 ? 'up' : 'down'
}

function stockSuggestion(row) {
  if (row.suggestedShares === null) return { text: MISSING, muted: true }
  if (row.suggestedShares === 0) return { text: '不需調整', muted: false }
  const shares = formatShares(Math.abs(row.suggestedShares))
  return { text: row.suggestedShares > 0 ? `買 ${shares} 股` : `賣 ${shares} 股`, muted: false }
}

function cashSuggestion(row) {
  if (row.suggestedAmount === null) return { text: MISSING, muted: true }
  const rounded = Math.round(row.suggestedAmount)
  if (rounded === 0) return { text: '不需調整', muted: false }
  const amount = formatAmount(Math.abs(rounded))
  return {
    text: rounded > 0 ? `增加約 NT$${amount}` : `減少約 NT$${amount}`,
    muted: false,
  }
}

function noteFor(result) {
  if (result.reason === 'missing-quotes') return `缺現價，無法計算：${result.missing.join('、')}`
  if (result.reason === 'weight-sum') return `權重合計 ${formatWeight(result.weightSum)}，請調整為 100%`
  if (result.reason === 'no-weights') return '尚未設定權重，請到編輯頁的權重設定'
  if (result.reason === 'no-assets') return '總資產為 0，無法計算'
  return null
}

/** 再平衡表格：依 |差額| 由大到小排序，現金固定最後 */
export function createRebalanceTable() {
  const element = div('rebalance-view')

  const board = div('board')
  const table = document.createElement('table')
  table.className = 'rebalance-table'

  const head = document.createElement('thead')
  const headRow = document.createElement('tr')
  for (const [label, className] of [
    ['代號', ''],
    ['名稱', ''],
    ['現值', 'numeric'],
    ['目標權重', 'numeric'],
    ['現況權重', 'numeric'],
    ['差額', 'numeric'],
    ['建議', 'suggestion'],
  ]) {
    const th = document.createElement('th')
    th.className = className
    th.textContent = label
    headRow.append(th)
  }
  head.append(headRow)

  const body = document.createElement('tbody')
  table.append(head, body)
  board.append(table)

  const totals = document.createElement('footer')
  totals.className = 'totals'

  element.append(board, totals)

  function emptyRow(text) {
    const row = document.createElement('tr')
    const element = cell('', 'empty')
    element.colSpan = 7
    element.append(span(text, 'empty-title'))
    row.append(element)
    return row
  }

  function bodyRows(result) {
    const stocks = result.rows
      .filter((row) => row.kind === 'stock')
      .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    const cash = result.rows.find((row) => row.kind === 'cash')

    const rows = []
    for (const row of stocks) {
      const suggestion = stockSuggestion(row)
      const element = document.createElement('tr')
      element.append(
        cell(row.code),
        nameCell(row.name),
        cell(row.value === null ? MISSING : formatAmount(row.value), `numeric ${row.value === null ? 'muted' : ''}`),
        cell(formatWeight(row.targetWeight), 'numeric'),
        cell(
          row.currentWeight === null ? MISSING : formatWeight(row.currentWeight * 100),
          `numeric ${row.currentWeight === null ? 'muted' : ''}`,
        ),
        cell(
          row.delta === null ? MISSING : signedAmount(row.delta),
          `numeric ${row.delta === null ? 'muted' : deltaClass(row.delta)}`,
        ),
        cell(suggestion.text, suggestion.muted ? 'suggestion muted' : 'suggestion'),
      )
      rows.push(element)
    }

    if (cash !== undefined) {
      const suggestion = cashSuggestion(cash)
      const element = document.createElement('tr')
      element.className = 'cash-row'
      element.append(
        cell(MISSING, 'muted'),
        nameCell(cash.name),
        cell(formatAmount(cash.value), 'numeric'),
        cell(formatWeight(cash.targetWeight), 'numeric'),
        cell(
          cash.currentWeight === null ? MISSING : formatWeight(cash.currentWeight * 100),
          `numeric ${cash.currentWeight === null ? 'muted' : ''}`,
        ),
        cell(
          cash.delta === null ? MISSING : signedAmount(cash.delta),
          `numeric ${cash.delta === null ? 'muted' : deltaClass(cash.delta)}`,
        ),
        cell(suggestion.text, suggestion.muted ? 'suggestion muted' : 'suggestion'),
      )
      rows.push(element)
    }

    return rows
  }

  function renderTotals(result) {
    const notes = div('notes')
    const note = noteFor(result)
    if (note !== null) notes.append(span(note, ''))

    const missing = result.missing.length > 0
    const parts = [
      pair(missing ? '總資產（已知）' : '總資產', `NT$${formatAmount(result.total)}`),
      pair('股票市值', `NT$${formatAmount(result.stockValue)}`),
      pair('現金', `NT$${formatAmount(result.cash)}`),
      pair('權重合計', formatWeight(result.weightSum)),
    ]
    totals.replaceChildren(...parts, notes)
  }

  return {
    element,
    render({ result, loading }) {
      if (loading) {
        body.replaceChildren(emptyRow('報價載入中…'))
        totals.hidden = true
        return
      }

      if (result.rows.length === 0) {
        body.replaceChildren(emptyRow('尚未新增持股'))
        totals.hidden = true
        return
      }

      body.replaceChildren(...bodyRows(result))
      totals.hidden = false
      renderTotals(result)
    },
  }
}
