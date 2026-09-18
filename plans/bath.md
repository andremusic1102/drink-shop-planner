# 匯入 2–4F 結構與家具 + 結構元件複製／搬層 — 計畫

2026-09-17 定案。術語見 `CONTEXT.md`（建築結構／結構元件／設備／樓層／暫放／四邊地標）。
前提：plans/view.md（直向檢視＋四層並排＋暫放）已上線、seal 6/6（docs/seal-view.md）。

起因：2–4F 要各多加一間廁所（管道對齊、跟現有那間同位置），而 2–4F 的結構與大家具還沒進編輯器；
結構模式現在只能「＋ 廁所」再手拖、不能複製。

## 定案（AskUserQuestion 結果）

| 題 | 決定 |
|---|---|
| 移動廁所 | **已經有**：結構模式下可拖、面板可打 X／Y／長／寬。這份計畫加的是「搬到別層」 |
| 複製廁所 | **同層偏移＋跨層同位置都要**：結構元件面板一個「複製到 1F–4F」下拉，選自己這層→偏移 30 cm 並夾在框內、選別層→同位置；另加「搬到 1F–4F」 |
| 匯入時 1F 結構 | **保留實測**（三根梁、廁所、玄關、樓梯不動）；只補 2–4F 的梁／樓梯／廁所（DWG 值，長邊等比拉到 1300）。腳本加 `--keep-1f` |
| 匯入的方案 | 新方案「原始平面圖（8.dwg）」：1F 複製「洗手台工作台未定」、2–4F 家具 22＋隔間牆 20＋門 8；家具進去後用 view.md 的長寬高輸入框修尺寸、暫放挪位 |
| 複製的名稱／id | 新 id（`elId(kind)`）、名稱照抄；種類與尺寸照抄 |
| 複製後的目前樓層 | 跨層複製後**切到目標樓層**並選取新元件（四層並排時那個面板亮起） |

## Prerequisites (human)

- Cloudflare 個人帳號已登入、能部署：`cd worker && CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09 npx wrangler whoami`
- 正式站 `/api/structure` 目前是 rev 15、6 個元件（只有 1F）：`curl -s -A x https://drinkshop.andremusic.dev/api/structure | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['rev'],len(d['elements']))"`

## Deliverable

- [ ] D1: 匯入腳本 `--keep-1f`
  `scripts/dwg_import.py`：加 `--keep-1f`（預設開）：結構的 1F 元件從伺服器現有的 `elements` 原樣保留（包含 id），只把 2–4F 的梁／樓梯／廁所（DWG）接上去；`--replace-1f` 才全部換。`build_structure(existing, keep_1f)` 純函式化。
  Completion criterion: `python3 -m pytest tests/test_dwg_import.py -q` 全綠，且 `tests/test_dwg_import.py` 含測試名 `test_build_structure_keep_1f_preserves_existing_1f_elements`（1F 六筆 id／座標原樣、2–4F 共 14 筆、無重複 id）與 `test_build_structure_replace_1f`（20 筆、1F 三根梁是 DWG 值）；`grep -c "keep-1f" scripts/dwg_import.py` ≥ 1。

- [ ] D2: 結構元件複製／搬層純函式
  `worker/src/floors.js`：`cloneElement(el, toFloor, newId)` → 新物件：`id=newId`、`floor=toFloor`、同層時 `x+30,y+30` 且夾在 0..1300×0..375 內、跨層時 x/y 原樣；`moveElement(el, toFloor)` → 只改 floor。
  Completion criterion: `cd worker && node --test tests/floors.test.js` 全綠，且含測試名「跨層複製：新 id、floor 改、x/y 不變」「同層複製：偏移 30、夾在框內」「搬層：只改 floor、id 不變」。

- [ ] D3: 前端：結構元件面板的「複製到」「搬到」
  `app.html` 的 `updateSelEl`：加 `<select id="ecopy">`（複製到 1F–4F）與 `<select id="emove">`（搬到 1F–4F），選了就做：複製→`cloneElement` 加進 `elements`、`saveStructure()`、`setFloor(目標層)`、`selEl=新 id`；搬→`moveElement`、同上。四層並排時目標面板立刻畫出新元件（render 走 `elementsOn(elements,f)`，不用另外處理）。
  Completion criterion: `grep -c 'id="ecopy"' app.html` 回 1；`grep -c 'id="emove"' app.html` 回 1；`grep -c "cloneElement(" app.html` ≥ 1；`grep -c "moveElement(" app.html` ≥ 1；`cd worker && node --test` 全綠。

- [ ] D4: 匯入正式站＋上線＋readback
  先 `npm run deploy`（D2／D3），再 `python3 scripts/dwg_import.py --apply`（先 POST 新方案、成功才 PUT 結構 baseRev 15）。deploy 後在 drinkshop-new：開新方案、四層並排、2F 廁所「複製到 3F」、存、重載、3F 有兩間廁所且位置相同、1F 六個元件原樣。
  Completion criterion: `docs/d8-readback.md` 記錄 `curl -s https://drinkshop-new.andremusic.dev/api/structure` 匯入後原文（rev 16、20 個元件、1F 六筆 id 與 rev 15 相同）、複製後 rev 17 且 3F 有兩筆 `kind:"bath"`、新方案 id 與 `GET /api/plans/<id>` 的 items 數（86）、`git rev-parse HEAD`。

## 不做

- 設備（家具）的跨層複製／搬層（`dup` 仍是同層）。
- 廁所以外的規則（神明桌三條不變）。
- 縮圖改動。
- DWG 尺寸校正（1219→1300 等比拉伸照舊；1F 已實測不動）。

## 風險

- 結構是全部方案共用、一份 rev：匯入 PUT 用 baseRev 15，父母那一刻若剛存過結構就 409 → 重新 GET 再 PUT（腳本已印提示）。可 `POST /api/structure/restore` 回 rev 15。
- `--keep-1f` 保留的是**伺服器當下**的 1F 元件（不是 DEFAULT_STRUCTURE），腳本要先 GET 再組——D1 測試用假的 existing 驗。
- 跨層複製後切樓層會 `render()`，正在拖的元素會被換掉 → 複製走面板按鈕不走拖曳，沒這個問題。
- 父母正在用正式站：D4 挑他們不在用的時段；匯入的新方案是新增、不動他們正在改的那份。
