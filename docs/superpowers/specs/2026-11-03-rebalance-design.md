# 再平衡功能設計

日期：2026-11-03
狀態：已實作

## Mockup

- `mockups/edit-rebalance.html`：編輯頁與權重設定頁籤（`?tab=weight` 直接開權重頁、`?tab=weight&sum=90` 看權重不足的警告）。
- `mockups/popup-rebalance.html`：popup 再平衡檢視（`?state=ok` 開再平衡、`?state=90` 權重 90%、`?state=missing` 缺價、`?panel=1` 開顯示面板）。

兩者都是靜態假資料，只用來確認版面與互動，不是正式實作。

## 目的

讓使用者設定每檔持股與現金的目標權重，並在 popup 開啟「再平衡」時，直接看到依目前市值計算出的買賣建議。現在的擴充功能只能看現值與報酬，沒有「配置比例」的概念。

## 目標

- 編輯頁新增頁籤：`編輯` / `權重設定`。
- 權重設定頁可設定：
  - 每檔股票的目標權重（百分比）。
  - 目前現金金額（NT$）。
  - 現金的目標權重（百分比）。
- 股票權重＋現金權重合計必須為 100%，畫面即時顯示合計。
- popup 的「顯示」面板新增「再平衡」開關。
- 開啟再平衡後，表格切換為再平衡欄位，列出每檔持股與現金的現值、目標權重、現況權重、差額、建議買賣。
- 設定存在 `chrome.storage.local`，重開瀏覽器仍在。

## 非目標

- 不做自動交易、交易紀錄、手續費、證交稅、股利。
- 不考慮新資金投入或提領；再平衡前後總資產不變。
- 不做歷史再平衡、排程提醒、通知。
- 不支援匯入／匯出。
- 編輯頁不抓報價；權重設定頁不顯示現值與現況權重，那些只在 popup 的再平衡檢視出現。
- 不支援放空；賣出股數不得超過目前持股。

## 反目標

- 不把現金寫進 `holdings`，也不讓現金借用「股數／平均成本」欄位。
- 權重合計不是 100% 時，不自動正規化、不硬算建議。
- 缺現價時不給出可能誤導的買賣建議。
- 買／賣字樣維持中性色；只有「差額」欄用紅綠表示正負（正紅、負綠），沿用台股慣例。其餘介面仍不得用紅綠。

## 已決定的設計

- 100% 基準：總資產＝股票市值合計＋目前現金。
- 權重基準：市值（`valuationPrice × shares`）。
- 現金由使用者輸入「目前金額」與「目標權重」；目標金額＝目標權重 × 總資產。
- 現金列獨立呈現，只放金額與目標權重。
- popup 開啟再平衡時切換表格欄位，不是疊加清單。
- 權重合計容差 ±0.1 個百分點；超出容差只顯示警告，不給建議。
- 缺 `valuationPrice` 的持股視為無法估值，整份再平衡不給建議，並列出代號。
- 建議股數四捨五入到整股；現金調整量以「股票建議金額的負和」為準，確保計畫守恆。
- 權重以百分比數字儲存（0–100，最多一位小數）。
- 使用新的 storage key，不動 `holdings` schema。

## 資料模型

### 新 storage key

`TARGETS_KEY = 'targets'`

```json
{
  "schemaVersion": 1,
  "cash": 50000,
  "cashWeight": 20,
  "weights": { "2330": 40, "0050": 40 }
}
```

- `cash`：目前現金金額，NT$，整數，≥ 0。預設 0。
- `cashWeight`：現金目標權重，百分比，0–100，最多一位小數。預設 0。
- `weights`：代號 → 目標權重（百分比）。只保留合法代號（`isValidCode`）且值為 0–100 的項目；其餘丟棄。只儲存大於 0 的權重，0 視同未設定、不寫入。
- 持股沒有對應的 weight 時視為 0。
- 已刪除持股留下的 weight 不參與計算；刪除持股時順手清掉。

### `parseTargets(value)`

- 非物件或格式不對 → 回 `{ schemaVersion: 1, cash: 0, cashWeight: 0, weights: {} }`。
- `schemaVersion` 高於支援版本 → 同上，不拋錯。
- `cash` 不是有限數字或 < 0 → 0；合法值四捨五入到整數。
- `cashWeight` 不是有限數字或不在 0–100 → 0；合法值四捨五入到一位小數。
- `weights` 不是物件 → `{}`。
- `weights` 的值必須是 `number`。非 number（含字串）直接丟棄，不轉成 0；合法值四捨五入到一位小數。
- `parseTargets` 是唯一正規化邊界；`computeRebalance` 假設收到的都是 number，不再做字串轉換。

### `load()` 回傳值

`extension/data/storage.js` 的 `load()` 增加讀取 `TARGETS_KEY`，回傳值多一個 `targets` 欄位。`error` 仍然只代表持股資料損毀，不混入 targets 的錯誤。

### 偏好設定

`DEFAULT_PREFS` 增加 `rebalance: false`。`readPrefs` 驗證為 boolean，`savePrefs` 一併寫入。

## 再平衡計算

新增純函式模組 `extension/domain/rebalance.js`，不碰 DOM、不碰 chrome API，方便用 `node --test` 測試。

### 輸入

```js
computeRebalance({ holdings, quotes, targets })
```

- `holdings`：`{ code, name, market, shares, averageCost }[]`
- `quotes`：`Map<code, quote>`；quote 形狀見 `domain/types.js`
- `targets`：`{ cash, cashWeight, weights }`

### 計算步驟

1. 對每檔持股取 `valuationPrice`。`valuationPrice` 為 `null` 的持股列入 `missing`。
2. `weightSum = cashWeight + Σ weights[holding.code] ?? 0`（只算現有持股）。
3. `stockValue = Σ valuationPrice × shares`（只算有 `valuationPrice` 的持股）。
4. `total = stockValue + cash`。
5. 檢查，依序回傳失敗原因：
   - 沒有持股且 `cash <= 0` → `no-assets`
   - `missing.length > 0` → `missing-quotes`
   - 尚未設定任何權重（`cashWeight === 0` 且現有持股在 `weights` 都沒有項目）→ `no-weights`
   - `Math.abs(weightSum - 100) > 0.1` → `weight-sum`
   - `total <= 0` → `no-assets`
6. 每檔股票：
   - `value = valuationPrice × shares`
   - `targetWeight = weights[code] ?? 0`
   - `currentWeight = value / total`
   - `delta = (targetWeight / 100) × total − value`
   - `suggestedShares = Math.round(delta / valuationPrice)`
   - 賣出夾住：`suggestedShares = Math.max(suggestedShares, -shares)`
   - `suggestedAmount = suggestedShares × valuationPrice`
7. 現金列：
   - `value = cash`
   - `targetWeight = cashWeight`
   - `currentWeight = cash / total`
   - `delta = (cashWeight / 100) × total − cash`
   - `suggestedAmount = -Σ 股票 suggestedAmount`（用取整後的股數回推，確保守恆）
8. `residual = Σ 股票 suggestedAmount + cash suggestedAmount`，正常為 0；保留欄位供測試斷言。

### 失敗時的欄位約定

`ok === false` 時，`rows` 仍列出所有持股與現金列，讓畫面顯示現值：

- `no-weights` / `weight-sum`：`currentWeight` 照算；`delta`、`suggestedShares`、`suggestedAmount` 為 `null`。
- `missing-quotes`：缺價持股的 `value` 為 `null`；所有列的 `currentWeight`、`delta`、`suggested*` 為 `null`（總資產不完整，不能拿來算比例）。
- `no-assets`：所有列的 `currentWeight`、`delta`、`suggested*` 為 `null`；若同時沒有任何持股且 `cash === 0`，`rows` 為空陣列。
- `total` 仍回傳「已知現值＋現金」的數字，但 `ok === false` 時不得用來算建議。

### 回傳值

```js
{
  ok: boolean,
  reason: null | 'no-assets' | 'missing-quotes' | 'no-weights' | 'weight-sum',
  weightSum: number,
  total: number,
  stockValue: number,
  cash: number,
  missing: string[],
  rows: [
    {
      kind: 'stock',
      code, name,
      price: number | null,
      value: number | null,
      targetWeight: number,
      currentWeight: number | null,
      delta: number | null,
      suggestedShares: number | null,
      suggestedAmount: number | null
    },
    {
      kind: 'cash',
      code: null,
      name: '現金',
      price: null,
      value: number,
      targetWeight: number,
      currentWeight: number | null,
      delta: number | null,
      suggestedShares: null,
      suggestedAmount: number | null
    }
  ]
}
```

`ok === false` 時，`rows` 仍可回傳（讓畫面顯示現值與現況權重），但 `suggestedShares`／`suggestedAmount` 一律為 `null`。實作上可先算完再依 `ok` 清空建議欄位。

### 邊界

- 目標權重 0 → 建議賣到 0 股。
- 目標權重 100 且現金權重 0 → 現金目標為 0，現金列建議減少全部現金。
- `shares` 為 0 的持股：現值 0，建議買入到目標；賣出夾住不適用（`-0`）。
- 報價缺 `valuationPrice`（現價與昨收都沒有）→ 整份不給建議。
- 當日無成交但有昨收 → `valuationPrice` 有值，照常計算。
- 股數取整造成的誤差：`|delta − suggestedAmount| < valuationPrice`；畫面不顯示取整提示。

### 顯示格式

- 現值、差額、建議金額：`formatAmount`（整數、千分位）。
- 權重：新 helper `formatWeight(value)`，固定一位小數加 `%`，例如 `40.0%`。
- 股數：`formatShares`（整數、千分位）。
- 現價：`formatPrice`。

## 編輯頁

### 頁籤

工具列改為：

```
台股庫存 · 編輯    [編輯] [權重設定]            共 N 檔
```

- 用兩個 `<button role="tab">`，容器 `role="tablist"`。
- 選中狀態用 `aria-selected="true"`；CSS 以底線或 `surface-raised` 區分。
- 預設 `編輯`。頁籤狀態不持久化。
- 切到 `權重設定` 時：
  - 隱藏新增表單。
  - 隱藏原本的持股表格。
  - 顯示權重表格。
  - `共 N 檔` 照常顯示。
  - `saveErrorText` 仍顯示（持股或權重儲存失敗共用）。

### 權重表格

新增 `extension/ui/weightTable.js`，不要塞進現有的 `ui/table.js`。

欄位：

| 代號 | 名稱 | 目標權重 |
|---|---|---|

- 股票列：代號、名稱、目標權重輸入（`%`）。
- 現金列固定在最後一列：
  - 代號顯示 `—`
  - 名稱欄顯示 `現金` 加一個金額輸入（NT$）
  - 目標權重輸入
- 表格下方 `<tfoot>` 顯示 `權重合計` 與合計值。
- 合計偏離 100%（超過 ±0.1）時，合計值用 `--warn` 上色，並顯示提示「股票＋現金權重需為 100%」。
- 股票列依代號升冪排序，與編輯頁一致。

輸入規則：

- 目標權重：`<input type="number" min="0" max="100" step="0.1">`。
- 現金金額：`<input type="number" min="0" step="1">`。
- `input` 事件只更新本地狀態與合計，不寫 storage。
- `change` 事件（失焦或 Enter）才驗證並寫入。
- 無效值（非數字、超範圍）→ 還原成最後一次有效的值，並在該列顯示錯誤訊息（`--warn`，不可用紅綠）。
- 目標權重寫入前四捨五入到一位小數；現金金額四捨五入到整數。

儲存：

- `saveTargets(targets)` 寫入 `TARGETS_KEY`。
- 失敗時顯示在 `saveErrorText`，不阻擋使用者繼續操作。
- 刪除持股成功後，從 `weights` 移除該代號並儲存；失敗只記 console，不影響刪除結果。
- 新增持股不預設權重（視為 0），合計會變成不足 100%，由畫面提示。

## popup

### 顯示面板

`extension/ui/toolbar.js` 的顯示面板新增一列：

```
再平衡   [關] [開]
```

- 使用與「成本」「單位」相同的 `.segmented` 樣式。
- 面板 grid 第一欄改為 `auto`，避免「再平衡」三字被截斷。
- 開啟再平衡時，隱藏「成本」與「單位」兩列（它們不影響再平衡檢視）。
- 關閉時恢復。
- `onRebalanceChange(next)` 回呼；`setRebalance(next)` 同步 UI。
- 偏好寫入 `prefs.rebalance`。

### 畫面切換

- popup 同時建立一般表格與再平衡表格，用 `hidden` 切換。
- 再平衡開啟時：
  - 一般表格與其 totals 隱藏。
  - 再平衡表格與其 totals 顯示。
  - 狀態列保留（報價時間、來源、指數仍有用）。
- 再平衡關閉時恢復原本行為。

### 再平衡表格

新增 `extension/ui/rebalanceTable.js`。

欄位：

| 代號 | 名稱 | 現值 | 目標權重 | 現況權重 | 差額 | 建議 |
|---|---|---|---|---|---|---|

- 股票列：
  - 建議：`買 1,000 股` / `賣 500 股` / `不需調整`（股數為 0 時）。
  - 差額：`+NT$12,000`（紅） / `−NT$8,000`（綠） / `NT$0`（中性）。
- 現金列：
  - 代號 `—`，名稱 `現金`。
  - 建議：`增加約 NT$12,000` / `減少約 NT$8,000` / `不需調整`。「約」是因為金額由取整後的股票交易回推。
- 排序：依 `|delta|` 由大到小，現金列固定最後。讓使用者先看到動作最大的標的。
- 顏色：
  - 差額：正數 `--up`（紅）、負數 `--down`（綠）、零用中性色。
  - 買／賣、增加／減少字樣用中性色或 `--accent`，不用紅綠。
- totals footer：
  - `總資產 NT$xxx`（缺價時標示 `總資產（已知）`）
  - `股票市值 NT$xxx`
  - `現金 NT$xxx`
  - `權重合計 100.0%`
  - 有缺價或合計錯誤時，多一行警告。

### 失敗與空狀態

| 情況 | 畫面 |
|---|---|
| 尚未新增持股且現金 0 | 表格顯示「尚未新增持股」 |
| 尚未設定任何權重（`reason === 'no-weights'`） | 「尚未設定權重，請到編輯頁的權重設定」 |
| 權重合計 ≠ 100% | 顯示合計值與「請調整為 100%」，不顯示建議 |
| 缺 `valuationPrice` | 「N 檔缺現價，無法計算」並列代號 |
| 總資產 ≤ 0 | 「總資產為 0，無法計算」 |
| 報價尚未載入（`batch` 為 `null` 且沒有錯誤） | 再平衡表格顯示「報價載入中…」；不改 `statusBar.js` |

## 檔案變更

| 檔案 | 變更 |
|---|---|
| `extension/domain/rebalance.js` | 新增：計算與驗證 |
| `extension/domain/format.js` | 新增 `formatWeight` |
| `extension/data/storage.js` | 新增 `TARGETS_KEY`、`parseTargets`、`saveTargets`；`load()` 回傳 `targets`；prefs 加 `rebalance` |
| `extension/ui/weightTable.js` | 新增：權重表格 |
| `extension/ui/rebalanceTable.js` | 新增：再平衡表格 |
| `extension/ui/toolbar.js` | 顯示面板加再平衡開關 |
| `extension/ui/theme.css` | 頁籤、權重表格、再平衡表格樣式 |
| `extension/edit/edit.js` | 頁籤切換、權重表格、targets 載入與儲存 |
| `extension/popup/popup.js` | 讀 targets、再平衡開關、切換表格 |
| `README.md` | 功能與操作說明 |
| `package.json` | 加 `test` script（`node --test`） |
| `test/rebalance.test.js` | 新增：計算測試 |
| `test/storage.test.js` | 新增：targets 正規化與偏好測試 |

## 測試

使用 Node 內建 `node:test`，因為專案已是 ESM（`"type": "module"`）。`rebalance.js` 必須保持純函式，不 import chrome。

必測案例：

1. 兩檔股票＋現金，權重合計 100%，驗證 `value`、`delta`、`suggestedShares`、`suggestedAmount`。
2. 權重合計 98.5% → `ok === false`、`reason === 'weight-sum'`、建議為 `null`。
3. 缺 `valuationPrice` → `ok === false`、`reason === 'missing-quotes'`、`missing` 含代號。
4. 現金權重 100%、股票權重 0 → 股票全部賣出，現金增加。
5. 目標權重 0 → 賣到 0 股，且不超過持有股數。
6. 股數取整後，股票建議金額＋現金建議金額 = 0（守恆）。
7. 總資產 0 → `no-assets`。
8. 當日無成交但有 `valuationPrice`（昨收）→ 正常計算。
9. 完全沒設權重 → `reason === 'no-weights'`。
10. `weight-sum` 失敗時 `currentWeight` 有值、`delta` 為 `null`；`missing-quotes` 失敗時 `currentWeight` 也為 `null`。

手動驗證：

1. 載入擴充功能，編輯頁切到權重設定，設定兩檔＋現金合計 100%。
2. 重整 popup，開啟再平衡，確認欄位、現金列、建議方向與金額。
3. 把權重改成 90%，確認 popup 顯示警告且沒有建議。
4. 刪除一檔持股，確認權重設定不再出現該代號。

## 實作決定（我的判斷，請一併檢查）

這些是設計過程中我自己定的，不需要你回答，但你可以否決：

- 失敗時的 `null` 約定：`no-weights`／`weight-sum` 仍顯示現況權重；`missing-quotes`／`no-assets` 連現況權重都不顯示，避免用不完整的總資產誤導。
- 數值正規化只在 `parseTargets` 與輸入 `change` 事件做；`weights` 的非 number 值直接丟棄，不轉 0。
- `weights` 只存大於 0 的項目，0 視同未設定，用來區分「尚未設定」與「合計 0%」。
- 「報價載入中」只顯示在再平衡表格，不動 `statusBar.js`。
- 再平衡表格依 `|delta|` 由大到小排序，現金列固定最後。
- 差額用紅綠（正紅、負綠）；買／賣字樣維持中性色。
- popup 不顯示「股數四捨五入」提示；計算仍取整到股。
- 現金建議金額以「股票建議金額的負和」為準，確保取整後計畫仍守恆。
- 測試用 Node 內建 `node:test`，不引入外部測試框架。

## 留給實作

- CSS 具體數值、欄寬、間距。
- 頁籤是否支援左右方向鍵切換（非必要）。
- 再平衡表格的欄寬與 `table-layout` 細節；popup 最寬 800px、最高 420px，必要時縮短欄位標題。
- 錯誤訊息文案的微調。
- `formatWeight` 是否放在 `format.js` 或 `rebalance.js`。
- 測試檔的輔助 builder 寫法。
