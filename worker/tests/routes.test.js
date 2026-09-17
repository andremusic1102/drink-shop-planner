// worker/src/index.js 的路由測試：直接呼叫 export default 的 fetch handler，
// env.DB 與 env.ASSETS 用假物件。cloudflare:email 只在 runDigest 裡動態 import，
// 所以在 Node 裡載入模組不會碰到它。
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

// 最小的 D1 假物件：記下每一句 SQL，回固定結果。
// changes 模擬條件式 UPDATE／INSERT OR IGNORE 改到幾列（0 = 樂觀鎖衝突）。
function fakeDb(rows = [], { changes = 1 } = {}) {
  const calls = [];
  const stmt = (sql) => ({
    bind: (...args) => { calls.push({ sql, args }); return stmt(sql); },
    all: async () => ({ results: rows }),
    first: async () => rows[0] ?? null,
    run: async () => ({ meta: { changes } }),
  });
  return { calls, prepare: (sql) => { calls.push({ sql, args: [] }); return stmt(sql); } };
}

function env(rows, opts) {
  return {
    DB: fakeDb(rows, opts),
    ASSETS: { fetch: async () => new Response("<html>app</html>", { status: 200, headers: { "content-type": "text/html" } }) },
  };
}

const req = (path, init) => new Request("https://drinkshop.andremusic.dev" + path, init);

test("GET /api/plans is a known route: 200 with a JSON list", async () => {
  const e = env([{ id: "ab12", name: "一號店", rev: 3, updatedAt: 1 }]);
  const res = await worker.fetch(req("/api/plans"), e, {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await res.json(), [{ id: "ab12", name: "一號店", rev: 3, updatedAt: 1 }]);
  assert.ok(e.DB.calls.some((c) => /FROM plans/.test(c.sql)), "the list route reads the plans table");
});

test("an unknown /api path is 404, not a crash", async () => {
  const e = env();
  const res = await worker.fetch(req("/api/nope"), e, {});
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not found" });
  assert.equal(e.DB.calls.length, 0, "no SQL is issued for an unknown route");
});

test("a malformed plan id is 404 without touching the database", async () => {
  const e = env();
  const res = await worker.fetch(req("/api/plans/ZZZZ"), e, {});
  assert.equal(res.status, 404);
  assert.equal(e.DB.calls.length, 0);
});

test("non-/api paths fall through to the static assets", async () => {
  const res = await worker.fetch(req("/"), env(), {});
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/html/);
});

// ── 建築結構 /api/structure ──────────────────────────────────────────

const beamRow = (rev) => ({
  id: "structure", name: "建築結構", rev, ts: 100,
  plan: JSON.stringify({ elements: [{ id: "b1", kind: "beam", floor: 1, name: "梁A", x: 0, y: 150, w: 1300, d: 30 }] }),
});
const putStructure = (body) => req("/api/structure", {
  method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

test("GET /api/structure 無列 → 回預設 1F 三個殼", async () => {
  const res = await worker.fetch(req("/api/structure"), env([]), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.rev, 0);
  assert.deepEqual(body.elements.map((e) => [e.kind, e.floor]), [["entry", 1], ["stairs", 1], ["bath", 1]]);
});

test("GET /api/structure 有列 → 回該列的 elements 與 rev", async () => {
  const res = await worker.fetch(req("/api/structure"), env([beamRow(4)]), {});
  const body = await res.json();
  assert.equal(body.rev, 4);
  assert.deepEqual(body.elements.map((e) => e.kind), ["beam"]);
});

test("PUT /api/structure baseRev 舊 → 409", async () => {
  const e = env([beamRow(5)], { changes: 0 });
  const res = await worker.fetch(putStructure({ structure: { elements: [] }, baseRev: 3 }), e, {});
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.rev, 5, "帶回伺服器目前的 rev");
  assert.deepEqual(body.structure.elements.map((x) => x.kind), ["beam"], "帶回目前的結構讓前端重載");
  assert.ok(e.DB.calls.some((c) => /UPDATE plans/.test(c.sql) && c.args.includes(3)), "條件式 UPDATE 用 baseRev 當 CAS");
});

test("PUT /api/structure baseRev 對 → 200、rev +1、寫 revisions", async () => {
  const e = env([beamRow(5)]);
  const res = await worker.fetch(putStructure({ structure: { elements: [{ id: "x", kind: "bath", floor: 2, name: "2F 廁所", x: 1, y: 2, w: 3, d: 4 }] }, baseRev: 5 }), e, {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, rev: 6 });
  assert.ok(e.DB.calls.some((c) => /INTO revisions/.test(c.sql) && c.args[0] === "structure" && c.args[1] === 6));
});

test("PUT /api/structure 第一次（baseRev 0、無列）→ INSERT、rev 1", async () => {
  const e = env([]);
  const res = await worker.fetch(putStructure({ structure: { elements: [] }, baseRev: 0 }), e, {});
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, rev: 1 });
  assert.ok(e.DB.calls.some((c) => /INSERT OR IGNORE INTO plans/.test(c.sql) && c.args[0] === "structure"));
});

test("PUT /api/structure 沒有 elements 陣列 → 400，不碰資料庫", async () => {
  const e = env([]);
  const res = await worker.fetch(putStructure({ baseRev: 0 }), e, {});
  assert.equal(res.status, 400);
  assert.equal(e.DB.calls.length, 0);
});

test("PUT /api/structure elements 裡有 null 或非物件 → 400，不是 500", async () => {
  for (const bad of [[null], ["x"], [[1, 2]], [{ kind: "beam" }, null]]) {
    const e = env([]);
    const res = await worker.fetch(putStructure({ structure: { elements: bad }, baseRev: 0 }), e, {});
    assert.equal(res.status, 400, JSON.stringify(bad));
    assert.equal(e.DB.calls.length, 0);
  }
});

test("GET /api/plans 不含 structure", async () => {
  const e = env([
    { id: "structure", name: "建築結構", rev: 2, updatedAt: 9 },
    { id: "ab12", name: "一號店", rev: 3, updatedAt: 1 },
  ]);
  const res = await worker.fetch(req("/api/plans"), e, {});
  assert.deepEqual((await res.json()).map((r) => r.id), ["ab12"]);
  assert.ok(e.DB.calls.some((c) => /id <> \?/.test(c.sql) && c.args.includes("structure")), "SQL 就先濾掉");
});

test("GET /api/structure/history 走 revisions 表", async () => {
  const e = env([{ rev: 2, ts: 5 }, { rev: 1, ts: 4 }]);
  const res = await worker.fetch(req("/api/structure/history"), e, {});
  assert.deepEqual(await res.json(), [{ rev: 2, ts: 5 }, { rev: 1, ts: 4 }]);
  assert.ok(e.DB.calls.some((c) => /FROM revisions/.test(c.sql) && c.args[0] === "structure"));
});

test("POST /api/structure/restore 沒有那一列 → 404", async () => {
  const res = await worker.fetch(req("/api/structure/restore", { method: "POST", body: JSON.stringify({ rev: 1 }) }), env([]), {});
  assert.equal(res.status, 404);
});

test("/api/plans/structure 走不到方案路由（id 不是 hex）", async () => {
  const e = env([beamRow(1)]);
  const res = await worker.fetch(req("/api/plans/structure"), e, {});
  assert.equal(res.status, 404);
  assert.equal(e.DB.calls.length, 0);
});
