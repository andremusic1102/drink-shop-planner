#!/usr/bin/env python3
"""drink-shop-planner 共享後端：多方案 + 樂觀鎖 + 版本備份 + 縮圖。純 stdlib、公開無密碼。"""
import json, os, re, time, threading, tempfile, secrets, html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
APP_HTML = os.path.join(BASE, "app.html")
STATE = os.path.join(BASE, "state")
PLANS = os.path.join(STATE, "plans")
BACKUPS = os.path.join(STATE, "backups")
TRASH = os.path.join(STATE, "trash")
for d in (STATE, PLANS, BACKUPS, TRASH):
    os.makedirs(d, exist_ok=True)

PORT = 8788
KEEP_BACKUPS = 50
LOCK = threading.Lock()

# 平面常數 + 縮圖用的類別色（取自 app 淺色主題）
PLAN_W, PLAN_H = 1300, 375
CAT_FILL = {"counter": "#d3e3de", "cold": "#cfe0e8", "water": "#cfe6e2", "heat": "#f0dcc6",
            "seal": "#e4ddf1", "shrine": "#eee0c2", "shelf": "#dee4e4"}
CAT_STROKE = {"counter": "#2f6f63", "cold": "#4a86a6", "water": "#2f8f8a", "heat": "#c47a3a",
              "seal": "#7a5fb0", "shrine": "#a5842f", "shelf": "#6b7a7a"}
SHELL = [("玄關", 1125, 0, 175, 100), ("樓梯", 858, 0, 267, 100), ("廁所", 137, 106, 140, 269)]


def plan_path(pid): return os.path.join(PLANS, pid + ".json")


def valid_id(pid): return bool(re.fullmatch(r"[a-f0-9]{6,32}", pid or ""))


def atomic_write(path, obj):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)


def read_plan(pid):
    p = plan_path(pid)
    if not os.path.exists(p):
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def write_backup(pid, rec):
    d = os.path.join(BACKUPS, pid)
    os.makedirs(d, exist_ok=True)
    atomic_write(os.path.join(d, "%d.json" % rec["rev"]), rec)
    # 只保留最近 KEEP_BACKUPS 份
    revs = sorted((int(f[:-5]) for f in os.listdir(d) if f.endswith(".json")), reverse=True)
    for r in revs[KEEP_BACKUPS:]:
        try:
            os.remove(os.path.join(d, "%d.json" % r))
        except OSError:
            pass


def list_plans():
    out = []
    for f in os.listdir(PLANS):
        if not f.endswith(".json"):
            continue
        try:
            with open(os.path.join(PLANS, f), encoding="utf-8") as fh:
                d = json.load(fh)
            out.append({"id": d["id"], "name": d.get("name", "未命名"),
                        "rev": d.get("rev", 0), "updatedAt": d.get("ts", 0)})
        except Exception:
            pass
    out.sort(key=lambda x: x.get("updatedAt", 0), reverse=True)
    return out


def thumb_svg(plan):
    items = (plan or {}).get("items", [])
    W, H = 260, int(260 * PLAN_H / PLAN_W)
    sx, sy = W / PLAN_W, H / PLAN_H
    g = ['<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">' % (W, H, W, H)]
    g.append('<rect width="%d" height="%d" fill="#ffffff"/>' % (W, H))
    for _n, x, y, w, d in SHELL:
        g.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#e9ecec" stroke="#c6d0ce" stroke-width="0.6"/>'
                 % (x * sx, y * sy, w * sx, d * sy))
    for it in items:
        if it.get("hidden"):
            continue
        x, y = it.get("x", 0) * sx, it.get("y", 0) * sy
        w, h = it.get("w", 0) * sx, it.get("d", 0) * sy
        if it.get("door") or it.get("win"):
            g.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="#7a5fb0" stroke-width="0.8"/>' % (x, y, w, h))
        elif it.get("wall"):
            g.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="#2b3236"/>' % (x, y, w, h))
        else:
            c = it.get("c", "shelf")
            g.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="%s" stroke="%s" stroke-width="0.6"/>'
                     % (x, y, w, h, CAT_FILL.get(c, "#dee4e4"), CAT_STROKE.get(c, "#6b7a7a")))
    g.append('<rect x="0.5" y="0.5" width="%.1f" height="%.1f" fill="none" stroke="#2b3236" stroke-width="1"/>' % (W - 1, H - 1))
    g.append('</svg>')
    return "".join(g)


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        if n <= 0 or n > 8_000_000:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/" or path == "/index.html":
            try:
                with open(APP_HTML, "rb") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            except OSError:
                self._send(500, "app.html missing", "text/plain; charset=utf-8")
            return
        if path == "/api/plans":
            self._send(200, list_plans())
            return
        m = re.fullmatch(r"/api/plans/([a-f0-9]+)(/history|/thumb\.svg)?", path)
        if m:
            pid, sub = m.group(1), m.group(2)
            if not valid_id(pid):
                return self._send(404, {"error": "bad id"})
            d = read_plan(pid)
            if d is None:
                return self._send(404, {"error": "not found"})
            if sub == "/thumb.svg":
                return self._send(200, thumb_svg(d.get("plan")), "image/svg+xml; charset=utf-8")
            if sub == "/history":
                bd = os.path.join(BACKUPS, pid)
                hs = []
                if os.path.isdir(bd):
                    for f in os.listdir(bd):
                        if f.endswith(".json"):
                            try:
                                with open(os.path.join(bd, f), encoding="utf-8") as fh:
                                    r = json.load(fh)
                                hs.append({"rev": r["rev"], "ts": r.get("ts", 0)})
                            except Exception:
                                pass
                hs.sort(key=lambda x: x["rev"], reverse=True)
                return self._send(200, hs)
            return self._send(200, {"id": d["id"], "name": d.get("name"), "plan": d.get("plan"),
                                    "rev": d.get("rev", 0), "updatedAt": d.get("ts", 0)})
        self._send(404, {"error": "not found"})

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        body = self._body()
        if path == "/api/plans":
            name = (body.get("name") or "新方案").strip()[:80]
            plan = body.get("plan") or {"items": [], "measures": []}
            pid = secrets.token_hex(8)
            ts = int(time.time())
            rec = {"id": pid, "name": name, "rev": 1, "ts": ts, "plan": plan}
            with LOCK:
                atomic_write(plan_path(pid), rec)
                write_backup(pid, {"rev": 1, "ts": ts, "plan": plan})
            return self._send(200, {"id": pid, "rev": 1})
        m = re.fullmatch(r"/api/plans/([a-f0-9]+)/restore", path)
        if m:
            pid = m.group(1)
            if not valid_id(pid):
                return self._send(404, {"error": "bad id"})
            want = body.get("rev")
            with LOCK:
                d = read_plan(pid)
                if d is None:
                    return self._send(404, {"error": "not found"})
                bpath = os.path.join(BACKUPS, pid, "%s.json" % want)
                if not os.path.exists(bpath):
                    return self._send(404, {"error": "no such version"})
                with open(bpath, encoding="utf-8") as fh:
                    bak = json.load(fh)
                ts = int(time.time())
                newrev = d.get("rev", 0) + 1
                rec = {"id": pid, "name": d.get("name"), "rev": newrev, "ts": ts, "plan": bak.get("plan")}
                atomic_write(plan_path(pid), rec)
                write_backup(pid, {"rev": newrev, "ts": ts, "plan": bak.get("plan")})
            return self._send(200, {"ok": True, "rev": newrev})
        self._send(404, {"error": "not found"})

    def do_PUT(self):
        path = self.path.split("?", 1)[0]
        m = re.fullmatch(r"/api/plans/([a-f0-9]+)", path)
        if not m:
            return self._send(404, {"error": "not found"})
        pid = m.group(1)
        if not valid_id(pid):
            return self._send(404, {"error": "bad id"})
        body = self._body()
        with LOCK:
            d = read_plan(pid)
            if d is None:
                return self._send(404, {"error": "not found"})
            cur = d.get("rev", 0)
            base = body.get("baseRev", -1)
            if base != cur:
                # 樂觀鎖衝突：回傳目前伺服器版本，前端載入最新
                return self._send(409, {"ok": False, "rev": cur, "plan": d.get("plan")})
            plan = body.get("plan") or {"items": [], "measures": []}
            ts = int(time.time())
            newrev = cur + 1
            rec = {"id": pid, "name": d.get("name"), "rev": newrev, "ts": ts, "plan": plan}
            atomic_write(plan_path(pid), rec)
            write_backup(pid, {"rev": newrev, "ts": ts, "plan": plan})
        return self._send(200, {"ok": True, "rev": newrev})

    def do_PATCH(self):
        path = self.path.split("?", 1)[0]
        m = re.fullmatch(r"/api/plans/([a-f0-9]+)", path)
        if not m:
            return self._send(404, {"error": "not found"})
        pid = m.group(1)
        if not valid_id(pid):
            return self._send(404, {"error": "bad id"})
        body = self._body()
        with LOCK:
            d = read_plan(pid)
            if d is None:
                return self._send(404, {"error": "not found"})
            name = (body.get("name") or d.get("name") or "未命名").strip()[:80]
            d["name"] = name
            d["ts"] = int(time.time())
            atomic_write(plan_path(pid), d)
        return self._send(200, {"ok": True})

    def do_DELETE(self):
        path = self.path.split("?", 1)[0]
        m = re.fullmatch(r"/api/plans/([a-f0-9]+)", path)
        if not m:
            return self._send(404, {"error": "not found"})
        pid = m.group(1)
        if not valid_id(pid):
            return self._send(404, {"error": "bad id"})
        with LOCK:
            p = plan_path(pid)
            if not os.path.exists(p):
                return self._send(404, {"error": "not found"})
            # 搬進 trash 而非硬刪
            dst = os.path.join(TRASH, "%s-%d.json" % (pid, int(time.time())))
            os.replace(p, dst)
        return self._send(200, {"ok": True})


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), H)
    print("drink-shop-planner server on 127.0.0.1:%d" % PORT)
    srv.serve_forever()
