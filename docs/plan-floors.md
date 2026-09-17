# 2–4F 樓層 + 可編輯建築結構 + 神明桌限制 — 計畫

2026-09-17 grill 定案。術語見 `CONTEXT.md`（方案／建築結構／結構元件／設備／樓層／投影／神明桌限制／正面）。

## 定案（grill 結果）

| 題 | 決定 |
|---|---|
| 樓層怎麼進編輯器 | 同一張圖切樓層 tab，其他樓層用投影疊上來 |
| 梁／樓梯／廁所是什麼 | **建築結構**，跟方案無關；但要能在 UI 改位置、加廁所（2–4F 會再加） |
| 結構存哪 | **一份共用**，所有方案同步；`plans` 表保留 id `structure` 一列，PUT／409／版本紀錄／回復全部沿用；列表過濾掉它 |
| 外框 | 四層同框 1300×375，原點同 1F CAD 左上 |
| 結構怎麼改 | 「編輯結構」開關：開著只能動結構元件、關著只能動設備 |
| 投影畫什麼 | 其他樓層的結構元件 ＋ 較低樓層的神明桌；**可開關** |
| 違規處置 | **只警告**：神明桌紅框、面板列出撞到誰、被撞的投影同時紅；照常同步 |
| 神明桌三條 | ① 同層梁下 ② **正上一層**同位置有廁所（不是所有較高樓層） ③ 正面朝 +x（圖右、玄關側） |
| 其他規則 | 先沒有；規則引擎回傳 `{rule, ...}` 清單留擴充點 |
| 縮圖 | 只畫 1F 的設備＋1F 結構 |
| 新方案預設 | 只有 1F 設備；2–4F 空 |
| 實測數字 | 2–4F 與梁的尺寸**不是開工前提**——結構在 UI 裡輸入，沒數字也能開發與部署 |

## 資料模型

```
item.floor        1|2|3|4，缺＝1（設備、量測線都有）
item.rot          神明桌 rot=0 → 正面朝 +x；90 → +y；180 → −x；270 → −y

structure = { elements:[ {id, kind:'beam'|'stairs'|'bath'|'entry', floor, name, x,y,w,d} ] }
  存在 plans 表 id='structure'，plan 欄放 {elements:[...]}，rev 沿用該列的 rev
  GET 讀不到 → 回目前寫死的 1F 三個殼（玄關／樓梯／廁所）當預設，所以不用 migration
```

`rules.js` 的 `shrineViolations(items, elements)`：
- `beam`：同層 `kind:'beam'` 相交
- `bath`：`floor === shrine.floor + 1` 的 `kind:'bath'` 相交
- `facing`：`(rot||0) % 360 !== 0`

## Prerequisites (human)

- Cloudflare 個人帳號已登入、能部署：`cd worker && CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09 npx wrangler whoami`

## Deliverable

- [ ] D1: 規則引擎改成三條新規則
  `worker/src/rules.js`：`shrineViolations(items, elements)` 回 `{rule:'beam'|'bath'|'facing', floor, name, shrineId}` 清單；bath 只看正上一層；`SHELL` 改名 `DEFAULT_STRUCTURE`（1F 三個殼，含 `kind`）。同時補 `worker/package.json` 的 `build` script（`app.html`→`public/index.html`、`src/rules.js`／`src/floors.js`→`public/`），`deploy` 先跑 `build`。
  Completion criterion: `cd worker && node --test tests/rules.test.js` 全綠，且 `worker/tests/rules.test.js` 含測試名「擺在梁下 → 1 筆 beam」「正上一層廁所下 → 1 筆 bath」「隔兩層的廁所不算」「rot=90 → 1 筆 facing」「空地且 rot=0 → 0 筆」；`grep -c "export const DEFAULT_STRUCTURE" worker/src/rules.js` 回 1；`grep -c '"build"' worker/package.json` 回 1。

- [ ] D2: 結構 API
  `worker/src/index.js`：`GET /api/structure`（缺列回 `DEFAULT_STRUCTURE`、rev 0）、`PUT /api/structure`（body `{structure, baseRev}`，同 plans 的 409 語意、寫 revisions）、`GET /api/structure/history`、`POST /api/structure/restore`；`GET /api/plans` 過濾掉 id `structure`。
  Completion criterion: `cd worker && node --test tests/routes.test.js` 全綠，且 `worker/tests/routes.test.js` 含測試名「GET /api/structure 無列 → 回預設 1F 三個殼」「PUT /api/structure baseRev 舊 → 409」「GET /api/plans 不含 structure」。

- [ ] D3: 前端樓層＋投影
  `app.html`（根目錄，是前端原始檔；`worker/public/index.html` 是 build 複製出來的）：`curFloor` 狀態＋1F–4F tab；所有迭代設備的地方改走 `cur()`（只看當層）；投影層（可開關 `id="projToggle"`）畫其他層結構元件＋較低層神明桌；量測線帶 `floor`；新方案預設只 1F；配置碼 IO 帶 `floor`。純函式（`cur`、`projection`、`floorOf`）抽到 `worker/src/floors.js` 供測試，`app.html` 用 `<script type="module">` 從 `./floors.js` 載入。
  Completion criterion: `grep -c "items.forEach" app.html` 回 0；`cd worker && node --test tests/floors.test.js` 全綠，且 `worker/tests/floors.test.js` 含測試名「cur() 只回當層，floor 缺算 1F」「投影：在 1F 含 2F 廁所、不含 1F 廁所」「投影：在 2F 含 1F 神明桌、不含 1F 冰箱」。

- [ ] D4: 前端結構模式＋紅框
  「編輯結構」開關 `id="structMode"`：開著結構元件可選可拖、有「＋ 梁／＋ 廁所／＋ 樓梯」、設備鎖住；關著反之。結構獨立 PUT `/api/structure`，409 提示文字與方案分開。神明桌違規：`.it.bad` 紅框、選取面板列出 `rule/floor/name`、被撞的投影加 `.bad`。可拖集合的判斷抽成 `draggableSet(mode, items, elements)` 放 `floors.js`。
  Completion criterion: `grep -c 'id="structMode"' app.html` 回 1；`grep -c "shrineViolations(" app.html` ≥ 1；`worker/tests/floors.test.js` 含測試名「結構模式開著：可拖集合只含結構元件」「結構模式關著：可拖集合只含設備」且 `cd worker && node --test tests/floors.test.js` 全綠。

- [ ] D5: 縮圖
  `thumbSvg(plan, structure)` 只畫 floor=1（或缺）的設備；結構從 structure 列讀，缺則 `DEFAULT_STRUCTURE`；梁畫斜線填色。
  Completion criterion: `worker/tests/routes.test.js` 含測試名「縮圖不含 floor=2 的 item」「縮圖畫出 structure 列的梁」且 `cd worker && node --test tests/routes.test.js` 全綠。

- [ ] D6: 上線＋readback
  `cd worker && npm run deploy`（兩個 hostname 同一個 Worker），deploy 前先本機 miniflare 開舊方案確認不壞。deploy 後在 `drinkshop-new.andremusic.dev` 開一份舊方案、切樓層、開結構模式加一根梁、存、重載。
  Completion criterion: `docs/d6-readback.md` 記錄 `curl -s https://drinkshop-new.andremusic.dev/api/structure` 的原文回傳（含 `rev` 與 `elements` 陣列）、`curl -s https://drinkshop-new.andremusic.dev/api/plans` 的 id 清單不含 `structure`、以及 `git rev-parse HEAD`；vault `50_Projects/106號一樓 飲料店改裝.md` 補「梁／樓上廁所在編輯器結構模式輸入」一行（用 Read／Write，不經 Bash）。

## 不做

- 樓上套房的設備清單（先只有結構）。
- 每層不同外框、3D、剖面、梁高。
- 擋存檔。
- 除神明桌外的規則。

## 風險

- `index.html` 裸 `items` 迭代 15 處，漏一處＝別層東西跑進來 → D3 用 grep 當完成標準。
- 兩個 hostname 同一個 Worker，沒有真正的 staging → D6 deploy 前先本機開舊方案。
- 結構跟方案分開存，兩個 rev 各自 409；同時被父母改到時提示文字要分開（D4）。
- 父母正在用正式站：D6 只在他們不在用的時段 deploy，deploy 後立刻開舊方案驗。
