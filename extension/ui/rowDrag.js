/**
 * 把手拖曳排序。放開時以 `onDrop(fromCode, toCode)` 回報；
 * 目標列由游標所在的 `tr[data-code]` 決定，無目標或取消時不回報。
 */
export function createDragHandle(onDrop) {
  const handle = document.createElement('span')
  handle.className = 'drag-handle'
  handle.textContent = '≡'
  handle.setAttribute('aria-hidden', 'true')

  handle.addEventListener('pointerdown', (event) => {
    const row = handle.closest('tr')
    if (event.button !== 0 || row === null) return

    event.preventDefault()
    handle.setPointerCapture(event.pointerId)
    row.classList.add('dragging')
    let target = null

    const mark = (next) => {
      target?.classList.remove('drop-target')
      target = next
      target?.classList.add('drop-target')
    }

    const move = (moveEvent) => {
      const hit = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY)?.closest('tr[data-code]') ?? null
      mark(hit === row ? null : hit)
    }

    const finish = (drop) => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', up)
      handle.removeEventListener('pointercancel', cancel)
      row.classList.remove('dragging')
      const to = target
      mark(null)
      if (drop && to !== null) onDrop(row.dataset.code, to.dataset.code)
    }

    const up = () => finish(true)
    const cancel = () => finish(false)

    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up)
    handle.addEventListener('pointercancel', cancel)
  })

  return handle
}
