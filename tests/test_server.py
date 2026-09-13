"""server.py 的行為測試：不開任何 socket。

用一個假的 socket 物件（讀端是完整的 HTTP 請求位元組、寫端是 BytesIO）直接餵
`server.H`——BaseHTTPRequestHandler 的 __init__ 會 setup→handle→finish，走的是跟真
連線一模一樣的 do_GET／do_POST／do_PUT。這樣 codex 的沙箱（禁止綁定本機 port）也跑得動，
而 state 目錄用 tmp_path，所以不碰 repo 裡的 state/。

守的是 API 契約（worker/src/index.js 移植時宣稱「完全一致」的那份）：
建方案後讀得回同內容、樂觀鎖（baseRev 不等於現況就 409）、備份只留 KEEP_BACKUPS 份。
"""
import io
import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402


class _FakeSocket:
    """BaseHTTPRequestHandler 只用 makefile()（rfile／wfile）——給它記憶體檔就夠。"""

    def __init__(self, raw: bytes):
        self._r = io.BytesIO(raw)
        self.out = io.BytesIO()

    def makefile(self, mode, *args, **kwargs):
        return self._r if "r" in mode else self.out

    def sendall(self, data):
        self.out.write(data)


class _FakeServer:
    server_name = "test"
    server_port = 0


def _request(method: str, path: str, body=None):
    """跑一個請求，回 (status, parsed_json)。"""
    payload = json.dumps(body).encode("utf-8") if body is not None else b""
    head = (f"{method} {path} HTTP/1.0\r\nHost: test\r\nContent-Type: application/json\r\n"
            f"Content-Length: {len(payload)}\r\n\r\n").encode("utf-8")
    sock = _FakeSocket(head + payload)
    server.H(sock, ("127.0.0.1", 0), _FakeServer())      # __init__ 就把整個請求處理完
    raw = sock.out.getvalue()
    status_line, _, rest = raw.partition(b"\r\n")
    status = int(status_line.split(b" ", 2)[1])
    _, _, body_bytes = rest.partition(b"\r\n\r\n")
    return status, json.loads(body_bytes.decode("utf-8"))


@pytest.fixture
def api(tmp_path, monkeypatch):
    plans, backups, trash = (tmp_path / "plans", tmp_path / "backups", tmp_path / "trash")
    for d in (plans, backups, trash):
        d.mkdir()
    monkeypatch.setattr(server, "PLANS", str(plans))
    monkeypatch.setattr(server, "BACKUPS", str(backups))
    monkeypatch.setattr(server, "TRASH", str(trash))
    _request.backups = backups
    _request.plans = plans
    return _request


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
