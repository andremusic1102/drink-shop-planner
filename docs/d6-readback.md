# D6 readback — 2026-09-17 上線後從正式站讀回來的狀態

deploy：`cd worker && CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09 npm run deploy`
→ `Current Version ID: 83717e6a-a92c-4168-bc66-1a7598ff54ec`，兩個 hostname
（drinkshop.andremusic.dev、drinkshop-new.andremusic.dev）。

deploy 時的 `git rev-parse HEAD`：`08cfece1b69fad6d3f4094b0b8de5feec9456f1e`
讀回時間：2026-09-17T16:36:38Z

## `curl -s https://drinkshop-new.andremusic.dev/api/structure`（原文）

```json
{"rev":0,"elements":[{"id":"entry-1","kind":"entry","floor":1,"name":"玄關 175×100","x":1125,"y":0,"w":175,"d":100},{"id":"stairs-1","kind":"stairs","floor":1,"name":"樓梯 267×100","x":858,"y":0,"w":267,"d":100},{"id":"bath-1","kind":"bath","floor":1,"name":"廁所 140×269","x":137,"y":106,"w":140,"d":269}],"updatedAt":null}
```

rev 0 ＝ 還沒有人在正式站存過結構，回的是 `DEFAULT_STRUCTURE`（1F 三個殼）。

## `curl -s https://drinkshop-new.andremusic.dev/api/plans`

deploy 前後各抓一次，`diff` 相同：

```
3 plans
413c34c07d6f4988 328 洗手台工作台未定
0a53a59670a84df0 17 目前擺法
65576960635fea51 179 牆在正中間
```

id 清單不含 `structure`（列表路由 SQL 與 JS 兩層過濾）。

## 靜態檔

`/floors.js` 200、`/rules.js` 200（`npm run build` 複製自 `worker/src/`）。

## 舊方案在新版前端（Playwright 對 drinkshop-new，只看不改）

「洗手台工作台未定」（rev 328、37 件、JSON 內 0 件有 `floor` 欄）：

| 動作 | 結果 |
|---|---|
| 開啟 | 1F 畫出 36 件＋1 件隱藏＝37 件；殼：玄關／樓梯／廁所；pill「✓ 已同步」 |
| 切 2F | 0 件；投影 1F 玄關／樓梯／廁所／神明桌 |
| 開「編輯結構」 | `plan.structmode` 為 true、面板顯示「🏗 編輯結構中…設備已鎖住」 |
| 關掉、等 1.5s 後讀 API | 三份方案 rev 仍是 328／17／179，`/api/structure` rev 仍 0（沒有誤寫） |
| page errors | 0 |

## 第二次 deploy（`.it.bad` class 修正）＋在正式站實際加梁、存、重載、刪

第二次 deploy：`Current Version ID: 7e147e71-4288-404a-baee-cd30dac22e9c`，`git rev-parse HEAD` = `97f39c62b743dff1d77f76584c2e2e43274da787`。
第三次 deploy（面板違規文字去重）：`636cb23d-024b-4221-869d-74216a1a3e0a`，當時該改動尚未 commit，之後併入 `442f714b3376dd3ff413b98ffdff4b10dfe7ee79`（app.html 與部署版一致）。

Playwright 對 drinkshop-new，方案「洗手台工作台未定」：

| 步驟 | `/api/structure` 讀回 |
|---|---|
| 開結構模式 →「＋ 梁」（寬 30）→ 面板改名「測試梁（可刪）」 | rev 4，beams=[["測試梁（可刪）",1,0,100,1300,30]] |
| 重載頁面、重開方案 | `.fx` = 玄關／樓梯／廁所／**測試梁（可刪）**；結構模式關著；神明桌 `.it.bad.shrinebad` 1 件（該方案神明桌 rot≠0 → facing 違規，真實結果） |
| 結構模式選「測試梁（可刪）」→ 刪除 | rev 5，elements = entry@1／stairs@1／bath@1；history [5,4,3,2,1] |
| 方案 rev | 328／17／179 全程不動 |

（rev 1–3 是同一流程第一次跑到一半被 prompt 對話框打斷留下的 add／rename／delete，最終狀態同 rev 5。）

## 三根真的梁（Andre 2026-09-17 給的舊圖，樓梯換邊前，虛線＝梁）

讀圖假設：圖直放、上方門弧＝玄關端＝編輯器 x=1300；圖總長 38.8 單位≈1300 cm；每對虛線＝一根梁兩邊。
`PUT /api/structure` baseRev 5 → `{"ok":true,"rev":6}`，讀回：

```
梁1（近玄關） x=1062 y=0 w=57 d=375
梁2（中段）   x=670  y=0 w=44 d=375
梁3（後段）   x=174  y=0 w=61 d=375
```

是估的，Andre 在編輯器結構模式拖正。梁2 壓到「洗手台工作台未定」的神明桌（x 650–717）→ 該方案神明桌現在兩條違規（facing＋beam）。

## 第四次 deploy（kind 限四種＋縮圖屬性跳脫，U11）＋一次誤寫與回復

`Current Version ID: aa6f790a-d095-4823-b4f6-bb27740220ba`。

deploy 後我立刻用 `PUT baseRev 6` 送壞 kind 驗證——**錯誤**：新版還沒傳到邊緣，舊版接受了，
而且 body 是整份 elements，把正式站結構換成只剩那個壞元件（rev 7）。
立刻 `POST /api/structure/restore {rev:6}` → rev 8，讀回 6 個元件（三殼＋三梁）完整。
20 秒後再驗，改用 `baseRev 0`（就算沒擋也只會 409、不會覆寫）：三次都 400，rev 仍 8。

教訓：deploy 後的驗證請求必須是不可能寫入成功的（舊 baseRev／唯讀端點），不能拿正式資料當靶。
