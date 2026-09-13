"""server.py 的行為測試：真的起一個 ThreadingHTTPServer（127.0.0.1 隨機 port），
state 目錄用 tmp_path，所以不碰 repo 裡的 state/。

守的是 API 契約（worker/src/index.js 移植時宣稱「完全一致」的那份）：
建方案後讀得回同內容、樂觀鎖（baseRev 不等於現況就 409）、備份只留 KEEP_BACKUPS 份。
"""
import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


@pytest.fixture
def api(tmp_path, monkeypatch):
    """起 server，回一個 call(method, path, body) -> (status, json)。"""
    plans, backups, trash = (tmp_path / "plans", tmp_path / "backups", tmp_path / "trash")
    for d in (plans, backups, trash):
        d.mkdir()
    monkeypatch.setattr(server, "PLANS", str(plans))
    monkeypatch.setattr(server, "BACKUPS", str(backups))
    monkeypatch.setattr(server, "TRASH", str(trash))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), server.H)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    base = "http://127.0.0.1:%d" % srv.server_address[1]

    def call(method, path, body=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode("utf-8"))

    call.backups = backups
    call.plans = plans
    yield call
    srv.shutdown()
    srv.server_close()


def test_a_created_plan_reads_back_with_the_same_content(api):
    plan = {"items": [{"x": 1, "y": 2, "w": 30, "d": 40, "c": "cold"}], "measures": []}
    status, created = api("POST", "/api/plans", {"name": "  一號店  ", "plan": plan})
    assert status == 200 and created["rev"] == 1
    pid = created["id"]

    status, got = api("GET", "/api/plans/" + pid)
    assert status == 200
    assert got["plan"] == plan
    assert got["name"] == "一號店"          # 前後空白被 strip
    assert got["rev"] == 1

    status, listing = api("GET", "/api/plans")
    assert status == 200 and [p["id"] for p in listing] == [pid]


def test_b_put_with_a_stale_base_rev_is_refused_with_409_and_the_current_plan(api):
    _, created = api("POST", "/api/plans", {"name": "x", "plan": {"items": [], "measures": []}})
    pid = created["id"]
    newer = {"items": [{"x": 9}], "measures": []}

    status, body = api("PUT", "/api/plans/" + pid, {"baseRev": 1, "plan": newer})
    assert status == 200 and body["rev"] == 2

    # 另一個 client 還拿著 rev 1 —— 必須被擋，並拿到目前的版本好重載
    status, body = api("PUT", "/api/plans/" + pid, {"baseRev": 1, "plan": {"items": [], "measures": []}})
    assert status == 409
    assert body["ok"] is False and body["rev"] == 2 and body["plan"] == newer

    # 被擋的寫入沒有落地
    _, got = api("GET", "/api/plans/" + pid)
    assert got["rev"] == 2 and got["plan"] == newer


def test_c_backups_are_capped_at_keep_backups_and_keep_the_newest(api, monkeypatch):
    monkeypatch.setattr(server, "KEEP_BACKUPS", 3)
    _, created = api("POST", "/api/plans", {"name": "x", "plan": {"items": [], "measures": []}})
    pid = created["id"]
    for rev in range(1, 6):                       # rev 1 → 6，共 6 份備份被寫過
        status, body = api("PUT", "/api/plans/" + pid, {"baseRev": rev, "plan": {"items": [{"n": rev}], "measures": []}})
        assert status == 200 and body["rev"] == rev + 1

    kept = sorted(int(f[:-5]) for f in os.listdir(api.backups / pid) if f.endswith(".json"))
    assert kept == [4, 5, 6]                      # 只留最新 3 份，舊的真的被刪

    status, history = api("GET", "/api/plans/%s/history" % pid)
    assert status == 200 and [h["rev"] for h in history] == [6, 5, 4]


def test_d_unknown_or_malformed_ids_are_404_not_500(api):
    assert api("GET", "/api/plans/zzzz")[0] == 404            # 不合法的 id 形狀
    assert api("GET", "/api/plans/abcdef0123")[0] == 404      # 合法形狀但不存在
    assert api("PUT", "/api/plans/abcdef0123", {"baseRev": 0, "plan": {}})[0] == 404
    assert api("GET", "/nope")[0] == 404
