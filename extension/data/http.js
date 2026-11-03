export const DEFAULT_TIMEOUT_MS = 10_000

/**
 * 唯一的傳輸出口。extension page 有 host_permissions，不受 CORS 限制。
 * 沒有逾時的話網路卡住時 popup 會一直停在載入中。
 */
export async function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { status: response.status, body: await response.text() }
}
