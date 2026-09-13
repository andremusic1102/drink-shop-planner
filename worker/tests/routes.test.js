// worker/src/index.js 的路由測試：直接呼叫 export default 的 fetch handler，
// env.DB 與 env.ASSETS 用假物件。cloudflare:email 只在 runDigest 裡動態 import，
// 所以在 Node 裡載入模組不會碰到它。
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

// 最小的 D1 假物件：記下每一句 SQL，回固定結果。
function fakeDb(rows = []) {
  const calls = [];
  const stmt = (sql) => ({
    bind: (...args) => { calls.push({ sql, args }); return stmt(sql); },
    all: async () => ({ results: rows }),
    first: async () => rows[0] ?? null,
    run: async () => ({ meta: { changes: 1 } }),
  });
  return { calls, prepare: (sql) => { calls.push({ sql, args: [] }); return stmt(sql); } };
}

function env(rows) {
  return {
    DB: fakeDb(rows),
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
