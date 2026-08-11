-- drink-shop-planner 的 D1 schema。
--
-- 對應原本 server.py 的檔案結構：
--   state/plans/{id}.json      → plans
--   state/backups/{id}/{rev}.json → revisions
--   state/trash/{id}-{ts}.json → plans.deleted_at（軟刪除，不是真的搬走）

CREATE TABLE IF NOT EXISTS plans (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '未命名',
  rev        INTEGER NOT NULL DEFAULT 1,
  ts         INTEGER NOT NULL,          -- 秒級 epoch，與 server.py 一致
  plan       TEXT NOT NULL,             -- JSON 字串 {items:[], measures:[]}
  deleted_at INTEGER                    -- NULL = 還在；有值 = 在垃圾桶
);

-- 列表只看沒刪的，依更新時間排序
CREATE INDEX IF NOT EXISTS plans_live ON plans (deleted_at, ts DESC);

CREATE TABLE IF NOT EXISTS revisions (
  plan_id TEXT NOT NULL,
  rev     INTEGER NOT NULL,
  ts      INTEGER NOT NULL,
  plan    TEXT NOT NULL,
  PRIMARY KEY (plan_id, rev)
);

-- 修剪舊版本時要按 plan_id 找最舊的幾筆
CREATE INDEX IF NOT EXISTS revisions_by_plan ON revisions (plan_id, rev DESC);

-- 雜項狀態。目前只放 digest_last_sent（值是 America/Chicago 的 YYYY-MM-DD），
-- 對應原本 server.py 那邊的 state/last_digest.json。
-- Cron 一天會醒兩次（夏令/冬令各一），靠這個確保一天只寄一封。
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
