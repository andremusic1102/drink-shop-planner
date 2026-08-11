#!/usr/bin/env python3
"""把 Mac mini 上 state/ 裡的平面圖與版本歷史轉成 D1 可以吃的 SQL。

    python3 export-seed.py > seed.sql

之後：
    npx wrangler d1 execute drink-shop-planner --local  --file=seed.sql   # 本機測
    npx wrangler d1 execute drink-shop-planner --remote --file=seed.sql   # 正式

刻意輸出 SQL 檔而不是直接寫資料庫：搬家只做一次，留一份可以審閱、可以重跑的
檔案，比一支跑完就沒有痕跡的腳本安全。
"""

import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(os.path.dirname(BASE), "state")
PLANS = os.path.join(STATE, "plans")
BACKUPS = os.path.join(STATE, "backups")


def q(s):
    """SQL 字串常值：單引號加倍。"""
    return "'" + str(s).replace("'", "''") + "'"


def main():
    if not os.path.isdir(PLANS):
        print(f"-- 找不到 {PLANS}", file=sys.stderr)
        return 1

    out = ["-- drink-shop-planner 資料搬遷（由 export-seed.py 產生）",
           "-- 可重複執行：用 INSERT OR REPLACE"]
    n_plans = n_revs = 0

    for fn in sorted(os.listdir(PLANS)):
        if not fn.endswith(".json"):
            continue
        with open(os.path.join(PLANS, fn), encoding="utf-8") as f:
            d = json.load(f)
        pid = d["id"]
        plan_text = json.dumps(d.get("plan") or {"items": [], "measures": []},
                               ensure_ascii=False, separators=(",", ":"))
        out.append(
            "INSERT OR REPLACE INTO plans (id, name, rev, ts, plan, deleted_at) VALUES "
            f"({q(pid)}, {q(d.get('name', '未命名'))}, {int(d.get('rev', 1))}, "
            f"{int(d.get('ts', 0))}, {q(plan_text)}, NULL);"
        )
        n_plans += 1

        bd = os.path.join(BACKUPS, pid)
        if not os.path.isdir(bd):
            continue
        for bf in sorted(os.listdir(bd)):
            if not bf.endswith(".json"):
                continue
            with open(os.path.join(bd, bf), encoding="utf-8") as f:
                r = json.load(f)
            rtext = json.dumps(r.get("plan") or {}, ensure_ascii=False, separators=(",", ":"))
            out.append(
                "INSERT OR REPLACE INTO revisions (plan_id, rev, ts, plan) VALUES "
                f"({q(pid)}, {int(r['rev'])}, {int(r.get('ts', 0))}, {q(rtext)});"
            )
            n_revs += 1

    print("\n".join(out))
    print(f"-- 共 {n_plans} 份平面圖、{n_revs} 筆版本", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
