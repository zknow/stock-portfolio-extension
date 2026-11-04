import { directionOf, formatPrice, formatRate } from '../domain/format.js'
import { timeText } from '../domain/time.js'

export function indexSummary(index) {
  if (index === null || index.price === null) return null

  const price = formatPrice(index.price)
  if (index.previousClose === null) return { price, change: null, rate: null, direction: 'flat' }

  const change = index.price - index.previousClose
  const direction = directionOf(change)
  const rate = `(${formatRate(change / index.previousClose)})`
  if (direction === 'flat') return { price, change: '0.00', rate, direction }

  const arrow = direction === 'up' ? '△' : '▽'
  return { price, change: `${arrow}${formatPrice(Math.abs(change))}`, rate, direction }
}

const SOURCE_LABEL = { mis: 'MIS 即時', yahoo: 'Yahoo' }

function span(text, className) {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  return element
}

/** F15：更新時間、來源、資料時間、錯誤，右側加權指數 */
export function createStatusBar(host) {
  const bar = document.createElement('footer')
  bar.className = 'status'
  host.append(bar)

  return {
    render({ fetchedAt, source, dataAt, error, index }) {
      const parts = []

      if (fetchedAt !== null) {
        parts.push(span(`更新於 ${timeText(new Date(fetchedAt))}`, ''))
      }
      if (source !== null) parts.push(span(SOURCE_LABEL[source], 'source'))
      if (dataAt !== null) parts.push(span(`資料時間 ${dataAt}`, ''))
      if (error !== null) parts.push(span(error, 'alert'))

      const summary = indexSummary(index)
      if (summary !== null) {
        const group = document.createElement('span')
        group.className = `index ${summary.direction}`
        group.append(span('加權指數', 'index-label'), span(summary.price, 'index-price'))
        if (summary.change !== null && summary.rate !== null) {
          group.append(span(summary.change, ''), span(summary.rate, ''))
        }
        parts.push(group)
      }

      bar.replaceChildren(...parts)
    },
  }
}
