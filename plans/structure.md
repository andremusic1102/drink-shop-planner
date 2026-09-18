# 結構第二輪：房間隔層、樓梯鎖定、跨層複製／搬層、投影縮減、匯入 2–4F — 計畫

2026-09-17 定案（取代同日的 plans/bath.md）。術語見 `CONTEXT.md`。
前提：plans/view.md 已上線、seal 6/6（docs/seal-view.md）；U20 的 isParked 門窗修正已上線（Version 4ca503b0）。

起因：2–4F 要各多加一間廁所（管道對齊）、家具要能搬到別層、隔間牆是房子的一部分不該一份方案一套、
樓梯不會動了不需要再加、投影疊太多東西看不清。

## 定案（AskUserQuestion 結果）

| 題 | 決定 |
|---|---|
| 房間隔層 | 新的結構元件種類 `partition`（中文「房間隔層」），全部方案共用；結構模式有「＋ 房間隔層」（長度輸入、厚 10）；設備區的「＋ 隔間牆」拿掉 |
| 舊方案裡的隔間牆設備 | **全部搬進結構**：三份正式站方案的 `wall:true` 設備 → 結構 `partition`（同座標同尺寸只留一筆），再從各方案移除。已知後果：「洗手台工作台未定」與「牆在正中間」的中段牆位置不同（x=704 與 x=640），搬完 1F 會同時有兩道中段牆，Andre 自己刪一道 |
| 樓梯 | **鎖拖曳與新增**：拿掉「＋ 樓梯」，結構模式下樓梯不可拖；面板仍可打 X／Y／尺寸、仍可刪 |
| 家具跨層 | 設備面板加「複製到 1F–4F」「搬到 1F–4F」：跨層同位置、同層複製偏移 30 並夾在框內；門窗牆也適用 |
| 廁所複製／搬層 | 結構元件面板同一套「複製到」「搬到」（樓梯也能複製到別層——鎖的是拖曳不是複製） |
| 投影 | 只畫 **梁、樓梯**（其他樓層的結構元件裡只取這兩種）＋較低樓層的**神明桌**；廁所、玄關、房間隔層不投影。神明桌的「正上一層廁所」規則不變（規則不靠投影） |
| 匯入時 1F 結構 | **保留實測**（`--keep-1f` 預設）；只補 2–4F 的梁／樓梯／廁所；DWG 的 2–4F 隔間牆改進結構當 `partition`，不再進方案 |
| 匯入的方案 | 新方案「原始平面圖（8.dwg）」：1F 複製「洗手台工作台未定」的設備（牆除外，牆已在結構）、2–4F 家具 22＋門 8 |
| 複製的 id／名稱 | 新 id、名稱／種類／尺寸照抄；跨層複製後切到目標樓層並選取新的那件 |

## Prerequisites (human)

- Cloudflare 個人帳號已登入、能部署：`cd worker && CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09 npx wrangler whoami`
- 正式站結構仍是 1F 六個元件：`curl -s -A x https://drinkshop.andremusic.dev/api/structure | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['rev'],len(d['elements']))"`

## Deliverable

- [ ] D1: 伺服器認得 `partition`
  `worker/src/index.js`：`ELEMENT_KINDS` 加 `"partition"`；`thumbSvg` 把 `partition` 畫成深色實心（跟前端牆同色 `#2f3a3a`）。`worker/src/floors.js` 的 `KIND_LABEL` 加 `partition:"房間隔層"`。
  Completion criterion: `worker/tests/routes.test.js` 含測試名「PUT /api/structure kind partition → 200」「縮圖畫出 partition」；`cd worker && node --test tests/routes.test.js` 全綠；`grep -c '"partition"' worker/src/index.js` ≥ 1。

- [ ] D2: 純函式：投影縮減、鎖樓梯、複製／搬層
  `worker/src/floors.js`：`projection()` 的結構元件只收 `kind` 為 `beam`／`stairs`；`draggableSet('structure',…)` 排除 `kind:"stairs"`；新增 `cloneTo(obj, toFloor, newId)`（結構元件與設備通用：`id=newId`、`floor=toFloor`、同層 `x+30,y+30` 夾在 0..1300×0..375、跨層 x/y 原樣）與 `moveTo(obj, toFloor)`（只改 floor）。
  Completion criterion: `cd worker && node --test tests/floors.test.js` 全綠，且含測試名「投影只含梁與樓梯，不含廁所玄關隔層」「結構模式：樓梯不在可拖集合」「跨層複製：新 id、floor 改、x/y 不變」「同層複製：偏移 30、夾在框內」「搬層：只改 floor、id 不變」。

- [ ] D3: 前端
  `app.html`：拿掉 `id="addStairs"` 與 `id="addWall"`；加 `id="addPartition"`（結構模式，長度 prompt、厚 10）；結構元件面板與設備面板各加 `<select id="ecopy">`／`<select id="emove">` 與 `<select id="icopy">`／`<select id="imove">`（1F–4F），選了就 `cloneTo`／`moveTo`、存、`setFloor(目標層)`、選取新的；樓梯的面板標「樓梯固定，不可拖」；`.fx.partition` 樣式深色實心；`KIND_LABEL` 用到的地方自動帶「房間隔層」。
  Completion criterion: `grep -c 'id="addStairs"' app.html` 回 0；`grep -c 'id="addWall"' app.html` 回 0；`grep -c 'id="addPartition"' app.html` 回 1；`grep -c 'id="ecopy"' app.html`、`'id="emove"'`、`'id="icopy"'`、`'id="imove"'` 各回 1；`grep -c "cloneTo(" app.html` ≥ 2；`cd worker && node --test` 全綠。

- [ ] D4: 牆搬進結構的遷移腳本
  `scripts/walls_to_structure.py`：GET 全部方案，收集 `wall:true` 設備 → `partition` 元件（floor 照設備、name「房間隔層」、id `partition-<hash>`），同 (floor,x,y,w,d) 只留一筆；PUT 結構（baseRev 現值）成功後才逐份 PUT 方案移除 wall 設備（baseRev 各自現值，409 就重 GET 重做）。預設 dry-run 印差異；`--apply` 才寫。純函式 `collect_partitions(plans)`／`strip_walls(plan)`。
  Completion criterion: `tests/test_walls_to_structure.py` 含測試名 `test_collect_dedupes_identical_walls_across_plans`（兩份方案三道相同一道不同 → 5 筆 partition）與 `test_strip_walls_keeps_everything_else`；`python3 -m pytest tests/test_walls_to_structure.py -q` 全綠。

- [ ] D5: 匯入腳本 `--keep-1f`、牆進結構
  `scripts/dwg_import.py`：`build_structure(existing, keep_1f=True)`：1F 元件從伺服器現有 `elements` 原樣保留（含 id），只接上 2–4F 的梁／樓梯／廁所＋ `WALLS` 轉成 `partition`；`--replace-1f` 才全換。`build_items` 不再產生牆；1F 複製來源的 `wall:true` 設備不複製（牆已在結構）。
  Completion criterion: `python3 -m pytest tests/test_dwg_import.py -q` 全綠，且含測試名 `test_build_structure_keep_1f_preserves_existing_1f_elements`（1F 六筆 id／座標原樣、2–4F 梁 9＋樓梯 3＋廁所 2＋partition 20）與 `test_build_items_has_no_walls`；`grep -c "keep-1f" scripts/dwg_import.py` ≥ 1。

- [ ] D6: 上線＋遷移＋匯入＋readback
  順序：`npm run deploy`（D1–D3）→ 本機 miniflare 用正式站三份方案副本跑 `walls_to_structure.py --apply` 驗（1F 5 道 partition、方案裡 wall 為 0）→ 正式站跑 `walls_to_structure.py --apply` → `dwg_import.py --apply`（keep-1f）→ drinkshop-new：開新方案、四層並排、2F 廁所「複製到 3F」、1F 一件家具「搬到 2F」、存、重載。
  Completion criterion: `docs/d8-readback.md` 記錄 `curl -s https://drinkshop-new.andremusic.dev/api/structure` 原文：遷移後（1F 六筆原 id 不變＋5 筆 partition）、匯入後（再加 2–4F 梁 9、樓梯 3、廁所 2、partition 20）、複製後（3F 兩筆 bath）；三份舊方案 `wall:true` 計數皆 0；新方案 id 與 items 數（1F 32＋2–4F 30＝62）；`git rev-parse HEAD`。

## 不做

- 樓梯的形狀／方向、梯間淨高。
- 房間隔層的門洞（門仍是設備）。
- 舊方案版本紀錄的清理（遷移前的版本都在 revisions 表，可回復）。
- DWG 尺寸校正（1F 實測為準、2–4F 等比拉伸）。

## 風險

- **遷移不可逆（實務上）**：方案與結構都有版本紀錄可 restore，但要同時回復四份才一致 → D6 先在本機副本跑一遍，正式站跑之前把三份方案的 rev 與結構 rev 記進 readback。
- 父母正在改「洗手台工作台未定」（rev 335→348 在一小時內）：遷移的 PUT 用 baseRev，撞到就 409 重做；挑他們不在用的時段跑。
- 中段牆 704 vs 640 會並存，Andre 要自己刪一道——readback 記下兩筆 id。
- `partition` 是新 kind：舊前端（沒重載的分頁）收到含 partition 的結構會照 `elLabel` 畫成 `kind` 字串、不會壞；舊前端存結構時會把 partition 原樣 PUT 回去（normalizeElements 只驗 kind 在集合內）。D1 先上線再遷移就不會 400。
