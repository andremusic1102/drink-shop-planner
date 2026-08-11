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

改動先部署到 `drinkshop-new.andremusic.dev` 驗過，再影響正式的 `drinkshop.andremusic.dev`。兩個 hostname 指向同一個 Worker。

## 切過去之後

**2026-08-11 已完成切換。** `com.andre.drinkshop` 與 `com.andre.drinkshop-digest` 兩個 launchd 服務已移除，digest 改用 Cron Trigger（見下）。

`state/` 底下的檔案留著當搬遷前的最後快照。

## 每日摘要（Cron Trigger）

移植自 `../notify_digest.py`。**只有當天真的有方案被更新才寄信**，沒有就完全不出聲。

寄件走 Cloudflare Email Routing 的 `send_email` binding（免費，不用第三方寄信服務）。

### 時區

Cron 只吃 UTC，而 21:00 America/Chicago 夏令是 02:00 UTC、冬令是 03:00 UTC。所以**兩個時間都排**，程式裡再判斷當地是不是 21 點，不是就直接離開。這樣日光節約時間換來換去都不用改設定。`meta.digest_last_sent` 保證一天只寄一封。

### 兩個踩過的坑

**Cron Triggers 要求帳號先註冊 workers.dev 子網域**，否則 API 回 `code=10063`。已註冊 `andremusic.workers.dev`，但 `workers_dev = false` 仍然有效——實測那個網址回 HTTP 000，服務只走自己的網域。

**手刻 MIME 一定要有 `Message-ID`**，少了 Cloudflare 直接擋 `invalid message-id`。主旨含中文要用 RFC 2047 的 `=?UTF-8?B?…?=` 編碼。

### 本機測試

```bash
npx wrangler dev --local --test-scheduled --var DIGEST_HOUR:$(TZ=America/Chicago date +%-H)
curl http://127.0.0.1:8799/__scheduled
```

`DIGEST_HOUR` 覆寫掉 21 點的限制，才走得到寄信那條路徑。信會落在 `.wrangler/tmp/email/` 底下的 `.eml` 檔，可以直接檢查編碼。
