# D4 readback：複製整層＋多選（plans/multi.md）

2026-09-18 00:26 CDT。deploy 當下 `git rev-parse HEAD` = `029feab4621209022c7ad411e2ff4f303382f766`（D3 那筆）。
Wrangler Version ID `7bc82e84-01ab-41cf-b5ef-bfc8f9ac4651`；`curl https://drinkshop-new.andremusic.dev/` 含 `id="copyFloor"` 與 `id="multiToggle"`。

## drinkshop-new 對「原始平面圖（8.dwg）」`56535dee6d7a0102` 的驗證（Playwright）

⚠️ 動手時發現這份方案已被父母改到 rev 173、結構 rev 67（2F 已有 2 間廁所、8 道隔層、20 件設備）——不是匯入時的 rev 2／20。
驗證步驟照契約做完後，**用版本紀錄還原到動手前**（見最後一段）。

| 步驟 | 方案 rev | 4F items | 結構 rev | 4F 各 kind |
|---|---|---|---|---|
| 動手前 | 173 | 7 | 67 | beam 3、stairs 1、bath 0、partition 7、entry 0 |
| 多選 2F 雙人床＋衣櫃「複製到 4F」 | 174 | 9（新 id 100、101，位置同 2F：衣櫃 x769.3 y329、雙人床 x28.3 y180） | 67 | 不變 |
| 重載後 | — | 4F 面板看得到 id 100、101（`seenAfterReload: [true,true]`） | — | — |
| 2F「複製整層到 4F」（confirm 文字：「會先清掉 4F 的 9 件設備、7 個廁所／房間隔層，再把 2F 的 20 件設備、10 個廁所／房間隔層複製過去…」） | 175 | 20 | 68 | beam 3、stairs 1、**bath 2、partition 8**、entry 0（跟 2F 一樣；梁樓梯不動）；總數 53 |
| 重載後 4F 面板 | — | 20 件 `.it` | — | `.fx`：beam×3、stairs、bath×2、partition×8 |

console 0 錯誤。

## 還原（父母正在改這份，驗證不該留下）

`POST /api/plans/56535dee6d7a0102/restore {rev:173}` → rev 176；`POST /api/structure/restore {rev:67}` → rev 69。
還原後：方案 4F 7 件、2F 20 件；結構總數 50、4F beam 3／stairs 1／bath 0／partition 7／entry 0——跟動手前一致。
還原前有先確認 rev 仍是 175／68（沒有人在這一分鐘內同時改），不然不自動還原。

## 本機演練（deploy 前，同一套流程）

本機 D1 副本：跨層多選（2F 一件＋3F 一件）按「複製」→ 各留原層各偏移 30；2F 複製整層到 4F → 4F 從 8 件／partition 7 變 13 件／bath 1＋partition 6（跟 2F 相同）、梁樓梯不動、切到 4F。

## 沒驗的

- 手機寬度的多選開關操作。
- 群組拖曳被夾到畫布邊時脫開的程度（接受，見計畫風險）。
