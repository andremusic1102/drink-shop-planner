"""scripts/dwg_import.py 的純函式測試：不打網路。

只測座標換算（rect）與兩個組裝函式（build_structure／build_items）——
它們是 DWG 圖面單位 → 編輯器 1300×375 cm 的唯一轉換點，http()／main() 不碰。
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts"))
import dwg_import  # noqa: E402

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

def test_build_structure_counts_and_kinds():
    els = dwg_import.build_structure()
    assert len(els) == 20
    assert {e["kind"] for e in els} == {"beam", "stairs", "bath", "entry"}
    assert len({e["id"] for e in els}) == 20
    assert sorted(e["floor"] for e in els if e["kind"] == "beam") == [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]
    assert sorted(e["floor"] for e in els if e["kind"] == "stairs") == [1, 2, 3, 4]
    assert sorted(e["floor"] for e in els if e["kind"] == "bath") == [1, 2, 3]
    assert [e["floor"] for e in els if e["kind"] == "entry"] == [1]


def test_build_structure_all_within_frame():
    frame = {"x": 0, "y": 0, "w": APP_W, "d": APP_D}
    outside = [e["id"] for e in dwg_import.build_structure() if not _inside(e, frame)]
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
    bath = {e["floor"]: e for e in dwg_import.build_structure() if e["kind"] == "bath"}
    items = dwg_import.build_items([SOURCE_ITEM])
    fixtures = [i for i in items if i["n"] in ("浴缸", "馬桶", "洗手台")]
    assert [(i["floor"], i["n"]) for i in fixtures] == [
        (2, "浴缸"), (2, "馬桶"), (2, "洗手台"), (3, "浴缸"), (3, "馬桶"), (3, "洗手台")]
    bad = [(i["floor"], i["n"]) for i in fixtures if not _inside(i, bath[i["floor"]])]
    assert bad == []


def test_build_items_walls_and_doors_shape():
    items = dwg_import.build_items([SOURCE_ITEM])
    walls = [i for i in items if i.get("wall")]
    doors = [i for i in items if i.get("door")]
    assert len(walls) == 20
    assert len(doors) == 8
    assert [i["c"] for i in walls] == ["wall"] * 20
    assert [i["w"] == i["d"] for i in doors] == [True] * 8
