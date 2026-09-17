// src/floors.js：樓層過濾與投影的純函式。
import { test } from "node:test";
import assert from "node:assert/strict";

import { cur, elementsOn, projection, FLOORS } from "../src/floors.js";

const items = [
  { id: 1, n: "冰箱", c: "cold", x: 10, y: 10, w: 60, d: 60 },                 // floor 缺 → 1F
  { id: 2, n: "神明桌", c: "shrine", floor: 1, x: 500, y: 120, w: 67, d: 133 },
  { id: 3, n: "床", c: "shelf", floor: 2, x: 100, y: 100, w: 150, d: 200 },
  { id: 4, n: "神明桌B", c: "shrine", floor: 2, x: 700, y: 100, w: 67, d: 133 },
  { id: 5, n: "隱藏神明桌", c: "shrine", floor: 1, hidden: true, x: 0, y: 0, w: 1, d: 1 },
];
const elements = [
  { id: "bath-1", kind: "bath", floor: 1, name: "廁所 1F", x: 137, y: 106, w: 140, d: 269 },
  { id: "bath-2", kind: "bath", floor: 2, name: "廁所 2F", x: 600, y: 100, w: 140, d: 200 },
  { id: "beam-3", kind: "beam", floor: 3, name: "梁 3F", x: 0, y: 150, w: 1300, d: 30 },
];

test("cur() 只回當層，floor 缺算 1F", () => {
  assert.deepEqual(cur(items, 1).map((i) => i.id), [1, 2, 5]);
  assert.deepEqual(cur(items, 2).map((i) => i.id), [3, 4]);
  assert.deepEqual(cur(items, 3), []);
  assert.deepEqual(cur(items, "2").map((i) => i.id), [3, 4], "字串樓層也吃");
  assert.deepEqual(cur(null, 1), []);
});

test("elementsOn() 只回當層的結構元件", () => {
  assert.deepEqual(elementsOn(elements, 1).map((e) => e.id), ["bath-1"]);
  assert.deepEqual(elementsOn(elements, 4), []);
});

test("投影：在 1F 含 2F 廁所、不含 1F 廁所", () => {
  const p = projection(elements, items, 1);
  const names = p.map((x) => x.name);
  assert.ok(names.includes("廁所 2F"));
  assert.ok(!names.includes("廁所 1F"));
  assert.ok(names.includes("梁 3F"), "所有其他樓層的結構元件都投影，不只上一層");
  assert.deepEqual(p.filter((x) => x.src === "shrine"), [], "1F 之下沒有樓層，沒有神明桌可投影");
});

test("投影：在 2F 含 1F 神明桌、不含 1F 冰箱", () => {
  const p = projection(elements, items, 2);
  const shrines = p.filter((x) => x.src === "shrine");
  assert.deepEqual(shrines.map((x) => [x.name, x.floor]), [["神明桌", 1]]);
  assert.ok(!p.some((x) => x.name === "冰箱"));
  assert.ok(!p.some((x) => x.name === "神明桌B"), "同層的神明桌不是投影，是本層的設備");
  assert.ok(!p.some((x) => x.name === "隱藏神明桌"));
  assert.deepEqual(p.filter((x) => x.src === "element").map((x) => x.name), ["廁所 1F", "梁 3F"]);
});

test("投影：在 3F 含 1F 與 2F 的神明桌，帶各自樓層", () => {
  const p = projection(elements, items, 3).filter((x) => x.src === "shrine");
  assert.deepEqual(p.map((x) => x.floor), [1, 2]);
});

test("投影每筆帶 ref 指回原物件（前端亮紅框用）", () => {
  const p = projection(elements, items, 1);
  assert.equal(p.find((x) => x.name === "廁所 2F").ref, elements[1]);
});

test("FLOORS 是 1–4", () => {
  assert.deepEqual(FLOORS, [1, 2, 3, 4]);
});
