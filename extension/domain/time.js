function pad(value) {
  return String(value).padStart(2, '0')
}

/** 本地日期，YYYY-MM-DD */
export function dateText(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 本地日期，YYYYMMDD。與 MIS 的 `d` 欄位同格式 */
export function dateKey(now) {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}

/** 本地時間，HH:mm:ss */
export function timeText(now) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

/** 最新報價的資料時間，YYYY/MM/DD HH:mm；無時間時為 null */
export function latestDataAt(quotes) {
  const stamps = quotes.filter((quote) => quote.dataTime).map((quote) => `${quote.dataDate} ${quote.dataTime}`)
  if (stamps.length === 0) return null
  const [date, time] = stamps.sort().at(-1).split(' ')
  return `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)} ${time.slice(0, 5)}`
}

export function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}
