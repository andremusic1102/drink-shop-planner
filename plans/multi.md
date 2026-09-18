# 複製整層 + 多選家具 — 計畫

2026-09-18 定案。術語見 `CONTEXT.md`。前提：plans/structure.md 已上線、seal 6/6（docs/seal-structure.md）。

起因：2F／3F 格局幾乎一樣，一件一件「複製到」太慢；排家具時常要一組一起搬、一起複製。

## 定案（AskUserQuestion 結果）

| 題 | 決定 |
|---|---|
| 複製整層帶什麼 | **設備＋結構**：來源層的全部設備（家具／門／舊的隔間牆設備）＋結構裡的廁所與房間隔層；梁與樓梯不複製（每層本來就有）、玄關不複製 |
| 目標層已有東西 | **先清空再複製，要 confirm**：清掉目標層的全部設備＋廁所＋房間隔層（梁／樓梯／玄關留著）；confirm 文字寫清楚會清掉幾件 |
| 多選怎麼選 | **「多選」開關＋桌機 Shift 點擊**：開關開著點一件加一件、再點取消；桌機 Shift+點也加；不做框選 |
| 多選後拖 | **整群一起動**：拖其中一件，其他被選的跟著同一個位移；吸附只算被拖的那件；每件各自夾在畫布內 |
| 多選能做什麼 | 複製（同層各偏移 30）、複製到 nF、搬到 nF、刪除、隱藏；Delete 鍵刪整群 |
| 多選的範圍 | 只有設備（結構元件不多選；結構模式下多選開關無效） |
| 複製整層的入口 | 目前樓層 tab 旁「複製整層到…」下拉（1F–4F，不含自己） |
| id | 新 id 照現有規則（設備 `uid++`、結構 `elId(kind)`） |

## Prerequisites (human)

- Cloudflare 個人帳號已登入、能部署：`cd worker && CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09 npx wrangler whoami`

## Deliverable

- [ ] D1: 純函式
  `worker/src/floors.js`：`copyFloor(items, elements, from, to, nextItemId, nextElId)` → `{items, elements}`：先移除目標層的全部設備與 kind 為 `bath`／`partition` 的結構元件，再把來源層的設備與 `bath`／`partition` 元件 `cloneTo(…, to, newId)` 過去（位置不變）；`from === to` 或樓層不合法回原物件不變。`cloneMany(items, ids, toFloor, nextItemId)` → 新設備陣列（同層各偏移 30、跨層同位置；順序照原本）；`moveMany(items, ids, toFloor)` → 只改 floor。`COPYABLE_KINDS = ["bath","partition"]` 匯出。
  Completion criterion: `cd worker && node --test tests/floors.test.js` 全綠，且含測試名「複製整層：目標層清空後只剩來源的設備與廁所隔層，梁樓梯玄關不動」「複製整層：來源層原樣不動、新 id 不重複」「複製整層：from 等於 to 不動」「多選複製：同層各偏移 30、跨層同位置」「多選搬層：只改 floor」。

- [ ] D2: 前端多選
  `app.html`：`selSet`（Set）取代單一 `sel` 當選取集合（`sel` 仍指最後點的那件）；開關 `<input id="multiToggle">`（結構模式下 disabled）；設備 `pointerdown`：開關開著或 `e.shiftKey` → 加入／移出 `selSet`，否則單選；所有在 `selSet` 的 `.it` 加 `.sel`；拖曳：被拖的照舊夾＋吸附，其他被選的套同一位移、各自 `clampPos`；`endDrag` 存檔；選取面板 `selSet.size>1` 時顯示「已選 n 件」＋按鈕 `id="mdup"`（複製）／`<select id="mcopy">`（複製到）／`<select id="mmove">`（搬到）／`id="mdel"`／`id="mhide"`；Delete 鍵刪整群；`buildList` 的 chip 也反映 `selSet`。
  Completion criterion: `grep -c 'id="multiToggle"' app.html` 回 1；`grep -c 'id="mcopy"' app.html`、`'id="mmove"'`、`'id="mdup"'`、`'id="mdel"'` 各回 1；`grep -c "cloneMany(" app.html` ≥ 1；`grep -c "moveMany(" app.html` ≥ 1；`cd worker && node --test` 全綠。

- [ ] D3: 前端複製整層
  `app.html`：樓層 tab 旁 `<select id="copyFloor">`（「複製整層到…」＋其他三層）；選了先 `confirm('會先清掉 nF 的 X 件設備、Y 個廁所／房間隔層，再把 mF 的 … 複製過去')`，確認後 `copyFloor(...)` → `items`／`elements` 換成回傳值、`save()`＋`saveStructure()`、`setFloor(目標層)`。
  Completion criterion: `grep -c 'id="copyFloor"' app.html` 回 1；`grep -c "copyFloor(" app.html` ≥ 1；`grep -c "confirm(" app.html` ≥ 3（原本兩處＋這處）；`cd worker && node --test` 全綠。

- [ ] D4: 上線＋readback
  `npm run deploy`；deploy 後在 drinkshop-new 開「原始平面圖（8.dwg）」：多選開關選 2F 的床＋衣櫃「複製到 4F」、存、重載 4F 有兩件新的；再 2F「複製整層到 4F」confirm 後 4F 只剩 2F 的內容（含廁所／隔層）、梁樓梯還在；重載確認。
  Completion criterion: `docs/d9-readback.md` 記錄 deploy 的 Version ID、`git rev-parse HEAD`（deploy 當下）、`curl -s https://drinkshop-new.andremusic.dev/api/plans/56535dee6d7a0102` 中 4F 的 items 數（複製整層前／後）、`curl -s https://drinkshop-new.andremusic.dev/api/structure` 中 4F 各 kind 計數（前／後）。

## 不做

- 框選、鍵盤方向鍵微調。
- 結構元件多選。
- 複製整層帶量測線。
- 跨方案複製（另一份方案的樓層）。

## 風險

- 多選取代單選是前端最核心的狀態：`sel` 用在 render／updateSel／buildList／rotate／dup／del／hide／dragging 十幾處 → D2 讓 `sel` 保留為「主選」，`selSet` 是超集合，單選路徑行為不變；用 Playwright 驗單選拖曳、旋轉、刪除照舊。
- 複製整層會清目標層：confirm 文字帶件數；資料有版本紀錄（方案 restore、結構 restore）。
- 群組拖曳每件各自夾在畫布內，被夾到的會跟群組脫開一點——接受。
