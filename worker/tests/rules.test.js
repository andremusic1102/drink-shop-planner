// src/rules.js 的檢查引擎：座標是假的（2–4F 還沒實測），只驗規則本身。
import { test } from "node:test";
import assert from "node:assert/strict";

import { shrineViolations, intersects, floorOf, DEFAULT_STRUCTURE } from "../src/rules.js";

const shrine = (x, y, extra = {}) => ({ id: 1, n: "神明桌", c: "shrine", w: 67, d: 133, x, y, ...extra });
const beam = (x, y, w, d, extra = {}) => ({ id: "b1", kind: "beam", floor: 1, name: "梁A", w, d, x, y, ...extra });

// 假的建築結構：1F 廁所在 x 137–277、2F 廁所在 x 600–740、3F 廁所在 x 900–1040
const STRUCT = [
  { id: "bath-1", kind: "bath", floor: 1, name: "廁所 1F", x: 137, y: 106, w: 140, d: 269 },
  { id: "bath-2", kind: "bath", floor: 2, name: "廁所 2F", x: 600, y: 100, w: 140, d: 200 },
  { id: "bath-3", kind: "bath", floor: 3, name: "廁所 3F", x: 900, y: 100, w: 140, d: 200 },
];

test("空地且 rot=0 → 0 筆", () => {
  assert.deepEqual(shrineViolations([shrine(300, 125, { rot: 0 })], STRUCT), []);
  assert.deepEqual(shrineViolations([shrine(300, 125)], STRUCT), []);
});

test("擺在梁下 → 1 筆 beam", () => {
  const v = shrineViolations([shrine(300, 125)], [...STRUCT, beam(0, 150, 1300, 30)]);
  assert.deepEqual(v, [{ rule: "beam", floor: 1, name: "梁A", shrineId: 1, elementId: "b1" }]);
});

test("梁不從方案 items 讀：items 裡的 c:'beam' 不算", () => {
  const legacyBeam = { id: 9, n: "梁A", c: "beam", floor: 1, x: 0, y: 150, w: 1300, d: 30 };
  assert.deepEqual(shrineViolations([shrine(300, 125), legacyBeam], STRUCT), []);
});

test("正上一層廁所下 → 1 筆 bath", () => {
  const v = shrineViolations([shrine(620, 125)], STRUCT);
  assert.deepEqual(v, [{ rule: "bath", floor: 2, name: "廁所 2F", shrineId: 1, elementId: "bath-2" }]);
});

test("隔兩層的廁所不算", () => {
  // 1F 神明桌壓在 3F 廁所投影上，2F 沒有 → 0 筆
  assert.deepEqual(shrineViolations([shrine(920, 125)], STRUCT), []);
  // 同時壓到 2F 與 3F 廁所投影 → 只有 2F 那一筆
  const wide = { ...shrine(600, 125), w: 500 };
  assert.deepEqual(shrineViolations([wide], STRUCT), [{ rule: "bath", floor: 2, name: "廁所 2F", shrineId: 1, elementId: "bath-2" }]);
});

test("同層廁所不算（1F 廁所在 1F 神明桌旁邊不投影）", () => {
  assert.deepEqual(shrineViolations([shrine(140, 110)], STRUCT), []);
});

test("梁在別的樓層不算：2F 的梁不影響 1F 神明桌", () => {
  const v = shrineViolations([shrine(300, 125)], [...STRUCT, beam(0, 150, 1300, 30, { floor: 2 })]);
  assert.deepEqual(v, []);
});

test("神明桌在 2F：只看 3F 廁所，1F 梁與 2F 廁所不算", () => {
  const v = shrineViolations([shrine(920, 125, { floor: 2 })], [...STRUCT, beam(0, 150, 1300, 30)]);
  assert.deepEqual(v, [{ rule: "bath", floor: 3, name: "廁所 3F", shrineId: 1, elementId: "bath-3" }]);
  const v2 = shrineViolations([shrine(620, 125, { floor: 2 })], STRUCT);
  assert.deepEqual(v2, []);
});

test("rot=90 → 1 筆 facing", () => {
  const v = shrineViolations([shrine(300, 125, { rot: 90 })], STRUCT);
  assert.deepEqual(v, [{ rule: "facing", floor: 1, name: "神明桌", shrineId: 1 }]);
});

test("rot=360 與 rot=-360 都算朝 +x → 0 筆；rot=180、270 各 1 筆 facing", () => {
  assert.deepEqual(shrineViolations([shrine(300, 125, { rot: 360 })], STRUCT), []);
  assert.deepEqual(shrineViolations([shrine(300, 125, { rot: -360 })], STRUCT), []);
  assert.deepEqual(shrineViolations([shrine(300, 125, { rot: 180 })], STRUCT).map((x) => x.rule), ["facing"]);
  assert.deepEqual(shrineViolations([shrine(300, 125, { rot: 270 })], STRUCT).map((x) => x.rule), ["facing"]);
});

test("梁下＋正上一層廁所＋rot=90 → 三筆，順序 beam, bath, facing", () => {
  const v = shrineViolations([shrine(620, 125, { rot: 90 })], [...STRUCT, beam(0, 150, 1300, 30)]);
  assert.deepEqual(v.map((x) => x.rule), ["beam", "bath", "facing"]);
});

test("隱藏的神明桌跳過", () => {
  const v = shrineViolations([shrine(620, 125, { hidden: true, rot: 90 })], [...STRUCT, beam(0, 150, 1300, 30)]);
  assert.deepEqual(v, []);
});

test("多張神明桌各算各的，帶各自 shrineId", () => {
  const a = shrine(620, 125, { id: "s1" });
  const b = shrine(300, 125, { id: "s2", rot: 90 });
  const v = shrineViolations([a, b], STRUCT);
  assert.deepEqual(v, [
    { rule: "bath", floor: 2, name: "廁所 2F", shrineId: "s1", elementId: "bath-2" },
    { rule: "facing", floor: 1, name: "神明桌", shrineId: "s2" },
  ]);
});

test("缺第二參數 → 用 DEFAULT_STRUCTURE（1F 三個殼，全在 1F，不會投影到 1F 神明桌）", () => {
  assert.equal(DEFAULT_STRUCTURE.length, 3);
  assert.deepEqual(DEFAULT_STRUCTURE.map((e) => [e.kind, e.floor]), [["entry", 1], ["stairs", 1], ["bath", 1]]);
  assert.deepEqual(shrineViolations([shrine(140, 110)]), []);
});

test("邊剛好貼齊不算撞（半開區間）", () => {
  assert.equal(intersects({ x: 0, y: 0, w: 10, d: 10 }, { x: 10, y: 0, w: 10, d: 10 }), false);
  assert.equal(intersects({ x: 0, y: 0, w: 10, d: 10 }, { x: 9, y: 0, w: 10, d: 10 }), true);
});

test("floor 缺＝1，字串 '2' 也當數字", () => {
  assert.equal(floorOf({}), 1);
  assert.equal(floorOf({ floor: "2" }), 2);
});

test("items 或 elements 不是陣列或空 → 0 筆，不炸", () => {
  assert.deepEqual(shrineViolations(null, STRUCT), []);
  assert.deepEqual(shrineViolations([], STRUCT), []);
  assert.deepEqual(shrineViolations([shrine(300, 125)], null), []);
  assert.deepEqual(shrineViolations([shrine(300, 125)], {}), []);
});

test("暫放的神明桌不算違規", () => {
  // 同一根梁：框內的神明桌撞梁；整個拖到框外（暫放）就不算，rot 也不看
  const beamAll = beam(0, 0, 1300, 375);
  assert.equal(shrineViolations([shrine(300, 125, { rot: 90 })], [...STRUCT, beamAll]).length, 2, "框內：beam＋facing");
  assert.deepEqual(shrineViolations([shrine(1400, 125, { rot: 90 })], [...STRUCT, beamAll]), [], "完全在門口側外");
  assert.deepEqual(shrineViolations([shrine(300, 400, { rot: 90 })], [...STRUCT, beamAll]), [], "完全在對面牆外");
  assert.equal(shrineViolations([shrine(1280, 125)], [...STRUCT, beamAll]).length, 1, "壓線的照常算");
});
