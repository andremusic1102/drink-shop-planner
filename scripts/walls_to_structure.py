#!/usr/bin/env python3
"""把各方案裡的「隔間牆」設備（wall:true）搬進建築結構當「房間隔層」（kind partition）。

2026-09-17 定案（plans/structure.md）：隔間牆是房子的一部分，全部方案共用一份，不該一份方案一套。

做法：
  1. GET /api/plans 與每份 GET /api/plans/<id>，收集 wall:true 的設備
  2. 轉成 partition 元件：floor 照設備（缺＝1F）、name「房間隔層」、id partition-<hash>；
     同 (floor, x, y, w, d) 只留一筆（三份方案裡相同的牆合成一筆；位置不同的兩道牆會並存，人自己刪）
  3. PUT /api/structure（現有 elements ＋ 新 partition，baseRev 現值）
  4. 成功後才逐份 PUT /api/plans/<id> 把 wall 設備移掉（baseRev 各自現值；409 就重 GET 重做一次）

預設 dry-run 只印差異；--apply 才寫。結構與方案都有版本紀錄可 restore。

用法：
  python3 scripts/walls_to_structure.py                 # dry-run
  python3 scripts/walls_to_structure.py --apply
  python3 scripts/walls_to_structure.py --apply --base http://localhost:8799
"""
import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request

BASE = "https://drinkshop.andremusic.dev"


def _num(v):
    v = float(v or 0)
    return int(v) if v == int(v) else round(v, 2)


def partition_id(floor, x, y, w, d):
    """穩定的 id：同一組 (floor, x, y, w, d)（cm，取到 0.01）跑兩次得到同一個 id（重跑不會重複加）。
    不做容差合併：位置差幾 cm 的兩道牆是兩道（正式站 275.6 vs 278.04 那對會並存，人自己刪一道）——
    容差會把真的不同的牆（276 vs 284）合掉，那道牆就消失了。"""
    key = f"{floor}:{_num(x)}:{_num(y)}:{_num(w)}:{_num(d)}"
    return "partition-" + hashlib.sha1(key.encode()).hexdigest()[:8]


def collect_partitions(plans):
    """plans: [{id, name, plan:{items:[...]}}] → 去重後的 partition 元件清單（依 floor, x, y 排序）。"""
    seen = {}
    for p in plans:
        for it in (p.get("plan") or {}).get("items") or []:
            if not it.get("wall"):
                continue
            floor = int(it.get("floor") or 1)
            x, y, w, d = _num(it.get("x")), _num(it.get("y")), _num(it.get("w")), _num(it.get("d"))
            pid = partition_id(floor, x, y, w, d)
            if pid in seen:
                seen[pid]["_from"].append(p.get("name") or p.get("id"))
                continue
            seen[pid] = {"id": pid, "kind": "partition", "floor": floor, "name": "房間隔層",
                         "x": x, "y": y, "w": w, "d": d, "_from": [p.get("name") or p.get("id")]}
    return sorted(seen.values(), key=lambda e: (e["floor"], e["x"], e["y"]))


def strip_walls(plan):
    """回傳沒有 wall 設備的新 plan（measures 與其他設備原樣、順序不變）；不動原物件。"""
    plan = dict(plan or {})
    plan["items"] = [it for it in (plan.get("items") or []) if not it.get("wall")]
    return plan


def merge_structure(existing, partitions):
    """現有結構元件 ＋ 新 partition（id 已存在的不重複加）。"""
    have = {e.get("id") for e in existing}
    out = list(existing)
    for e in partitions:
        if e["id"] in have:
            continue
        out.append({k: v for k, v in e.items() if not k.startswith("_")})
    return out


def http(method, path, body=None, base=BASE):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"User-Agent": "walls-to-structure/1.0 (drink-shop-planner)"}   # Cloudflare 擋 Python-urllib 的 UA
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def fetch_all(base, http_fn=http):
    st, lst = http_fn("GET", "/api/plans", base=base)
    if st != 200:
        sys.exit(f"GET /api/plans 回 {st}: {lst}")
    plans = []
    for p in lst:
        st, full = http_fn("GET", f"/api/plans/{p['id']}", base=base)
        if st != 200:
            sys.exit(f"GET /api/plans/{p['id']} 回 {st}")
        plans.append(full)
    st, structure = http_fn("GET", "/api/structure", base=base)
    if st != 200:
        sys.exit(f"GET /api/structure 回 {st}: {structure}")
    return plans, structure


def apply(base, plans, structure, partitions, http_fn=http):
    """先寫結構、成功才逐份改方案。回傳 True 表示全部成功。"""
    merged = merge_structure(structure.get("elements") or [], partitions)
    st, res = http_fn("PUT", "/api/structure", {"structure": {"elements": merged}, "baseRev": structure.get("rev", 0)}, base=base)
    print("PUT /api/structure →", st, res if st != 200 else f"rev {res['rev']}（{len(merged)} 個元件）")
    if st != 200:
        print("結構沒寫成，方案一律不動；409 表示有人剛存過結構，重跑一次即可")
        return False
    ok = True
    for p in plans:
        walls = [it for it in (p.get("plan") or {}).get("items") or [] if it.get("wall")]
        if not walls:
            continue
        body = {"plan": strip_walls(p.get("plan")), "baseRev": p.get("rev", 0)}
        st, res = http_fn("PUT", f"/api/plans/{p['id']}", body, base=base)
        # 409 不在這裡重做：最新版可能多了一道剛加的牆，直接 strip 會把它弄丟（結構那次 PUT 沒收到它）。
        # 這份不動、標失敗；整支腳本可重跑（partition id 穩定、merge 略過已存在的），重跑會把新牆補進結構再移。
        print(f"PUT /api/plans/{p['id']}（{p.get('name')}）→", st,
              ("有人剛存過，這份沒動；重跑一次腳本" if st == 409 else res) if st != 200 else f"rev {res['rev']}，移掉 {len(walls)} 道牆")
        if st != 200:
            ok = False
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真的寫到伺服器（預設只印）")
    ap.add_argument("--base", default=BASE)
    a = ap.parse_args()

    plans, structure = fetch_all(a.base)
    partitions = collect_partitions(plans)
    print(f"結構 rev {structure.get('rev')}、{len(structure.get('elements') or [])} 個元件")
    for p in plans:
        n = sum(1 for it in (p.get("plan") or {}).get("items") or [] if it.get("wall"))
        print(f"  方案「{p.get('name')}」rev {p.get('rev')}：{n} 道隔間牆")
    print(f"→ {len(partitions)} 筆 partition（去重後）：")
    for e in partitions:
        print(f"  {e['id']} {e['floor']}F x{e['x']} y{e['y']} {e['w']}×{e['d']}  來自：{'、'.join(e['_from'])}")
    if not a.apply:
        print("（dry-run；--apply 才寫）")
        return
    if not apply(a.base, plans, structure, partitions):
        sys.exit(1)


if __name__ == "__main__":
    main()
