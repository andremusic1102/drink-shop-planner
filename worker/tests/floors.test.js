// src/floors.js：樓層過濾與投影的純函式。
import { test } from "node:test";
import assert from "node:assert/strict";

import { cur, elementsOn, projection, draggableSet, FLOORS, isParked } from "../src/floors.js";

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

test("結構模式開著：可拖集合只含結構元件", () => {
  const d = draggableSet("structure", items, elements, 1);
  assert.deepEqual(d.map((e) => e.id), ["bath-1"]);
  assert.ok(!d.some((e) => e.c), "沒有任何設備混進來");
});

test("結構模式關著：可拖集合只含設備", () => {
  const d = draggableSet("items", items, elements, 1);
  assert.deepEqual(d.map((i) => i.id), [1, 2, 5]);
  assert.ok(!d.some((e) => e.kind), "沒有任何結構元件混進來");
  assert.deepEqual(draggableSet(undefined, items, elements, 2).map((i) => i.id), [3, 4], "mode 缺＝設備模式");
});

test("FLOORS 是 1–4", () => {
  assert.deepEqual(FLOORS, [1, 2, 3, 4]);
});

test("isParked：完全在框外才算，壓線不算", () => {
  const box = (x, y, w = 60, d = 40) => ({ x, y, w, d });
  assert.equal(isParked(box(1300, 100)), true, "貼著門口側外緣、完全在外");
  assert.equal(isParked(box(-60, 100)), true, "後牆外");
  assert.equal(isParked(box(100, 375)), true, "對面牆外");
  assert.equal(isParked(box(100, -40)), true, "樓梯側外");
  assert.equal(isParked(box(1500, 500)), true, "四層並排時面板空隙的位置也算暫放");
  assert.equal(isParked(box(1270, 100)), false, "壓線：一半在框內，照常檢查");
  assert.equal(isParked(box(-30, 100)), false, "壓後牆線");
  assert.equal(isParked(box(100, 100)), false, "框內");
  assert.equal(isParked(box(1240, 335)), false, "剛好貼著框內角落");
  assert.equal(isParked(null), false);
  // 投影：暫放的神明桌不投到別層
  const parkedShrine = { id: 9, c: "shrine", floor: 1, x: 1400, y: 0, w: 67, d: 133 };
  assert.deepEqual(projection([], [parkedShrine], 2), []);
});

test("門窗在框外不算暫放", () => {
  assert.equal(isParked({ door: true, x: 1400, y: 100, w: 90, d: 90 }), false, "框外的門是外開門，不是暫放");
  assert.equal(isParked({ win: true, x: -100, y: 0, w: 120, d: 16 }), false, "壓後牆線的窗不是暫放");
  assert.equal(isParked({ win: true, x: -200, y: 0, w: 120, d: 16 }), false, "完全在框外的窗也不是暫放");
  assert.equal(isParked({ x: 1400, y: 100, w: 90, d: 90 }), true, "同座標的一般設備才算暫放");
  assert.equal(isParked({ x: -200, y: 0, w: 120, d: 16 }), true, "同座標的一般設備才算暫放");
});
