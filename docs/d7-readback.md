# D4 readback：直向檢視＋四層並排＋暫放 上線（plans/view.md）

2026-09-17 21:56 CDT。deploy 的程式碼：`git rev-parse HEAD` = `a74578063f25378331d9473bddfb337d3332ae01`
（D6 暫放那筆；D1–D6 都在這之前）。Wrangler Version ID `031aef3a-fd1d-4fc8-a1b5-3729fa882aa7`，
兩個 hostname（drinkshop／drinkshop-new）同一個 Worker。

## deploy 前：本機 miniflare 開正式站方案副本

正式站「洗手台工作台未定」（rev 335、36 件、6 條量測線）POST 到本機 D1 成 `898e161b7dc87020`，
Playwright 開它：切橫向單層 → 切回直向四層 → 拖「外場冰箱」再拖回 → 存檔（rev 2）。
36 件的 `x/y/w/d/rot/flip/hidden/floor` 逐件比對：**0 差異**；量測線 6 條都在；console 0 錯誤。

## deploy 後：drinkshop-new 開同一份舊方案

`curl -s https://drinkshop-new.andremusic.dev/api/plans/413c34c07d6f4988` 裡同一件 1F 設備（id 6）：

```
before rev 335 {"n": "外場冰箱", "c": "cold", "w": 75, "d": 78, "x": 989.5309276590453, "y": 297, "h": 182, "id": 6, "rot": 0, "door": false}
after  rev 337 {"n": "外場冰箱", "c": "cold", "w": 75, "d": 78, "x": 989.5309276590453, "y": 297, "h": 182, "id": 6, "rot": 0, "door": false}
```

中間發生的事（Playwright 對著 drinkshop-new）：
- 開方案：4 個 `.plan[data-floor]`、直向、四層並排（桌機寬度初始值）、1F 面板畫出正式站結構 6 個元件、35 個可見設備（1 件隱藏）、同步燈「✓ 已同步」。
- 2F 新增「readback 測試（可刪）」並拖動 → rev 336（伺服器回傳 `{"id":73,"floor":2,"x":180.1,"y":0}`）。
- 重載、重開方案：2F 那件還在。
- 選取後刪除 → rev 337，伺服器回傳裡已無 id 73。
- 36 件原有設備前後比對 `x/y/w/d/rot/floor/hidden`：**0 差異**；console 0 錯誤。

線上靜態檔：`curl https://drinkshop-new.andremusic.dev/` 含 `id="orientToggle"`／`id="allFloors"`／`id="more"`；`/view.js` 是 D1 的檔。

## 沒驗的

- 手機（<720px）初始單層：只在桌機 viewport（1400×900）跑過；邏輯是 `window.innerWidth>=720`。
- 匯出 PDF 的列印對話框（PNG 走同一個 `buildSVG`，本機驗過 SVG 內容）。
