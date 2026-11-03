/** 可排序的鍵。`marketValue` 不顯示於表格，但為預設排序鍵 */
export const SORT_KEYS = [
  'code',
  'name',
  'shares',
  'averageCost',
  'price',
  'totalReturn',
  'totalReturnRate',
  'todayReturn',
  'todayReturnRate',
  'marketValue',
]

/**
 * 持股：`{ code, name, market, shares, averageCost }`
 * 報價：`{ code, price, valuationPrice, previousClose, traded, dataDate }`
 * 加權指數：`{ price, previousClose, dataDate }`
 * 報價批次：`{ source, quotes, index, fetchedAt }`
 * 排序狀態：`{ key, direction }`
 * UI 偏好：`{ sortKey, sortDirection, returnDisplay, showCost, rebalance }`
 * 權重設定：`{ schemaVersion, cash, cashWeight, weights }`
 */
