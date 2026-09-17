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

## 沒做的

- 沒在正式站加梁或廁所——結構元件的實測數字由 Andre 之後在編輯器的結構模式輸入。
