"""scripts/walls_to_structure.py 的純函式與 apply() 順序測試：不打網路。"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import walls_to_structure as w2s

WALL = lambda x, w=10, d=275, **k: {"id": k.pop("id", 0), "n": "隔間牆", "c": "wall", "wall": True, "x": x, "y": 100, "w": w, "d": d, "rot": 90, **k}
PLAN_A = {"id": "a", "name": "洗手台工作台未定", "rev": 348, "plan": {"items": [
    {"id": 1, "n": "冰箱", "c": "cold", "x": 10, "y": 10, "w": 60, "d": 60},
    WALL(704, id=2), WALL(276, id=3), WALL(136, id=4), WALL(146, 140, 10, id=5),
], "measures": [{"id": 9, "a": {"x": 0, "y": 0}, "b": {"x": 100, "y": 0}}]}}
PLAN_B = {"id": "b", "name": "牆在正中間", "rev": 179, "plan": {"items": [
    WALL(640, id=2), WALL(276, id=3), WALL(136, id=4), WALL(146, 140, 10, id=5),
    {"id": 7, "n": "床", "c": "shelf", "floor": 2, "x": 1, "y": 2, "w": 3, "d": 4},
], "measures": []}}
PLAN_C = {"id": "c", "name": "目前擺法", "rev": 17, "plan": {"items": [], "measures": []}}


def test_collect_dedupes_identical_walls_across_plans():
    parts = w2s.collect_partitions([PLAN_A, PLAN_B, PLAN_C])
    assert len(parts) == 5, "三道相同合成三筆＋兩道不同的中段牆各一筆"
    assert [p["kind"] for p in parts] == ["partition"] * 5
    assert [p["floor"] for p in parts] == [1] * 5
    xs = sorted(p["x"] for p in parts)
    assert xs == [136, 146, 276, 640, 704]
    shared = next(p for p in parts if p["x"] == 276)
    assert shared["_from"] == ["洗手台工作台未定", "牆在正中間"], "相同的牆記得來自哪兩份"
    ids = [p["id"] for p in parts]
    assert len(set(ids)) == 5 and all(i.startswith("partition-") for i in ids)
    # 同一道牆再跑一次得到同一個 id（重跑不會重複加）
    assert w2s.partition_id(1, 276, 100, 10, 275) == shared["id"]
    assert w2s.collect_partitions([]) == []


def test_collect_keeps_walls_that_differ_by_a_few_cm():
    # 契約：同一組 (floor, x, y, w, d) 才去重。差幾 cm 的是兩道（正式站 275.6 vs 278.04 那對會並存），
    # 不做容差——容差會把真的不同的牆（276 vs 284）合掉、那道牆就消失
    a = {"id": "a", "name": "A", "rev": 1, "plan": {"items": [WALL(275.6, id=1), WALL(276, id=2)]}}
    b = {"id": "b", "name": "B", "rev": 1, "plan": {"items": [WALL(278.04, id=1), WALL(284, id=2), WALL(276, id=3)]}}
    parts = w2s.collect_partitions([a, b])
    assert [p["x"] for p in parts] == [275.6, 276, 278.04, 284]
    assert next(p for p in parts if p["x"] == 276)["_from"] == ["A", "B"], "完全相同的才合"
    # 小數第三位不同也是兩道（不做任何四捨五入）
    assert w2s.partition_id(1, 1.001, 100, 10, 275) != w2s.partition_id(1, 1.004, 100, 10, 275)
    assert w2s.partition_id(1, 276, 100, 10, 275) == w2s.partition_id(1, 276.0, 100.0, 10, 275), "276 與 276.0 是同一個值"


def test_strip_walls_keeps_everything_else():
    out = w2s.strip_walls(PLAN_A["plan"])
    assert [i["id"] for i in out["items"]] == [1]
    assert out["measures"] == PLAN_A["plan"]["measures"]
    assert len(PLAN_A["plan"]["items"]) == 5, "不動原物件"
    out_b = w2s.strip_walls(PLAN_B["plan"])
    assert [i["id"] for i in out_b["items"]] == [7]
    assert out_b["items"][0]["floor"] == 2
    assert w2s.strip_walls(None) == {"items": []}


def test_merge_structure_keeps_existing_and_skips_dupes():
    existing = [{"id": "beam-1", "kind": "beam", "floor": 1, "x": 0, "y": 0, "w": 1300, "d": 30},
                {"id": w2s.partition_id(1, 276, 100, 10, 275), "kind": "partition", "floor": 1, "x": 276, "y": 100, "w": 10, "d": 275}]
    parts = w2s.collect_partitions([PLAN_A, PLAN_B])
    merged = w2s.merge_structure(existing, parts)
    assert [e["id"] for e in merged][:2] == ["beam-1", existing[1]["id"]], "現有的原樣、順序不變"
    assert len(merged) == 1 + 5, "已存在的那道不重複加"
    assert all(not any(k.startswith("_") for k in e) for e in merged), "_from 不進伺服器"


NEW_WALL = WALL(900, id=8)
LATEST_A = {**PLAN_A, "rev": 349, "plan": {"items": PLAN_A["plan"]["items"] + [NEW_WALL], "measures": []}}


def _fake(fail_structure=False, conflict_once=None):
    """假伺服器：結構 rev 從 15 起；conflict_once 指定哪份方案第一次 PUT 回 409（之後 GET 回多一道新牆的最新版）。"""
    calls = []
    state = {"conflicted": False, "struct_rev": 15, "struct_elements": []}

    def http_fn(method, path, body=None, base=""):
        calls.append((method, path, body))
        if method == "PUT" and path == "/api/structure":
            if fail_structure:
                return (409, {"ok": False, "rev": 99})
            if body["baseRev"] != state["struct_rev"]:
                return (409, {"ok": False, "rev": state["struct_rev"]})
            state["struct_rev"] += 1; state["struct_elements"] = body["structure"]["elements"]
            return (200, {"ok": True, "rev": state["struct_rev"]})
        if method == "GET" and path == "/api/structure":
            return (200, {"rev": state["struct_rev"], "elements": state["struct_elements"]})
        if method == "PUT" and path.startswith("/api/plans/"):
            pid = path.rsplit("/", 1)[1]
            if conflict_once == pid and not state["conflicted"]:
                state["conflicted"] = True
                return (409, {"rev": 349, "plan": LATEST_A["plan"]})
            return (200, {"ok": True, "rev": (body or {}).get("baseRev", 0) + 1})
        if method == "GET" and path == "/api/plans/a":
            return (200, LATEST_A)
        raise AssertionError("不預期的呼叫 " + method + " " + path)
    return http_fn, calls


def test_apply_writes_structure_first_and_never_touches_plans_on_failure():
    http_fn, calls = _fake(fail_structure=True)
    ok = w2s.apply("http://x", [PLAN_A, PLAN_B, PLAN_C], {"rev": 15, "elements": []}, w2s.collect_partitions([PLAN_A, PLAN_B]), http_fn=http_fn)
    assert ok is False
    assert [(m, p) for m, p, _ in calls] == [("PUT", "/api/structure")], "結構失敗就停，方案一筆都沒碰"
    assert calls[0][2]["baseRev"] == 15
    assert len(calls[0][2]["structure"]["elements"]) == 5


def test_apply_409_refetches_plan_tops_up_structure_then_strips():
    # a 第一次 PUT 撞 409（有人剛加了一道新牆 x=900）→ 腳本自己重 GET a → 新牆補進結構（新 rev）→ 再 strip a 用 rev 349 PUT → b 照常
    http_fn, calls = _fake(conflict_once="a")
    beam = {"id": "beam-1", "kind": "beam", "floor": 1, "x": 0, "y": 0, "w": 1300, "d": 30}
    ok = w2s.apply("http://x", [PLAN_A, PLAN_B, PLAN_C], {"rev": 15, "elements": [beam]}, w2s.collect_partitions([PLAN_A, PLAN_B]), http_fn=http_fn)
    assert ok is True
    seq = [(m, p) for m, p, _ in calls]
    assert seq == [("PUT", "/api/structure"), ("PUT", "/api/plans/a"), ("GET", "/api/plans/a"), ("GET", "/api/structure"), ("PUT", "/api/structure"),
                   ("PUT", "/api/plans/a"), ("PUT", "/api/plans/b")], "409 → 重 GET a → 補結構 → 再 PUT a → b；c 沒牆不碰"
    assert len(calls[0][2]["structure"]["elements"]) == 6, "第一次結構：梁＋5 道牆"
    topup = calls[4][2]
    assert topup["baseRev"] == 16 and len(topup["structure"]["elements"]) == 7 and any(e["x"] == 900 for e in topup["structure"]["elements"]), "補的那次用新 rev、只多那道新牆"
    second_put_a = calls[5][2]
    assert second_put_a["baseRev"] == 349 and [i["id"] for i in second_put_a["plan"]["items"]] == [1], "strip 的是最新版（含新牆）"
    put_b = calls[6][2]
    assert put_b["baseRev"] == 179 and [i["id"] for i in put_b["plan"]["items"]] == [7]


def test_apply_gives_up_after_retries():
    # 每次都 409：重做 retries 次後標失敗、不繼續撞
    calls = []
    def http_fn(method, path, body=None, base=""):
        calls.append((method, path))
        if method == "PUT" and path == "/api/structure": return (200, {"ok": True, "rev": 16})
        if method == "PUT": return (409, {"rev": 999})
        if method == "GET": return (200, {**PLAN_A, "rev": 999})
        raise AssertionError(path)
    ok = w2s.apply("http://x", [PLAN_A], {"rev": 15, "elements": []}, w2s.collect_partitions([PLAN_A]), http_fn=http_fn, retries=2)
    assert ok is False
    assert calls.count(("PUT", "/api/plans/a")) == 3 and calls.count(("GET", "/api/plans/a")) == 2
