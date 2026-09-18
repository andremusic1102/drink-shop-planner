---
contract_commit: "655965fa51e56bec219aadd9c3571fe11de970f2"
---

# 直向檢視 + 四層並排 — 計畫

2026-09-17 定案。術語見 `CONTEXT.md`（方案／建築結構／結構元件／設備／樓層／投影）。

起因：Andre 找到原始 CAD（Google Drive `106號裝潢/8.dwg`），四層直向並排一眼看完；
編輯器目前是單層橫向（玄關在右），對照很累。

## 定案（AskUserQuestion 結果）

| 題 | 決定 |
|---|---|
| 方向 | **直向為預設**（順時針轉 90°：玄關在下、樓梯在右，跟 DWG 同向），保留橫向開關 |
| 四層並排 | 開關；**初始值照視窗寬**：≥720px 四層、<720px 單層（跟既有手機斷點同一個數字）；之後記住使用者自己切的（localStorage，每台裝置各記各的） |
| 匯出 PNG／PDF | **跟著檢視**：看到什麼匯什麼；四層並排時一張圖就是 DWG 那樣的平面圖 |
| 資料 | **完全不動**：座標系仍是 1300×375、原點 CAD 左上、玄關 +x；只加檢視轉換 |
| 標籤 | 維持水平（用座標轉換，不是整塊 CSS `rotate`——那樣字會躺著） |
| 面板排列 | 直向四層：左到右 1F–4F（跟 DWG 一樣）；橫向四層：上到下 1F–4F（跟 tab 順序一致） |
| 設備可改欄位 | 名稱＋長／寬／高；位置 X／Y **不開**，位置只能拖 |
| 四層時的「目前樓層」 | 點哪個面板、或在哪個面板開始拖，那層就是目前樓層，tab 跟著亮；新增設備／量測／結構元件都進目前樓層 |
| 投影 | 四層並排時投影開關**預設關**（四層都看得到，不用疊）；單層時照舊預設開。神明桌違規的紅框不靠投影：四層時被壓到的梁／廁所在它自己那層的面板上直接標紅（`.fx.bad`，機制已存在） |
| 縮圖 | 不動，列表卡維持 1F 橫向 |
| 規則文字 | 「正面沒有朝門口（圖的右邊）」改「正面沒有朝門口那側」，不綁方向 |
| 方向詞 | 選取面板「距牆 左／右／上／下」改用地標：**後牆**（x=0）／**門口側**（x=1300）／**樓梯側**（y=0）／**對面牆**（y=375），橫直切換都不變；術語進 CONTEXT.md |
| 工具列 | 分享網址／PNG／PDF／匯出匯入／重設擺法／清量距／隱藏清單 收進「⋯ 更多」，預設不直接顯示；拿掉「＋ 窗戶」 |
| 設備清單 | 側邊清單預設收合，要隱藏特定東西再打開 |
| 暫放 | 設備可拖到框外、畫布任何空白邊都能放（含四層並排的面板空隙）；暫放＝位置在框外，不加欄位；暫放的不算重疊／間距／規則、不匯出、不進縮圖 |
| 設備尺寸 | 所有一般設備（含 DWG 匯入的家具）點選後可改名稱與長／寬／高 |

## 檢視轉換

`view = { orient: 'v' 或 'h', floors: [1,2,3,4] 或 [curFloor] }`

| 轉換 | 橫向 'h'（面板 1300×375） | 直向 'v'（順時針 90°，面板 375×1300） |
|---|---|---|
| 矩形 模型→畫面 | sx=x, sy=y, sw=w, sh=d | sx=PLAN_H−y−d, sy=x, sw=d, sh=w |
| 拖曳 delta 畫面→模型 | dx=dsx, dy=dsy | dx=dsy, dy=−dsx |
| 點 畫面→模型 | x=sx, y=sy | x=sy, y=PLAN_H−sx |
| 門／窗顯示角度 | rot | rot+90 |

驗算：玄關 (x=1125,y=0,w=175,d=100) 在 'v' → sx=275, sy=1125, sw=100, sh=175：右下角 ✓（樓梯側在右、玄關在下）。

## Prerequisites (human)

- Cloudflare 個人帳號已登入、能部署：`cd worker && CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09 npx wrangler whoami`

## Deliverable

- [ ] D1: 檢視轉換純函式
  `worker/src/view.js`：`toScreen(view, rect)`→`{sx,sy,sw,sh}`、`fromScreenDelta(view, dsx, dsy)`→`{dx,dy}`、`toModelPoint(view, sx, sy)`→`{x,y}`、`panelSize(view)`→`{w,h}`、`visualRot(view, rot)`；`view.orient` 只認 `'v'|'h'`，其他值當 `'v'`。`worker/package.json` 的 `build` 把 `src/view.js` 一起複製到 `public/`。
  Completion criterion: `cd worker && node --test tests/view.test.js` 全綠，且 `worker/tests/view.test.js` 含測試名「直向：玄關落在面板右下角」「直向：拖曳 delta 轉回模型後再轉回畫面等於原值」「直向：點在面板左上角 = 模型 (0, 375)」「橫向：toScreen 是恆等」「門 rot=0 直向顯示 90」；`grep -c "view.js" worker/package.json` ≥ 1。

- [ ] D2: 前端多面板
  `app.html`：`.planwrap` 內依 `view.floors` 放 1 或 4 個 `.plan[data-floor]`（照定案表的「面板排列」：直向四層左到右 1F–4F、橫向四層上到下 1F–4F；每個面板上方標「nF」）；`place()`、量測線 SVG、距離標示（`.gap`／`.gapln`）、投影、結構元件、設備全走 `toScreen`；拖曳與量測點擊用 `fromScreenDelta`／`toModelPoint`；門窗 `style.transform` 用 `visualRot`；`fit()` 依面板數與方向算 `scale`（直向四層：寬度 = 4×面板寬＋3×間距；橫向四層：高度 = 4×面板高＋3×間距）；面板 `pointerdown` 先 `setFloor(面板樓層)`；開關 `id="orientToggle"`（直向／橫向）與 `id="allFloors"`（四層／單層）存 localStorage `drinkshop_view`；單一 `plan` 元素的引用全部改成 per-panel（`panelOf(floor)`）。
  Completion criterion: `grep -c 'id="orientToggle"' app.html` 回 1；`grep -c 'id="allFloors"' app.html` 回 1；`grep -c "plan\.appendChild" app.html` 回 0；`grep -c "plan\.querySelectorAll" app.html` 回 0；`grep -c "toScreen(" app.html` ≥ 5；`grep -c "圖的右邊" app.html` 回 0；`cd worker && node --test` 全綠。

- [ ] D3: 匯出跟著檢視
  `buildSVG()` 依目前 `view` 畫：直向時每層一個 `<g data-floor="n">`，四層並排一張；比例尺與標題照舊。
  Completion criterion: `grep -c 'data-floor=' app.html` ≥ 1（在 buildSVG 內）；`cd worker && node --test tests/build.test.js` 全綠。

- [ ] D4: 上線＋readback（**D5、D6 做完才跑第一次 deploy**；之後 seal 發現的修正可再 deploy，每次都在 readback 記一段：HEAD、Version ID、驗了什麼）
  `cd worker && npm run deploy`，deploy 前本機 miniflare 開舊方案確認：四層並排時 1F 設備位置跟橫向單層一致（同一件設備的 x/y 存檔前後不變）、切回橫向單層跟今天長得一樣。deploy 後在 `drinkshop-new.andremusic.dev` 開一份舊方案、四層並排拖 2F 一件家具、存、重載、確認 1F 沒動。
  Completion criterion: `docs/d7-readback.md` 記錄 deploy 前後 `curl -s https://drinkshop-new.andremusic.dev/api/plans/<id>` 中同一件 1F 設備的 `x,y` 相同、`git rev-parse HEAD`。

- [ ] D5: 工具列收納＋設備尺寸可編輯＋拿掉窗戶＋清單預設收合（2026-09-17 追加）
  `app.html`：「🔗 分享網址／🖼 PNG／🖨 PDF／匯出/匯入／重設擺法／清量距／隱藏清單」收進一顆 `id="more"`（⋯ 更多）的下拉，預設不直接顯示；側邊設備清單**預設收合**（要隱藏某件才去打開），收合狀態存 localStorage；拿掉 `id="addWin"` 按鈕（既有的窗戶項目照常顯示、可選可刪，只是不能再新增）；一般設備（非門／窗／牆）的選取面板加名稱與長寬高輸入框 `id="iname"`／`id="iw"`／`id="id"`／`id="ih"`，改了即存（`save(); render()`），長寬下限 5、高度可空，位置 X／Y 不開；匯入的家具（DWG 那批）就靠這個修尺寸。工具列 `hint` 的「點選可…改尺寸」從此為真。
  Completion criterion: `grep -c 'id="more"' app.html` 回 1；`grep -c 'id="addWin"' app.html` 回 0；`grep -c 'id="iw"' app.html`、`grep -c 'id="id"' app.html`、`grep -c 'id="ih"' app.html`、`grep -c 'id="iname"' app.html` 各回 1；`cd worker && node --test` 全綠。

- [ ] D6: 設備可暫放到框外（2026-09-17 追加）
  設備可以拖出 1300×375 的框、放在畫布任何空白邊（`clampPos` 改成夾在 `.planwrap` 範圍而不是框內；門照舊不夾）。**暫放 = 位置在框外**，不加欄位、不改 schema：`isParked(it)` 純函式放 `worker/src/floors.js`（矩形跟 0..1300×0..375 完全不相交才算）。壓線（一半在框內）的不算暫放、照常檢查。暫放的設備：畫面上半透明＋「nF 暫放」角標（四層並排時放在面板空隙也看得出屬於哪層）；畫布空白邊要放得下最長的家具（DWG 那批最長 274 cm）：每個面板在門口側（+x 之外）至少留 300 cm 的空白，其餘邊維持 `MARGIN`；不算重疊、不畫間距、不進神明桌規則（`shrineViolations` 跳過）、不進 `buildSVG` 匯出、不進伺服器縮圖（`worker/src/index.js` 的 `thumbSvg` 跳過）；仍屬於原樓層、仍在清單裡；拖回框內就恢復。四層並排時面板之間的空隙也能放，設備仍算它原本那層（座標相對自己面板）。
  Completion criterion: `worker/tests/floors.test.js` 含測試名「isParked：完全在框外才算，壓線不算」；`worker/tests/rules.test.js` 含測試名「暫放的神明桌不算違規」；`worker/tests/routes.test.js` 含測試名「縮圖不含框外的 item」；`cd worker && node --test` 全綠；`grep -c "isParked(" app.html` ≥ 3。

## 不做

- 資料層任何改動（座標系、API、D1 schema）。
- 縮圖改直向。
- 每層不同外框、投影規則變更。
- 手機的響應式重排（四層並排在手機上就是小，自己切單層）。

## 風險

- `app.html` 對單一 `plan` 元素 25 處引用（`appendChild` 9、`querySelectorAll` 7、`style` 4…）、`place()` 5 處、`clientX` 換算 4 處——漏一處＝某層的東西畫錯面板或拖偏 → D2 用 grep 當完成標準。
- 門／窗有自己的 `rot` 與 `flip`，直向時顯示角度要加 90 但**存檔的 rot 不變**；買錯就是存檔後門轉了 → D1 測「rot=0 直向顯示 90」、D4 readback 比存檔前後。
- 父母正在用正式站：D4 只在他們不在用的時段 deploy。
- 跟 DWG 匯入（`scripts/dwg_import.py`，另案）獨立；先做哪個都行。
