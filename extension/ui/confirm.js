function button(text, className) {
  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.textContent = text
  return element
}

/** 二次確認（取代桌面版的原生對話框）。回傳 true 代表確定 */
export function confirmAction({ title, detail, confirmLabel = '刪除' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div')
    overlay.className = 'modal-overlay'

    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-modal', 'true')

    const heading = document.createElement('h2')
    heading.textContent = title

    const body = document.createElement('p')
    body.textContent = detail

    const actions = document.createElement('div')
    actions.className = 'modal-actions'

    const cancel = button('取消', 'ghost')
    const confirm = button(confirmLabel, 'ghost modal-danger')

    actions.append(cancel, confirm)
    modal.append(heading, body, actions)
    overlay.append(modal)

    function finish(value) {
      document.removeEventListener('keydown', onKeyDown, true)
      overlay.remove()
      resolve(value)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        finish(false)
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        finish(true)
      }
    }

    cancel.addEventListener('click', () => finish(false))
    confirm.addEventListener('click', () => finish(true))
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false)
    })

    document.addEventListener('keydown', onKeyDown, true)
    document.body.append(overlay)
    confirm.focus()
  })
}
