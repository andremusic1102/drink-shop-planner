// worker/src/index.js 的路由測試：直接呼叫 export default 的 fetch handler，
// env.DB 與 env.ASSETS 用假物件。cloudflare:email 只在 runDigest 裡動態 import，
// 所以在 Node 裡載入模組不會碰到它。
import { test } from "node:test";
import assert from "node:assert/strict";

import worker from "../src/index.js";

// 最小的 D1 假物件：記下每一句 SQL，回固定結果。
// changes 模擬條件式 UPDATE／INSERT OR IGNORE 改到幾列（0 = 樂觀鎖衝突）。
// byId：first() 依 bind 的第一個參數挑列（一條路由要讀兩列時用，例如縮圖讀方案＋結構）。
function fakeDb(rows = [], { changes = 1, byId = null } = {}) {
  const calls = [];
  const stmt = (sql, args = []) => ({
    bind: (...a) => { calls.push({ sql, args: a }); return stmt(sql, a); },
    all: async () => ({ results: rows }),
    first: async () => (byId && args[0] in byId) ? byId[args[0]] : (byId ? null : (rows[0] ?? null)),
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

test("PUT /api/structure kind 不在允許集合 → 400", async () => {
  const el = (kind) => ({ id: "x", kind, floor: 1, name: "n", x: 0, y: 0, w: 1, d: 1 });
  const e = env([]);
  const res = await worker.fetch(putStructure({ structure: { elements: [el('x"><script>')] }, baseRev: 0 }), e, {});
  assert.equal(res.status, 400);
  assert.equal(e.DB.calls.length, 0, "壞的 kind 不碰資料庫");

  // 正常的四種之一要能過：走到 INSERT、200
  const ok = env([]);
  const res2 = await worker.fetch(putStructure({ structure: { elements: [el("stairs")] }, baseRev: 0 }), ok, {});
  assert.equal(res2.status, 200);
  assert.ok(ok.DB.calls.some((c) => /INSERT OR IGNORE INTO plans/.test(c.sql) && c.args[0] === "structure"));
});

test("PUT /api/structure kind partition → 200", async () => {
  const el = { id: "partition-1", kind: "partition", floor: 2, name: "房間隔層", x: 300, y: 0, w: 10, d: 375 };
  const ok = env([]);
  const res = await worker.fetch(putStructure({ structure: { elements: [el] }, baseRev: 0 }), ok, {});
  assert.equal(res.status, 200);
  const ins = ok.DB.calls.find((c) => /INSERT OR IGNORE INTO plans/.test(c.sql) && c.args.length);   // prepare 也記一筆（args 空），要 bind 過的那筆
  assert.ok(ins, "走到 INSERT");
  assert.ok(JSON.parse(ins.args[2]).elements.some((e) => e.kind === "partition"), "partition 原樣寫進去");
});

test("PUT /api/structure kind walkway → 200，原樣寫進去", async () => {
  const el = { id: "walkway-2-1", kind: "walkway", floor: 2, name: "走道", x: 582, y: 0, w: 80, d: 82 };
  const ok = env([]);
  const res = await worker.fetch(putStructure({ structure: { elements: [el] }, baseRev: 0 }), ok, {});
  assert.equal(res.status, 200);
  const ins = ok.DB.calls.find((c) => /INSERT OR IGNORE INTO plans/.test(c.sql) && c.args.length);
  assert.ok(ins, "走到 INSERT");
  assert.deepEqual(JSON.parse(ins.args[2]).elements, [el], "walkway 原樣寫進去");
});

test("縮圖畫出 partition", async () => {
  const structure = { id: "structure", name: "建築結構", rev: 3, ts: 1, plan: JSON.stringify({ elements: [
    { id: "partition-1", kind: "partition", floor: 1, name: "房間隔層", x: 640, y: 100, w: 10, d: 275 },
    { id: "partition-2", kind: "partition", floor: 2, name: "房間隔層", x: 100, y: 0, w: 10, d: 375 },
  ] }) };
  const e = env([], { byId: { ab12cd: planRow([]), structure } });
  const res = await worker.fetch(req("/api/plans/ab12cd/thumb.svg"), e, {});
  assert.equal(res.status, 200);
  const svg = await res.text();
  const n = (v) => (v * 260 / 1300).toFixed(1);
  assert.ok(svg.includes(`data-kind="partition" x="${n(640)}"`), "1F 的房間隔層有畫");
  assert.ok(svg.includes('fill="#2f3a3a"'), "深色實心");
  assert.ok(!svg.includes(`x="${n(100)}" y="0.0"`), "2F 的不畫（縮圖只畫 1F）");
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

// ── 縮圖 ──────────────────────────────────────────────────────────────

const planRow = (items) => ({ id: "ab12cd", name: "測試", rev: 1, ts: 1, plan: JSON.stringify({ items, measures: [] }) });

test("縮圖不含 floor=2 的 item", async () => {
  const items = [
    { id: 1, n: "冰箱", c: "cold", x: 10, y: 10, w: 60, d: 60 },
    { id: 2, n: "床", c: "shelf", floor: 2, x: 900, y: 150, w: 150, d: 200 },
  ];
  const e = env([], { byId: { ab12cd: planRow(items) } });
  const res = await worker.fetch(req("/api/plans/ab12cd/thumb.svg"), e, {});
  assert.equal(res.status, 200);
  const svg = await res.text();
  const n = (v) => (v * 260 / 1300).toFixed(1);
  assert.ok(svg.includes(`x="${n(10)}"`), "1F 冰箱有畫");
  assert.ok(!svg.includes(`x="${n(900)}"`), "2F 的床不畫");
  assert.ok(svg.includes('data-kind="bath"'), "沒有 structure 列時用預設 1F 三個殼");
});

test("縮圖不含框外的 item", async () => {
  const items = [
    { id: 1, n: "冰箱", c: "cold", x: 10, y: 10, w: 60, d: 60 },
    { id: 2, n: "暫放的架子", c: "shelf", x: 1400, y: 50, w: 90, d: 45 },   // 完全在門口側外
    { id: 3, n: "壓線的架子", c: "shelf", x: 1270, y: 50, w: 90, d: 45 },   // 一半在框內：照畫
  ];
  const e = env([], { byId: { ab12cd: planRow(items) } });
  const res = await worker.fetch(req("/api/plans/ab12cd/thumb.svg"), e, {});
  assert.equal(res.status, 200);
  const svg = await res.text();
  const n = (v) => (v * 260 / 1300).toFixed(1);
  assert.ok(svg.includes(`x="${n(10)}"`), "框內的有畫");
  assert.ok(!svg.includes(`x="${n(1400)}"`), "暫放的不畫");
  assert.ok(svg.includes(`x="${n(1270)}"`), "壓線的照畫");
});

test("縮圖畫出 structure 列的梁", async () => {
  const structure = { id: "structure", name: "建築結構", rev: 3, ts: 2, plan: JSON.stringify({ elements: [
    { id: "b1", kind: "beam", floor: 1, name: "梁A", x: 0, y: 150, w: 1300, d: 30 },
    { id: "b2", kind: "bath", floor: 2, name: "2F 廁所", x: 600, y: 100, w: 140, d: 200 },
  ] }) };
  const e = env([], { byId: { ab12cd: planRow([]), structure } });
  const res = await worker.fetch(req("/api/plans/ab12cd/thumb.svg"), e, {});
  const svg = await res.text();
  assert.ok(svg.includes('data-kind="beam"') && svg.includes('fill="url(#beam)"'), "梁畫成斜線");
  assert.ok(!svg.includes('data-kind="bath"'), "2F 的廁所不畫、預設殼也不再出現");
  assert.ok(e.DB.calls.some((c) => /FROM plans/.test(c.sql) && c.args[0] === "structure"), "有去讀 structure 列");
});

test("縮圖對 kind／name 做 XML 跳脫，不會跳出屬性", async () => {
  // 模擬 D1 裡已有的舊資料（kind 檢查上線前寫入）：name 帶注入字串、kind 含引號
  const structure = { id: "structure", name: "建築結構", rev: 3, ts: 2, plan: JSON.stringify({ elements: [
    { id: "b1", kind: "beam", floor: 1, name: '梁"><script>alert(1)</script>', x: 0, y: 150, w: 1300, d: 30 },
    { id: "b2", kind: 'bath"><script>alert(2)</script><rect a="', floor: 1, name: "舊廁所", x: 600, y: 100, w: 140, d: 200 },
  ] }) };
  const e = env([], { byId: { ab12cd: planRow([]), structure } });
  const res = await worker.fetch(req("/api/plans/ab12cd/thumb.svg"), e, {});
  assert.equal(res.status, 200);
  const svg = await res.text();
  assert.ok(!svg.includes("<script"), "沒有原樣的 <script");
  assert.ok(svg.includes("&quot;") || svg.includes("&lt;"), "引號／角括號被跳脫成實體");
  // 整串比對屬性值：合法 SVG 本來就有 `"><`（例如 viewBox="…"><defs>），
  // 所以不能用「不含 "><」判，改成直接斷言 data-kind 的值被跳脫成什麼。
  const kinds = [...svg.matchAll(/<rect data-kind="([^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(kinds, [
    "beam",
    "bath&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;&lt;rect a=&quot;",
  ], "兩個 1F 元件都畫了，且 kind 完整留在屬性內");
});

test("/api/plans/structure 走不到方案路由（id 不是 hex）", async () => {
  const e = env([beamRow(1)]);
  const res = await worker.fetch(req("/api/plans/structure"), e, {});
  assert.equal(res.status, 404);
  assert.equal(e.DB.calls.length, 0);
});
