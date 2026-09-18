"""scripts/dwg_import.py 的純函式測試：不打網路。

只測座標換算（rect）與兩個組裝函式（build_structure／build_items）——
它們是 DWG 圖面單位 → 編輯器 1300×375 cm 的唯一轉換點；apply()／main() 用假 http 測順序與旗標，不打網路。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import dwg_import

APP_W, APP_D = 1300, 375
SOURCE_ITEM = {"id": 4, "n": "工作台", "c": "counter", "w": 78, "d": 196, "x": 1222, "y": 163, "h": 123, "rot": 0, "door": False}


def _inside(inner, outer):
    return (outer["x"] <= inner["x"] and inner["x"] + inner["w"] <= outer["x"] + outer["w"]
            and outer["y"] <= inner["y"] and inner["y"] + inner["d"] <= outer["y"] + outer["d"])


# ---- rect() -----------------------------------------------------------------

def test_rect_first_beam_near_entry():
    r = dwg_import.rect(0, 123, 1420.1, 1433.1)
    assert r == {"x": 1084, "y": 0, "w": 42, "d": 375}
    assert 1080 <= r["x"] <= 1090


def test_rect_stairs_hug_top_edge_and_fit_width():
    r = dwg_import.rect(96, 123, 1430.6, 1566.6)
    assert r == {"x": 650, "y": 0, "w": 442, "d": 82}
    assert 645 <= r["x"] <= 655
    assert r["x"] + r["w"] <= APP_W


# ---- build_structure() ------------------------------------------------------

# 正式站 rev 15 的 1F 六個元件（實測）：keep-1f 要原樣保留
EXISTING_1F = [
    {"id": "entry-1", "kind": "entry", "floor": 1, "name": "玄關 175×100", "x": 1125, "y": 0, "w": 175, "d": 100},
    {"id": "stairs-1", "kind": "stairs", "floor": 1, "name": "樓梯 267×100", "x": 858, "y": 0, "w": 267, "d": 100},
    {"id": "bath-1", "kind": "bath", "floor": 1, "name": "廁所 140×269", "x": 137, "y": 106, "w": 140, "d": 269},
    {"id": "beam-1", "kind": "beam", "floor": 1, "name": "梁1（近玄關）", "x": 1062, "y": 0, "w": 57, "d": 375},
    {"id": "beam-2", "kind": "beam", "floor": 1, "name": "梁2（中段）", "x": 648, "y": 0, "w": 44, "d": 375},
    {"id": "beam-3", "kind": "beam", "floor": 1, "name": "梁3（後段）", "x": 174, "y": 0, "w": 61, "d": 375},
]


def test_build_structure_keep_1f_preserves_existing_1f_elements():
    els = dwg_import.build_structure(EXISTING_1F, keep_1f=True)
    assert els[:6] == EXISTING_1F, "1F 六筆 id／座標原樣、順序在前"
    upper = els[6:]
    assert all(e["floor"] in (2, 3, 4) for e in upper), "接上去的只有 2–4F"
    kinds = {k: sum(1 for e in upper if e["kind"] == k) for k in ("beam", "stairs", "bath", "partition", "entry")}
    assert kinds == {"beam": 9, "stairs": 3, "bath": 2, "partition": 20, "entry": 0}
    assert len({e["id"] for e in els}) == len(els) == 6 + 34, "無重複 id"
    assert sorted(e["floor"] for e in upper if e["kind"] == "partition") == [2] * 6 + [3] * 7 + [4] * 7
    # 可重跑：把結果再餵回去，不會重複加
    assert dwg_import.build_structure(els, keep_1f=True) == els
    # 現有的 2F 元件（父母加的）也保留
    extra = {"id": "bath-2f-own", "kind": "bath", "floor": 2, "name": "自己加的", "x": 1, "y": 2, "w": 3, "d": 4}
    els2 = dwg_import.build_structure(EXISTING_1F + [extra], keep_1f=True)
    assert extra in els2 and len(els2) == 6 + 1 + 34


def test_build_structure_replace_1f():
    els = dwg_import.build_structure(EXISTING_1F, keep_1f=False)
    assert len(els) == 1 + 4 * 4 + 3 + 20, "玄關 1＋每層 3 梁＋樓梯（16）＋廁所 3＋隔間牆 20"
    assert {e["kind"] for e in els} == {"beam", "stairs", "bath", "entry", "partition"}
    assert len({e["id"] for e in els}) == len(els)
    beams1 = sorted(e["x"] for e in els if e["kind"] == "beam" and e["floor"] == 1)
    assert beams1 == [195, 629, 1084], "1F 三根梁是 DWG 值，不是實測"
    assert not any(e["id"] == "beam-1" for e in els), "現有的一律丟掉"
    assert sorted(e["floor"] for e in els if e["kind"] == "bath") == [1, 2, 3]


def test_build_structure_all_within_frame():
    frame = {"x": 0, "y": 0, "w": APP_W, "d": APP_D}
    for keep in (True, False):
        outside = [e["id"] for e in dwg_import.build_structure(EXISTING_1F, keep_1f=keep) if not _inside(e, frame)]
        assert outside == []


# ---- build_items() ----------------------------------------------------------

def test_build_items_keeps_source_on_1f_and_adds_upper_floors():
    items = dwg_import.build_items([SOURCE_ITEM])
    src = [i for i in items if i["id"] == 4]
    assert len(src) == 1
    assert src[0]["floor"] == 1
    assert src[0]["n"] == "工作台"
    new = [i for i in items if i["id"] != 4]
    assert len(new) == len(items) - 1
    assert {i["floor"] for i in new} == {2, 3, 4}
    assert len({i["id"] for i in items}) == len(items)
    assert min(i["id"] for i in new) > 4


def test_build_items_bath_fixtures_inside_bath_element():
    bath = {e["floor"]: e for e in dwg_import.build_structure(EXISTING_1F, keep_1f=True) if e["kind"] == "bath"}
    items = dwg_import.build_items([SOURCE_ITEM])
    fixtures = [i for i in items if i["n"] in ("浴缸", "馬桶", "洗手台")]
    assert [(i["floor"], i["n"]) for i in fixtures] == [
        (2, "浴缸"), (2, "馬桶"), (2, "洗手台"), (3, "浴缸"), (3, "馬桶"), (3, "洗手台")]
    bad = [(i["floor"], i["n"]) for i in fixtures if not _inside(i, bath[i["floor"]])]
    assert bad == []


def test_build_items_has_no_walls():
    # 牆已在結構：2–4F 的 DWG 隔間牆不進方案；來源方案裡的隔間牆設備也不複製
    src_wall = {"id": 5, "n": "隔間牆", "c": "wall", "wall": True, "w": 200, "d": 10, "x": 80, "y": 80, "h": 0, "rot": 0}
    items = dwg_import.build_items([SOURCE_ITEM, src_wall])
    assert [i for i in items if i.get("wall")] == []
    assert [i["id"] for i in items if (i.get("floor") or 1) == 1] == [SOURCE_ITEM["id"]], "來源只剩非牆的那件"
    doors = [i for i in items if i.get("door")]
    assert len(doors) == 8
    assert [i["w"] == i["d"] for i in doors] == [True] * 8
    assert sum(1 for i in items if (i.get("floor") or 1) != 1) == 22 + 8, "2–4F 家具 22＋門 8"


# ---- apply()：順序與半套用 ------------------------------------------------------
# 共用結構是所有方案一起吃的，所以一定要「先建新方案（純新增）、成功才覆寫結構」。
# 用假的 http_fn 記下呼叫順序與實際送出的 body，不打網路。

def _fake_http(fail_on=None, put_status=200):
    calls = []

    def http_fn(method, path, body=None, base=""):
        calls.append((method, path, body))
        if method == "POST":
            return (500, {"error": "boom"}) if fail_on == "POST" else (200, {"id": "abc123", "rev": 1})
        return (put_status, {"ok": False, "rev": 99} if put_status != 200 else {"ok": True, "rev": 16})
    return http_fn, calls


def test_apply_posts_plan_before_putting_structure():
    http_fn, calls = _fake_http()
    ok = dwg_import.apply("http://x", "新方案", {"items": [], "measures": []}, [dwg_import.ENTRY], 15, http_fn=http_fn)
    assert ok is True
    assert [(m, p) for m, p, _ in calls] == [("POST", "/api/plans"), ("PUT", "/api/structure")]
    # 實際送出的 body：方案名稱與 baseRev 要原樣進去
    assert calls[0][2] == {"name": "新方案", "plan": {"items": [], "measures": []}}
    assert calls[1][2] == {"structure": {"elements": [dwg_import.ENTRY]}, "baseRev": 15}


def test_apply_plan_failure_leaves_structure_untouched():
    http_fn, calls = _fake_http(fail_on="POST")
    ok = dwg_import.apply("http://x", "新方案", {"items": []}, [dwg_import.ENTRY], 15, http_fn=http_fn)
    assert ok is False
    assert [m for m, _, _ in calls] == ["POST"]


def test_apply_structure_409_reports_false_but_plan_already_created():
    http_fn, calls = _fake_http(put_status=409)
    ok = dwg_import.apply("http://x", "新方案", {"items": []}, [dwg_import.ENTRY], 15, http_fn=http_fn)
    assert ok is False
    assert [m for m, _, _ in calls] == ["POST", "PUT"]


# ---- main()：--apply 的安全閥 ------------------------------------------------------
# --apply 會整份換掉伺服器現有的 1F 結構（實測梁／廁所）。--keep-1f（plans/bath.md D1）
# 做出來前，--apply 一定要明確帶 --replace-1f，而且要在打任何網路之前就擋下。

def test_main_default_is_keep_1f(monkeypatch):
    # 預設 --keep-1f：dry-run 印出的結構是「現有 1F 原樣＋2–4F」；--replace-1f 才是 DWG 四層
    import contextlib
    import io
    import json as _json
    def fake_http(method, path, body=None, base=""):
        if path == "/api/structure": return (200, {"rev": 15, "elements": EXISTING_1F})
        if path.startswith("/api/plans/"): return (200, {"id": "src", "name": "來源", "rev": 1, "plan": {"items": [SOURCE_ITEM]}})
        raise AssertionError(path)
    monkeypatch.setattr(dwg_import, "http", fake_http)
    for argv, expect_first_beam in ((["dwg_import.py"], 1062), (["dwg_import.py", "--replace-1f"], None)):
        monkeypatch.setattr(sys, "argv", argv)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            dwg_import.main()
        out = buf.getvalue()
        payload = _json.loads(out[out.index("{"):])
        els = payload["structure"]["elements"]
        b1 = next((e for e in els if e["id"] == "beam-1"), None)
        assert (b1["x"] if b1 else None) == expect_first_beam
        assert payload["plan"]["items"] and not any(i.get("wall") for i in payload["plan"]["items"])
