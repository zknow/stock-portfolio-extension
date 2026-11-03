import { isValidCode, isValidCost, isValidShares } from '../domain/validate.js'
import { lookup as lookupEntry } from '../data/symbols.js'

export const MARKET_LABEL = { listing: '上市', otc: '上櫃' }

/** 允許千分位逗號；其餘交給 isValidShares / isValidCost 判定 */
export function parseNumber(text) {
  return Number(text.replace(/,/g, '').trim())
}

/** 'invalid' | 'unknown' | 'found' */
export function resolveCode(code, lookup) {
  if (!isValidCode(code)) return 'invalid'
  return lookup(code) === undefined ? 'unknown' : 'found'
}

/** F2：回傳錯誤訊息，null 代表通過 */
export function validateAdd(input, exists) {
  if (!isValidCode(input.code)) return '代號需為 4–6 位英數字'
  if (exists(input.code)) return '代號已存在，請改用編輯'
  if (input.name.trim() === '') return '查無此代號，請展開「強制新增」並自填名稱'
  if (!isValidShares(parseNumber(input.shares))) return '股數必須為正整數'
  if (!isValidCost(parseNumber(input.averageCost))) return '平均成本必須為正數'
  return null
}

export function toHolding(input) {
  return {
    code: input.code,
    name: input.name.trim(),
    market: input.market,
    shares: parseNumber(input.shares),
    averageCost: parseNumber(input.averageCost),
  }
}

function inputElement(id) {
  const element = document.createElement('input')
  element.type = 'text'
  element.id = id
  element.autocomplete = 'off'
  return element
}

function labeled(labelText, control) {
  const wrap = document.createElement('div')
  wrap.className = 'field'

  const label = document.createElement('label')
  label.textContent = labelText
  if (control.id !== '') label.htmlFor = control.id

  wrap.append(label, control)
  return wrap
}

function button(text, className) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.textContent = text
  return element
}

/**
 * 新增表單（僅 edit 頁）。對照表還沒載入完成前代號欄停用，
 * 避免把「還沒載入」誤判成「查無此代號」。
 */
export function createAddForm({ exists, submit }) {
  let table = null
  let input = { code: '', name: '', market: 'listing', shares: '', averageCost: '' }
  let forcing = false

  const codeInput = inputElement('add-code')
  const sharesInput = inputElement('add-shares')
  const costInput = inputElement('add-cost')
  const nameInput = inputElement('add-name')

  const marketSelect = document.createElement('select')
  marketSelect.id = 'add-market'
  for (const [value, label] of Object.entries(MARKET_LABEL)) {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    marketSelect.append(option)
  }

  const resolved = document.createElement('span')
  resolved.className = 'resolved'

  const forceButton = button('強制新增', 'ghost')
  forceButton.hidden = true
  forceButton.addEventListener('click', () => {
    forcing = true
    forceButton.hidden = true
    escapeFields.hidden = false
    nameInput.focus()
  })

  const escapeFields = document.createElement('div')
  escapeFields.className = 'addform-row'
  escapeFields.hidden = true
  escapeFields.append(labeled('市場', marketSelect), labeled('名稱', nameInput))

  const errorText = document.createElement('p')
  errorText.className = 'form-error'
  errorText.hidden = true

  const submitButton = button('新增', 'primary')
  submitButton.type = 'submit'

  const cancelButton = button('取消', 'ghost')
  cancelButton.addEventListener('click', () => close())

  const nameField = document.createElement('div')
  nameField.className = 'field'
  const nameLabel = document.createElement('span')
  nameLabel.className = 'label'
  nameLabel.textContent = '名稱'
  nameField.append(nameLabel, resolved, forceButton)

  const firstRow = document.createElement('div')
  firstRow.className = 'addform-row'
  firstRow.append(
    labeled('代號', codeInput),
    nameField,
    labeled('股數', sharesInput),
    labeled('平均成本', costInput),
    submitButton,
    cancelButton,
  )

  const form = document.createElement('form')
  form.className = 'addform'
  form.append(firstRow, escapeFields, errorText)

  function showError(message) {
    errorText.textContent = message ?? ''
    errorText.hidden = message === null
  }

  function find(code) {
    return table === null ? undefined : lookupEntry(table, code)
  }

  function syncResolved() {
    const status = resolveCode(input.code, find)
    const entry = find(input.code)

    if (entry !== undefined) {
      input.name = entry.name
      input.market = entry.market
      forcing = false
      nameInput.value = entry.name
      marketSelect.value = entry.market
      resolved.textContent = `${entry.name} · ${MARKET_LABEL[entry.market]}`
      resolved.classList.remove('alert')
      escapeFields.hidden = true
      forceButton.hidden = true
      return
    }

    input.name = ''
    nameInput.value = ''
    escapeFields.hidden = !forcing
    forceButton.hidden = status !== 'unknown' || forcing
    resolved.textContent = status === 'unknown' ? '查無此代號' : '代號需為 4–6 位英數字'
    resolved.classList.toggle('alert', status === 'unknown')
  }

  function reset() {
    input = { code: '', name: '', market: 'listing', shares: '', averageCost: '' }
    forcing = false
    codeInput.value = ''
    sharesInput.value = ''
    costInput.value = ''
    nameInput.value = ''
    marketSelect.value = 'listing'
    resolved.textContent = table === null ? '對照表載入中' : '輸入代號後自動帶入'
    resolved.classList.remove('alert')
    forceButton.hidden = true
    escapeFields.hidden = true
    showError(null)
  }

  function open() {
    reset()
    codeInput.focus()
  }

  function close() {
    reset()
  }

  async function submitForm() {
    const error = validateAdd(input, exists)
    if (error !== null) {
      showError(error)
      return
    }

    const failure = await submit(toHolding(input))
    if (failure !== null) {
      showError(failure)
      return
    }

    reset()
    codeInput.focus()
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitForm()
  })
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  })

  codeInput.addEventListener('input', () => {
    input.code = codeInput.value.trim().toUpperCase()
    showError(null)
    syncResolved()
  })
  sharesInput.addEventListener('input', () => {
    input.shares = sharesInput.value
    showError(null)
  })
  costInput.addEventListener('input', () => {
    input.averageCost = costInput.value
    showError(null)
  })
  nameInput.addEventListener('input', () => {
    input.name = nameInput.value
    showError(null)
  })
  marketSelect.addEventListener('change', () => {
    input.market = marketSelect.value === 'otc' ? 'otc' : 'listing'
  })

  codeInput.disabled = true
  reset()

  return {
    element: form,
    open,
    close,
    setTable(next) {
      table = next
      codeInput.disabled = false
      reset()
    },
    setEnabled(enabled) {
      submitButton.disabled = !enabled
      cancelButton.disabled = !enabled
    },
  }
}
