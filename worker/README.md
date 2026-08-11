# Cloudflare Workers 版後端

從 `../server.py` 移植。**API 契約完全一致，`app.html` 一行都不用改。**

搬上雲的目的只有一個：Mac mini 關機或當機時，師傅和家人還是打得開平面圖。

## 樂觀鎖怎麼換掉 `threading.Lock`

`server.py` 用一把全域鎖把「讀 rev → 比對 baseRev → 寫入」框成臨界區。Workers 沒有跨請求的鎖，也不該有——同一個 Worker 可能同時在多個節點執行。

改用 D1 的條件式 UPDATE：

```sql
UPDATE plans SET rev = rev + 1, ts = ?, plan = ?
  WHERE id = ? AND rev = ? AND deleted_at IS NULL
```

SQLite 保證單一 statement 原子性，`WHERE` 子句本身就是 compare-and-swap。`meta.changes === 0` 就是衝突，回 409 帶目前版本讓前端重載。

**這比原本的鎖更正確**：`threading.Lock` 只在單一行程內有效，原版如果哪天用多個 worker 跑就會失效；條件式 UPDATE 沒有這個問題。

實測 10 個並發 PUT 帶相同 `baseRev`：**1 個 200、9 個 409、rev 精準 +1**，沒有遺失更新。

## 與 Python 版的差異

| | server.py | Worker |
|---|---|---|
| 平面圖 | `state/plans/{id}.json` | D1 `plans` 表 |
| 版本歷史 | `state/backups/{id}/{rev}.json`，留 50 份 | D1 `revisions` 表，同樣留 50 份 |
| 刪除 | 搬去 `state/trash/` | `deleted_at` 軟刪除 |
| 併發控制 | `threading.Lock` | 條件式 UPDATE |
| 原子寫入 | `tempfile` + `os.replace` | D1 交易 |

縮圖 SVG 是逐位元組移植的——同一份資料，兩邊輸出 `cmp` 完全相同。

## 本機開發

```bash
npx wrangler d1 execute drink-shop-planner --local --file=schema.sql
python3 export-seed.py > seed.sql
npx wrangler d1 execute drink-shop-planner --local --file=seed.sql
npx wrangler dev --local --port 8799
```

不需要登入 Cloudflare，`--local` 用內建的 miniflare 與本機 SQLite。

## 部署

需要有 Workers / D1 權限的憑證（`purchase-tracker/config.json` 裡那把 token 只有 Tunnel / DNS / Access 權限，不夠）。

```bash
npx wrangler login                                  # 或設 CLOUDFLARE_API_TOKEN

npx wrangler d1 create drink-shop-planner           # 把回傳的 database_id 填進 wrangler.toml
npx wrangler d1 execute drink-shop-planner --remote --file=schema.sql
npx wrangler d1 execute drink-shop-planner --remote --file=seed.sql
npx wrangler deploy
```

部署後先用 `*.workers.dev` 網址驗過，**再**把 `drinkshop.andremusic.dev` 從 tunnel ingress 移到 Worker。切換前不要動 Mac mini 上那份，隨時可以退回去。

## 切過去之後

`com.andre.drinkshop` 與 `com.andre.drinkshop-digest` 這兩個 launchd 服務就可以停掉了。digest 改用 Cron Trigger（尚未實作）。

`state/` 底下的檔案要留著——那是搬遷前的最後快照。
