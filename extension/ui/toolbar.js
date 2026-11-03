function button(text, className) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.textContent = text
  return element
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('icon')

  const path = (d) => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    element.setAttribute('d', d)
    return element
  }

  if (name === 'pencil') {
    svg.append(path('M3 13l1-3 7-7 2 2-7 7-3 1z'), path('M9.5 4.5l2 2'))
  } else if (name === 'refresh') {
    svg.append(path('M13.5 8a5.5 5.5 0 1 1-1.7-4'), path('M13.5 2.5v3.2h-3.2'))
  } else {
    svg.append(path('M4 6.5l4 4 4-4'))
  }
  return svg
}

function iconButton(label, name) {
  const element = button('', 'icon-button')
  element.append(icon(name))
  element.title = label
  element.setAttribute('aria-label', label)
  return element
}

/** F6 / F17：工具列的顯示面板。面板外點擊或 Esc 關閉 */
export function createPopupToolbar({ onRefresh, onEdit, onDisplayChange, onCostChange }) {
  const toolbar = document.createElement('div')
  toolbar.className = 'toolbar'

  const title = document.createElement('h1')
  title.textContent = '台股庫存'

  const tally = document.createElement('span')
  tally.className = 'tally'

  const group = document.createElement('div')
  group.className = 'actions-group'

  const displayMenu = document.createElement('div')
  displayMenu.className = 'display-menu'

  const trigger = button('顯示', 'ghost display-trigger')
  trigger.setAttribute('aria-expanded', 'false')
  trigger.title = '顯示設定'
  const chevron = icon('chevron')
  chevron.classList.add('display-chevron')
  trigger.append(chevron)

  const panel = document.createElement('div')
  panel.className = 'display-panel'
  panel.hidden = true

  const costShow = button('顯示', 'segmented-option')
  const costHide = button('隱藏', 'segmented-option')
  const costOptions = new Map([
    [true, costShow],
    [false, costHide],
  ])
  const costControl = document.createElement('div')
  costControl.className = 'segmented'
  costControl.setAttribute('role', 'group')
  costControl.setAttribute('aria-label', '成本欄位')
  costControl.append(costShow, costHide)

  const rateOption = button('%', 'segmented-option')
  const amountOption = button('NT$', 'segmented-option')
  const displayOptions = new Map([
    ['rate', rateOption],
    ['amount', amountOption],
  ])
  const unitControl = document.createElement('div')
  unitControl.className = 'segmented'
  unitControl.setAttribute('role', 'group')
  unitControl.setAttribute('aria-label', '報酬單位')
  unitControl.append(rateOption, amountOption)

  const costLabel = document.createElement('span')
  costLabel.className = 'display-label'
  costLabel.textContent = '成本'
  const unitLabel = document.createElement('span')
  unitLabel.className = 'display-label'
  unitLabel.textContent = '單位'

  const grid = document.createElement('div')
  grid.className = 'display-grid'
  grid.append(costLabel, costControl, unitLabel, unitControl)
  panel.append(grid)
  displayMenu.append(trigger, panel)

  let showCost = true
  let display = 'rate'

  function closeDisplay() {
    if (panel.hidden) return
    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    document.removeEventListener('pointerdown', onDocumentPointerDown)
    document.removeEventListener('keydown', onDocumentKeyDown)
  }

  function openDisplay() {
    if (!panel.hidden) return
    panel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    document.addEventListener('pointerdown', onDocumentPointerDown)
    document.addEventListener('keydown', onDocumentKeyDown)
  }

  function onDocumentPointerDown(event) {
    if (event.target instanceof Node && !displayMenu.contains(event.target)) closeDisplay()
  }

  function onDocumentKeyDown(event) {
    if (event.key !== 'Escape') return
    closeDisplay()
    trigger.focus()
  }

  trigger.addEventListener('click', () => {
    if (panel.hidden) openDisplay()
    else closeDisplay()
  })

  costShow.addEventListener('click', () => {
    if (!showCost) onCostChange(true)
  })
  costHide.addEventListener('click', () => {
    if (showCost) onCostChange(false)
  })
  rateOption.addEventListener('click', () => {
    if (display !== 'rate') onDisplayChange('rate')
  })
  amountOption.addEventListener('click', () => {
    if (display !== 'amount') onDisplayChange('amount')
  })

  const refreshButton = iconButton('重新抓取報價', 'refresh')
  refreshButton.addEventListener('click', () => onRefresh())

  const editButton = iconButton('編輯持股', 'pencil')
  editButton.addEventListener('click', () => onEdit())

  group.append(displayMenu, refreshButton, editButton)
  toolbar.append(title, tally, group)

  return {
    element: toolbar,
    setTally(text) {
      tally.textContent = text
    },
    setDisplay(next) {
      display = next
      for (const [value, option] of displayOptions) option.setAttribute('aria-pressed', String(value === next))
    },
    setCost(next) {
      showCost = next
      for (const [value, option] of costOptions) option.setAttribute('aria-pressed', String(value === next))
    },
    setRefreshing(value) {
      refreshButton.disabled = value
      refreshButton.classList.toggle('spinning', value)
    },
    closeDisplay,
  }
}
