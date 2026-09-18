# seal 結果：plans/structure.md（房間隔層、樓梯鎖定、跨層複製／搬層、投影縮減、匯入 2–4F）

`python3 ~/github/claude-config/scripts/contract.py seal plans/structure.md`
2026-09-17 23:03 CDT，第 2 次 seal。凍結點：第 1 次重新凍結 `8777ae7cae01`（第一次 `2b80715d6eba`）；驗收範圍從第一次凍結起算。

```
=== seal plans/structure.md @ 8777ae7c ===
🔴 這份大契約被**重新凍結過 1 次**
✅ D1: 伺服器認得 partition
✅ D2: 純函式：投影縮減、鎖樓梯、複製／搬層
✅ D3: 前端
✅ D4: 牆搬進結構的遷移腳本
✅ D5: 匯入腳本 --keep-1f、牆進結構
✅ D6: 上線＋遷移＋匯入＋readback
6/6 達成
```

## 第一輪 seal（@2b80715d）4/6 的發現與處置

| 發現 | 處置 |
|---|---|
| D4 契約寫 id `partition-<hash>`，實作是由值組成 | codex 在 U24 明確要求不用 hash（截短 hash 會碰撞＝靜默掉牆）；契約文字對齊 → reconfirm |
| D6 契約寫遷移後 1F「5 筆 partition」，實際 6 筆 | codex 在 U24 要求去重不做容差；差 2.4 cm 的那對是兩道；契約文字對齊 → reconfirm |

單元：U21–U26 全 passed（U24 五輪：量化去重→精確→float 原值→409 重做→hash 碰撞）。上線 Version `d923d04a`。
