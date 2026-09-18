#!/usr/bin/env python3
"""把 106 號原始平面圖（8.dwg，AutoCAD 2013）的四層結構與家具匯進編輯器。

來源：Google Drive `106號裝潢/8.dwg`，用 libredwg `dwg2dxf` 轉 DXF 後以 ezdxf 讀圖層
（樑／建築／磚牆／木牆／門窗／家具），下面的座標是 2026-09-17 從 DXF 抄下來的圖面單位
（1 單位 = 0.1 台尺 = 3.048 cm）。四層在圖上並排，各層的局部座標：
x 從內框左緣起算（0–123，右緣是樓梯側），y 用 DXF 原值（內框 1366.6–1766.6，
下緣 1366.6 是玄關側）。

換算到編輯器（1300×375 cm，原點左上、玄關在右、樓梯在上緣）：
  app_x = (1766.6 - y) * 3.25      圖上長邊只有 400 單位 = 1219 cm，等比拉到 1300
  app_y = (123   - x) * 3.048      短邊 123 單位 = 375 cm，剛好

用法：
  python3 scripts/dwg_import.py                 # dry-run：印出要寫的結構與方案 JSON
  python3 scripts/dwg_import.py --apply         # PUT /api/structure + POST /api/plans
  python3 scripts/dwg_import.py --apply --base https://drinkshop-new.andremusic.dev
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

BASE = "https://drinkshop.andremusic.dev"
Y_TOP, X_RIGHT = 1766.6, 123.0
SX, SY = 1300 / 400, 375 / 123

# 1F 飲料店設備要從這一份方案複製（正式站上最近在改的那份）
SOURCE_PLAN_ID = "413c34c07d6f4988"
NEW_PLAN_NAME = "原始平面圖（8.dwg）"

# ---- 結構（四層共用一份，全部照 DWG）----------------------------------------
BEAMS = [(1420.1, 1433.1), (1560.1, 1573.1), (1693.6, 1706.6)]   # y 範圍，全寬
STAIRS = (96.0, 123.0, 1430.6, 1566.6)                             # x1, x2, y1, y2
BATH = {1: (0.0, 93.0, 1672.6, 1717.6), 2: (0.0, 93.0, 1622.6, 1662.6), 3: (0.0, 93.0, 1622.6, 1662.6)}
# 玄關 DWG 沒畫（正面是鐵捲門），沿用正式站現有的那一筆
ENTRY = {"id": "entry-1", "kind": "entry", "floor": 1, "name": "玄關 175×100", "x": 1125, "y": 0, "w": 175, "d": 100}

# ---- 家具（2–4F；1F 放飲料店設備）：(名稱, 分類, x1, x2, y1, y2, 高度) ---------
FURNITURE = {
    2: [
        ("衣櫃", "shelf", 108.0, 123.0, 1706.6, 1766.6, 200),
        ("雙人床", "shelf", 0.0, 61.9, 1706.6, 1756.6, 50),
        ("椅子", "shelf", 67.0, 82.9, 1691.5, 1707.6, 45),
        ("書桌", "shelf", 0.0, 90.0, 1666.6, 1686.6, 75),
        ("浴缸", "water", 0.0, 31.7, 1622.6, 1662.6, 55),
        ("馬桶", "water", 37.0, 52.0, 1622.6, 1644.8, 40),
        ("洗手台", "water", 57.3, 77.3, 1622.6, 1637.6, 80),
        ("衣櫃", "shelf", 0.0, 30.0, 1588.6, 1618.6, 200),
        ("雙人床", "shelf", 0.0, 61.9, 1528.6, 1578.6, 50),
    ],
    3: [
        ("雙人床", "shelf", 0.0, 61.9, 1706.6, 1756.6, 50),
        ("書桌+椅", "shelf", 91.9, 123.0, 1716.6, 1746.6, 75),
        ("書桌", "shelf", 0.0, 60.0, 1666.6, 1686.6, 75),
        ("浴缸", "water", 0.0, 31.7, 1622.6, 1662.6, 55),
        ("馬桶", "water", 37.0, 52.0, 1622.6, 1644.8, 40),
        ("洗手台", "water", 57.3, 77.3, 1622.6, 1637.6, 80),
        ("衣櫃", "shelf", 0.0, 60.0, 1603.6, 1618.6, 200),
        ("書桌+椅", "shelf", 30.9, 62.0, 1538.5, 1568.5, 75),
        ("雙人床", "shelf", 0.0, 61.9, 1473.6, 1538.6, 50),
    ],
    4: [
        ("衣櫃", "shelf", 0.0, 45.0, 1712.6, 1727.6, 200),
        ("雙人床", "shelf", 0.0, 61.9, 1649.6, 1699.6, 50),
        ("床頭櫃", "shelf", 77.9, 92.9, 1659.6, 1689.6, 60),
        ("衣櫃", "shelf", 0.0, 60.0, 1606.6, 1621.6, 200),
    ],
}

# ---- 隔間牆（2–4F，磚牆／木牆圖層；1F 的舊隔間不進飲料店方案）：(x1, x2, y1, y2) ----
WALLS = {
    2: [
        (0.0, 93.9, 1662.6, 1666.6), (0.0, 93.0, 1618.6, 1622.6), (93.0, 97.0, 1618.6, 1635.5),
        (62.0, 65.0, 1525.6, 1589.6), (0.0, 65.0, 1525.6, 1528.6), (92.0, 96.0, 1430.6, 1566.6),
    ],
    3: [
        (0.0, 93.9, 1662.6, 1666.6), (0.0, 93.0, 1618.6, 1622.6), (93.0, 97.0, 1618.6, 1635.5),
        (62.0, 65.0, 1597.6, 1618.6), (62.0, 65.0, 1470.6, 1569.6), (0.0, 65.0, 1470.6, 1473.6),
        (92.0, 96.0, 1430.6, 1566.6),
    ],
    4: [
        (0.0, 96.0, 1727.6, 1731.6), (0.0, 96.0, 1646.6, 1649.6), (93.0, 96.0, 1649.6, 1697.5),
        (0.0, 96.0, 1602.6, 1606.6), (93.0, 96.0, 1606.6, 1619.5), (0.0, 92.0, 1486.6, 1490.6),
        (92.0, 96.0, 1430.6, 1566.6),
    ],
}

# ---- 門（門窗圖層，只取門扇外框；開向請在編輯器裡翻）：(x1, x2, y1, y2) ----
DOORS = {
    2: [(92.9, 123.0, 1663.6, 1694.6), (64.0, 92.0, 1635.5, 1662.6), (33.9, 65.0, 1588.5, 1618.6)],
    3: [(92.9, 123.0, 1663.6, 1694.6), (64.0, 92.0, 1635.5, 1662.6), (33.9, 65.0, 1568.5, 1598.6)],
    4: [(64.9, 123.0, 1697.5, 1755.6), (67.9, 96.0, 1619.5, 1646.6)],
}


def rect(x1, x2, y1, y2):
    """圖面矩形 → 編輯器 {x, y, w, d}（cm，四捨五入到整數）。"""
    return {
        "x": round((Y_TOP - y2) * SX), "y": round((X_RIGHT - x2) * SY),
        "w": round((y2 - y1) * SX), "d": round((x2 - x1) * SY),
    }


def build_structure():
    els = [ENTRY]
    for f in (1, 2, 3, 4):
        for i, (y1, y2) in enumerate(BEAMS, 1):
            r = rect(0, X_RIGHT, y1, y2)
            els.append({"id": f"beam-{f}-{i}", "kind": "beam", "floor": f, "name": f"梁{i}", **r})
        r = rect(*STAIRS)
        els.append({"id": f"stairs-{f}", "kind": "stairs", "floor": f, "name": f"樓梯 {r['w']}×{r['d']}", **r})
        if f in BATH:
            r = rect(*BATH[f])
            els.append({"id": f"bath-{f}", "kind": "bath", "floor": f, "name": f"廁所 {r['w']}×{r['d']}", **r})
    return els


def build_items(source_items):
    items = []
    for it in source_items:
        it = dict(it)
        it.setdefault("floor", 1)
        items.append(it)
    uid = max([0] + [int(i.get("id") or 0) for i in items]) + 1
    for f in (2, 3, 4):
        for (n, c, x1, x2, y1, y2, h) in FURNITURE[f]:
            r = rect(x1, x2, y1, y2)
            items.append({"id": uid, "n": n, "c": c, "h": h, "rot": 0, "door": False, "floor": f, **r}); uid += 1
        for (x1, x2, y1, y2) in WALLS[f]:
            r = rect(x1, x2, y1, y2)
            items.append({"id": uid, "n": "隔間牆", "c": "wall", "h": 0, "rot": 0, "wall": True, "floor": f, **r}); uid += 1
        for (x1, x2, y1, y2) in DOORS[f]:
            r = rect(x1, x2, y1, y2)
            s = max(r["w"], r["d"])
            items.append({"id": uid, "n": "門", "c": "seal", "h": 0, "rot": 0, "door": True, "flip": False, "floor": f,
                          "x": r["x"], "y": r["y"], "w": s, "d": s}); uid += 1
    return items


def http(method, path, body=None, base=BASE):
    data = json.dumps(body).encode() if body is not None else None
    # Cloudflare 會擋 Python-urllib 的 UA（403 純文字），換個 UA
    headers = {"User-Agent": "dwg-import/1.0 (drink-shop-planner)"}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真的寫到伺服器（預設只印）")
    ap.add_argument("--base", default=BASE)
    ap.add_argument("--source", default=SOURCE_PLAN_ID, help="1F 設備要複製的方案 id")
    ap.add_argument("--name", default=NEW_PLAN_NAME)
    a = ap.parse_args()

    st, cur = http("GET", "/api/structure", base=a.base)
    if st != 200:
        sys.exit(f"GET /api/structure 回 {st}: {cur}")
    st, src = http("GET", f"/api/plans/{a.source}", base=a.base)
    if st != 200:
        sys.exit(f"GET /api/plans/{a.source} 回 {st}: {src}")

    src_items = (src.get("plan") or {}).get("items") or []
    elements = build_structure()
    items = build_items(src_items)
    plan = {"items": items, "measures": []}

    print(f"structure: 現在 rev {cur['rev']}、{len(cur['elements'])} 個元件 → 改成 {len(elements)} 個")
    print(f"plan: 從「{src['name']}」複製 {len(src_items)} 件 1F 設備，加 2–4F {len(items) - len(src_items)} 件 → 新方案「{a.name}」")
    if not a.apply:
        print(json.dumps({"structure": {"elements": elements}, "plan": plan}, ensure_ascii=False, indent=1))
        return

    st, res = http("PUT", "/api/structure", {"structure": {"elements": elements}, "baseRev": cur["rev"]}, base=a.base)
    print("PUT /api/structure →", st, res if st != 200 else f"rev {res['rev']}")
    if st != 200:
        sys.exit(1)
    st, res = http("POST", "/api/plans", {"name": a.name, "plan": plan}, base=a.base)
    print("POST /api/plans →", st, res)
    if st != 200:
        sys.exit(1)


if __name__ == "__main__":
    main()
