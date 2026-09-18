# D6 readback：房間隔層進結構、樓梯鎖定、跨層複製／搬層、投影縮減、匯入 2–4F（plans/structure.md）

2026-09-17 22:58 CDT。`git rev-parse HEAD` = `5c60ea619366eb3dc7041a19eb559135388f7cd6`（D5 那筆）。
deploy（D1–D3）：Wrangler Version ID `d923d04a-8d12-4eff-8778-0abd3f99b044`；`curl https://drinkshop-new.andremusic.dev/` 含 `id="addPartition"`。

## deploy 前：本機 miniflare 演練

正式站三份方案（rev 348／17／179）與結構（rev 18、6 個）複製到本機 D1，跑
`scripts/walls_to_structure.py --apply --base http://localhost:8799` → 結構 12 個（1F 六筆原樣＋6 道 partition）、
「洗手台工作台未定」「牆在正中間」各移掉 4 道牆、「目前擺法」不動；再跑 `scripts/dwg_import.py --apply --base … --source <本機副本>`
→ 結構 46 個、新方案 62 件（1F 32＋2–4F 30）。Playwright 開新方案四層並排：各層結構元件 12/11/12/11、設備 31/12/12/6、
房間隔層 26、console 0 錯誤（截圖看過：床／書桌／浴缸／馬桶／洗手台／門在位、隔間牆深色）。

## 正式站：`curl -s https://drinkshop-new.andremusic.dev/api/structure` 原文摘錄（id kind 樓層 x y w×d）

遷移前 rev 18（6）：
  entry-1 entry 1F x1125 y0 175×100
  stairs-1 stairs 1F x858 y0 267×100
  bath-1 bath 1F x137 y106 140×269
  beam-1 beam 1F x1062 y0 57×375
  beam-2 beam 1F x648 y0 44×375
  beam-3 beam 1F x174 y0 61×375

遷移後 rev 19（12）——1F 六筆原樣：
  entry-1 entry 1F x1125 y0 175×100
  stairs-1 stairs 1F x858 y0 267×100
  bath-1 bath 1F x137 y106 140×269
  beam-1 beam 1F x1062 y0 57×375
  beam-2 beam 1F x648 y0 44×375
  beam-3 beam 1F x174 y0 61×375
  partition-1-135.603125-100-10x275 partition 1F x135.603125 y100 10×275
  partition-1-145.603125-100-140x10 partition 1F x145.603125 y100 140×10
  partition-1-275.603125-100-10x275 partition 1F x275.603125 y100 10×275
  partition-1-278.03782790492966-100-10x275 partition 1F x278.03782790492966 y100 10×275
  partition-1-639.7865625000001-100-10x275 partition 1F x639.7865625000001 y100 10×275
  partition-1-703.9292636044347-100-10x275 partition 1F x703.9292636044347 y100 10×275

匯入後 rev 20（46）各層各種類：
  1F bath 1, 1F beam 3, 1F entry 1, 1F partition 6, 1F stairs 1, 2F bath 1, 2F beam 3, 2F partition 6, 2F stairs 1, 3F bath 1, 3F beam 3, 3F partition 7, 3F stairs 1, 4F beam 3, 4F partition 7, 4F stairs 1
  1F 六筆 id 與 rev 18 相同：True

複製後 rev 21（47）3F 的 bath：
  bath-3 bath 3F x338 y91 130×284
  bath-mu6ffz8yzdk bath 3F x338 y91 130×284

方案：
  413c34c07d6f4988 「洗手台工作台未定」rev 349 items 32 wall:true 0
  0a53a59670a84df0 「目前擺法」rev 17 items 22 wall:true 0
  65576960635fea51 「牆在正中間」rev 180 items 32 wall:true 0
  56535dee6d7a0102 「原始平面圖（8.dwg）」rev 2 items 62 wall:true 0

## 正式站的動作與驗證

- `python3 scripts/walls_to_structure.py --apply`：PUT /api/structure → rev 19（12 個）；PUT 413c34c07d6f4988 → rev 349 移掉 4 道；PUT 65576960635fea51 → rev 180 移掉 4 道；沒有 409。
- `python3 scripts/dwg_import.py --apply`（預設 --keep-1f）：POST 新方案 `56535dee6d7a0102` rev 1；PUT /api/structure → rev 20（46 個）。
- Playwright 對 drinkshop-new：開新方案（4 面板、同步燈 ✓）→ 結構模式選 2F 廁所「複製到 3F」→ rev 21、3F 兩筆 bath 同位置（見上）→
  設備「二樓餐桌」（id 43，原本在 1F）「搬到 2F」→ 重載後在 2F 面板、不在 1F；新方案 rev 2、62 件、wall 0；console 0 錯誤。

## 跟契約預估不同的地方

- 契約寫「1F 5 筆 partition」，實際 **6 筆**：兩份方案的第二道牆差 2.4 cm（x=275.6 與 278.04），去重照契約只認完全相同的座標（codex 在 U24 明確要求不做容差），
  所以是兩道。連同中段牆（639.8 與 703.9）共兩對要 Andre 自己各刪一道：
  `partition-1-275.603125-100-10x275` / `partition-1-278.03782790492966-100-10x275`、`partition-1-639.7865625000001-100-10x275` / `partition-1-703.9292636044347-100-10x275`。
- 複製出來的 3F 第二間廁所 `bath-mu6ffz8yzdk` 留在正式站（跟 bath-3 同位置），是給 Andre 拖到要的位置用的；不要的話在結構模式刪掉。
- 「二樓餐桌」搬到 2F 是對新方案「原始平面圖（8.dwg）」做的（rev 2），三份舊方案沒動這件。

## 沒驗的

- 遷移期間父母若同時存檔的 409 路徑（單元測試有、正式站沒撞到）。
- 手機寬度。
