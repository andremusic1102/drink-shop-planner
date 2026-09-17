// src/rules.js 的檢查引擎：座標是假的（2–4F 還沒實測），只驗規則本身。
import { test } from "node:test";
import assert from "node:assert/strict";

import { shrineViolations, intersects, floorOf } from "../src/rules.js";

const shrine = (x, y, extra = {}) => ({ id: 1, n: "神明桌", c: "shrine", w: 67, d: 133, x, y, ...extra });
const beam = (x, y, w, d, extra = {}) => ({ id: 9, n: "梁A", c: "beam", w, d, x, y, ...extra });

// 假的樓上殼：2F 廁所在 x 600–740、3F 廁所在 x 900–1040
const SHELL = {
  1: [{ name: "廁所 1F", x: 137, y: 106, w: 140, d: 269, bath: true }],
  2: [{ name: "廁所 2F", x: 600, y: 100, w: 140, d: 200, bath: true }],
  3: [{ name: "廁所 3F", x: 900, y: 100, w: 140, d: 200, bath: true }],
  4: [],
};

test("空地：沒有梁、不在任何樓上廁所下 → 0 筆", () => {
  assert.deepEqual(shrineViolations([shrine(300, 125)], SHELL), []);
});

test("擺在梁下 → 1 筆 beam，帶梁的名字", () => {
  const v = shrineViolations([shrine(300, 125), beam(0, 150, 1300, 30)], SHELL);
  assert.equal(v.length, 1);
  assert.equal(v[0].kind, "beam");
  assert.equal(v[0].name, "梁A");
  assert.equal(v[0].floor, 1);
});

test("擺在 3F 廁所正下方 → 1 筆 bath floor 3（2F 沒撞）", () => {
  const v = shrineViolations([shrine(920, 125)], SHELL);
  assert.deepEqual(v.map((x) => [x.kind, x.floor]), [["bath", 3]]);
});

test("2F 與 3F 廁所都壓到 → 兩筆，樓層由低到高", () => {
  const wide = { ...shrine(600, 125), w: 500 };
  const v = shrineViolations([wide], SHELL);
  assert.deepEqual(v.map((x) => x.floor), [2, 3]);
});

test("同層廁所不算（1F 廁所在 1F 神明桌旁邊不投影）", () => {
  assert.deepEqual(shrineViolations([shrine(140, 110)], SHELL), []);
});

test("梁在別的樓層不算：2F 的梁不影響 1F 神明桌", () => {
  const v = shrineViolations([shrine(300, 125), beam(0, 150, 1300, 30, { floor: 2 })], SHELL);
  assert.deepEqual(v, []);
});

test("神明桌在 2F：只投影 3F/4F，1F 梁不算", () => {
  const v = shrineViolations([shrine(920, 125, { floor: 2 }), beam(0, 150, 1300, 30)], SHELL);
  assert.deepEqual(v.map((x) => [x.kind, x.floor]), [["bath", 3]]);
});

test("隱藏的神明桌與隱藏的梁都跳過", () => {
  const v = shrineViolations([shrine(300, 125, { hidden: true }), beam(0, 150, 1300, 30)], SHELL);
  assert.deepEqual(v, []);
  const v2 = shrineViolations([shrine(300, 125), beam(0, 150, 1300, 30, { hidden: true })], SHELL);
  assert.deepEqual(v2, []);
});

test("邊剛好貼齊不算撞（半開區間）", () => {
  assert.equal(intersects({ x: 0, y: 0, w: 10, d: 10 }, { x: 10, y: 0, w: 10, d: 10 }), false);
  assert.equal(intersects({ x: 0, y: 0, w: 10, d: 10 }, { x: 9, y: 0, w: 10, d: 10 }), true);
});

test("floor 缺＝1，字串 '2' 也當數字", () => {
  assert.equal(floorOf({}), 1);
  assert.equal(floorOf({ floor: "2" }), 2);
});

test("items 不是陣列或空 → 0 筆，不炸", () => {
  assert.deepEqual(shrineViolations(null, SHELL), []);
  assert.deepEqual(shrineViolations([], SHELL), []);
});
