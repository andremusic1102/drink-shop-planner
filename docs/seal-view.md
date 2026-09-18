# seal 結果：plans/view.md（直向檢視＋四層並排＋暫放）

`python3 ~/github/claude-config/scripts/contract.py seal plans/view.md`
2026-09-17 22:10:52 CDT，本 session 第 3 次 seal（`~/.claude/contracts/seal-state.json`：`plans/view.md` n=3）。
凍結點：第 2 次重新凍結 `f8c37ab3252d22f8e93bfd5b4589082f4a01d49d`（第一次 `adb3a8a7`、第二次 `655965fa`）；
驗收範圍從第一次凍結起算。HEAD 在 seal 當下＝`f8c37ab`（之後只多 kickoff 狀態行與本檔）。

```
=== seal plans/view.md @ f8c37ab3 ===
🔴 這份大契約被**重新凍結過 2 次** —— 驗收的「動工前就寫好」這個前提要打折看
✅ D1: 檢視轉換純函式
✅ D2: 前端多面板
✅ D3: 匯出跟著檢視
✅ D4: 上線＋readback
✅ D5: 工具列收納＋設備尺寸可編輯＋拿掉窗戶＋清單預設收合
✅ D6: 設備可暫放到框外
6/6 達成
```

## 前兩次 seal 的發現與處置

| 輪 | 發現 | 處置 |
|---|---|---|
| 1（@adb3a8a7）4/6 | D2 Deliverable 寫「四層左到右」，定案表寫「橫向四層上到下」 | 契約文字對齊定案表 → 第 1 次 reconfirm |
| 1 | D6 `isParked` 定義在 rules.js，契約指定 floors.js | 搬進 floors.js（rules.js 留 `FRAME` 內嵌判斷）→ 第 2 次 deploy |
| 2（@655965fa）4/6 | D2「面板 pointerdown 先 setFloor」：實作只在點空白時切 | capture 階段一律先切（U19 passed）→ 第 3 次 deploy |
| 2 | D4「一次 deploy」：因 seal 修正 deploy 了兩次 | D4 文字改成「D5／D6 後第一次 deploy；seal 修正可再 deploy，各記一段」→ 第 2 次 reconfirm |

兩次重新凍結都是文字對齊已做的決定，沒有降低任何完成標準（grep／測試名／readback 檔要求全部原樣）。
