// src/floors.js：樓層過濾與投影的純函式。
import { test } from "node:test";
import assert from "node:assert/strict";

import { cur, elementsOn, projection, draggableSet, FLOORS, isParked, PROJECTED_KINDS, cloneTo, moveTo } from "../src/floors.js";

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

test("投影只含梁與樓梯，不含廁所玄關隔層", () => {
  const els = [...elements,
    { id: "stairs-2", kind: "stairs", floor: 2, name: "樓梯 2F", x: 858, y: 0, w: 267, d: 100 },
    { id: "entry-2", kind: "entry", floor: 2, name: "玄關 2F", x: 1125, y: 0, w: 175, d: 100 },
    { id: "partition-2", kind: "partition", floor: 2, name: "房間隔層", x: 300, y: 0, w: 10, d: 375 },
  ];
  const p = projection(els, items, 1);
  const names = p.filter((x) => x.src === "element").map((x) => x.name);
  assert.deepEqual(names, ["梁 3F", "樓梯 2F"], "梁與樓梯照投（所有其他樓層，不只上一層）");
  assert.ok(!names.includes("廁所 2F") && !names.includes("玄關 2F") && !names.includes("房間隔層"));
  assert.deepEqual(p.filter((x) => x.src === "shrine"), [], "1F 之下沒有樓層，沒有神明桌可投影");
  assert.deepEqual(PROJECTED_KINDS, ["beam", "stairs"]);
});

test("投影：在 2F 含 1F 神明桌、不含 1F 冰箱", () => {
  const p = projection(elements, items, 2);
  const shrines = p.filter((x) => x.src === "shrine");
  assert.deepEqual(shrines.map((x) => [x.name, x.floor]), [["神明桌", 1]]);
  assert.ok(!p.some((x) => x.name === "冰箱"));
  assert.ok(!p.some((x) => x.name === "神明桌B"), "同層的神明桌不是投影，是本層的設備");
  assert.ok(!p.some((x) => x.name === "隱藏神明桌"));
  assert.deepEqual(p.filter((x) => x.src === "element").map((x) => x.name), ["梁 3F"], "廁所不投影，梁照投");
});

test("投影：在 3F 含 1F 與 2F 的神明桌，帶各自樓層", () => {
  const p = projection(elements, items, 3).filter((x) => x.src === "shrine");
  assert.deepEqual(p.map((x) => x.floor), [1, 2]);
});

test("投影每筆帶 ref 指回原物件（前端亮紅框用）", () => {
  const p = projection(elements, items, 1);
  assert.equal(p.find((x) => x.name === "梁 3F").ref, elements[2]);
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

test("結構模式：樓梯不在可拖集合", () => {
  const els = [...elements, { id: "stairs-1", kind: "stairs", floor: 1, name: "樓梯", x: 858, y: 0, w: 267, d: 100 }];
  assert.deepEqual(draggableSet("structure", items, els, 1).map((e) => e.id), ["bath-1"], "廁所可拖、樓梯不可");
  assert.deepEqual(elementsOn(els, 1).map((e) => e.id), ["bath-1", "stairs-1"], "但樓梯還是當層的結構元件（會畫、可選）");
});

test("跨層複製：新 id、floor 改、x/y 不變", () => {
  const bath = { id: "bath-2", kind: "bath", floor: 2, name: "廁所 2F", x: 600, y: 100, w: 140, d: 200 };
  const c = cloneTo(bath, 3, "bath-new");
  assert.deepEqual(c, { ...bath, id: "bath-new", floor: 3 });
  assert.equal(bath.floor, 2, "原物件不動");
  const bed = { id: 3, n: "床", c: "shelf", floor: 2, x: 100, y: 100, w: 150, d: 200, h: 50, rot: 0 };
  assert.deepEqual(cloneTo(bed, 4, 99), { ...bed, id: 99, floor: 4 }, "設備也通用");
  assert.equal(cloneTo({ id: 1, x: 10, y: 10, w: 5, d: 5 }, 2, 2).floor, 2, "floor 缺算 1F，跨到 2F 座標不變");
});

test("同層複製：偏移 30、夾在框內", () => {
  const bed = { id: 3, n: "床", c: "shelf", floor: 2, x: 100, y: 100, w: 150, d: 200 };
  assert.deepEqual(cloneTo(bed, 2, 4), { ...bed, id: 4, x: 130, y: 130 });
  const corner = { id: 5, n: "櫃", c: "shelf", floor: 2, x: 1200, y: 300, w: 100, d: 75 };
  assert.deepEqual(cloneTo(corner, 2, 6), { ...corner, id: 6, x: 1200, y: 300 }, "貼角落：夾回框內");
  assert.deepEqual(cloneTo({ id: 1, x: 10, y: 10, w: 5, d: 5 }, 1, 2), { id: 2, floor: 1, x: 40, y: 40, w: 5, d: 5 }, "floor 缺算 1F，複製到 1F 是同層");
});

test("搬層：只改 floor、id 不變", () => {
  const bath = { id: "bath-2", kind: "bath", floor: 2, name: "廁所 2F", x: 600, y: 100, w: 140, d: 200 };
  assert.deepEqual(moveTo(bath, 4), { ...bath, floor: 4 });
  assert.equal(bath.floor, 2, "原物件不動");
  assert.deepEqual(moveTo({ id: 7, x: 1, y: 2, w: 3, d: 4 }, "3"), { id: 7, x: 1, y: 2, w: 3, d: 4, floor: 3 }, "字串樓層也吃");
});
