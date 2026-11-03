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

export function errorText(error) {
  return error instanceof Error ? error.message : String(error)
}
