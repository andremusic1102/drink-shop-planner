// src/floors.js：樓層過濾與投影的純函式。
import { test } from "node:test";
import assert from "node:assert/strict";

import { cur, elementsOn, projection, draggableSet, FLOORS, isParked, PROJECTED_KINDS, cloneTo, moveTo, copyFloor, cloneMany, moveMany, COPYABLE_KINDS, onWalkway } from "../src/floors.js";

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

// ---- 複製整層／多選 ----------------------------------------------------------
const HOUSE = [
  { id: "entry-1", kind: "entry", floor: 1, x: 1125, y: 0, w: 175, d: 100 },
  { id: "beam-2-1", kind: "beam", floor: 2, x: 195, y: 0, w: 42, d: 375 },
  { id: "stairs-2", kind: "stairs", floor: 2, x: 650, y: 0, w: 442, d: 82 },
  { id: "bath-2", kind: "bath", floor: 2, name: "廁所", x: 338, y: 91, w: 130, d: 284 },
  { id: "partition-2", kind: "partition", floor: 2, x: 325, y: 89, w: 13, d: 286 },
  { id: "walkway-2", kind: "walkway", floor: 2, name: "走道", x: 582, y: 0, w: 80, d: 82 },
  { id: "beam-4-1", kind: "beam", floor: 4, x: 195, y: 0, w: 42, d: 375 },
  { id: "stairs-4", kind: "stairs", floor: 4, x: 650, y: 0, w: 442, d: 82 },
  { id: "partition-4", kind: "partition", floor: 4, x: 114, y: 82, w: 13, d: 293 },
];
const FURN = [
  { id: 1, n: "冰箱", c: "cold", x: 878, y: 108, w: 75, d: 78 },                 // 1F
  { id: 2, n: "床", c: "shelf", floor: 2, x: 32, y: 186, w: 162, d: 189 },
  { id: 3, n: "門", c: "seal", floor: 2, door: true, x: 234, y: 0, w: 101, d: 101, rot: 0, flip: false },
  { id: 4, n: "衣櫃", c: "shelf", floor: 4, x: 127, y: 238, w: 49, d: 137 },
  { id: 5, n: "床頭櫃", c: "shelf", floor: 4, x: 250, y: 92, w: 98, d: 46 },
];
const idGen = (start) => { let n = start; return () => n++; };
const elGen = () => { let n = 0; return (kind) => kind + "-new" + (++n); };

test("複製整層：目標層清空後只剩來源的設備與廁所隔層，梁樓梯玄關不動", () => {
  const r = copyFloor(FURN, HOUSE, 2, 4, idGen(100), elGen());
  const on4 = cur(r.items, 4);
  assert.deepEqual(on4.map((i) => [i.id, i.n, i.x, i.y]), [[100, "床", 32, 186], [101, "門", 234, 0]], "4F 原本的衣櫃／床頭櫃清掉、只剩 2F 複製來的（位置不變、新 id）");
  assert.equal(on4[1].door, true, "門的欄位照抄");
  const els4 = elementsOn(r.elements, 4);
  assert.deepEqual(els4.map((e) => [e.id, e.kind]), [["beam-4-1", "beam"], ["stairs-4", "stairs"], ["bath-new1", "bath"], ["partition-new2", "partition"], ["walkway-new3", "walkway"]], "4F 的梁樓梯留著、舊隔層清掉、來源的廁所／隔層／走道複製過來");
  assert.deepEqual(els4.find((e) => e.kind === "bath").x, 338);
  assert.deepEqual(els4.find((e) => e.kind === "walkway").x, 582, "走道位置不變");
  assert.ok(r.elements.some((e) => e.id === "entry-1"), "玄關不動");
  assert.deepEqual(COPYABLE_KINDS, ["bath", "partition", "walkway"]);
});

test("複製整層：來源層原樣不動、新 id 不重複", () => {
  const r = copyFloor(FURN, HOUSE, 2, 4, idGen(100), elGen());
  assert.deepEqual(cur(r.items, 2), cur(FURN, 2), "2F 設備原樣");
  assert.deepEqual(elementsOn(r.elements, 2), elementsOn(HOUSE, 2), "2F 結構原樣");
  assert.deepEqual(cur(r.items, 1), cur(FURN, 1), "別層不動");
  assert.equal(new Set(r.items.map((i) => i.id)).size, r.items.length, "設備 id 不重複");
  assert.equal(new Set(r.elements.map((e) => e.id)).size, r.elements.length, "結構 id 不重複");
  assert.equal(FURN.length, 5, "不動原陣列");
  assert.equal(HOUSE.length, 9);
});

test("onWalkway：設備壓到同層走道回那塊、貼齊不算、別層／門／隱藏／暫放不算", () => {
  const wk = HOUSE.find((e) => e.id === "walkway-2");   // 2F x 582–662 × y 0–82
  assert.equal(onWalkway({ id: 9, floor: 2, x: 600, y: 40, w: 50, d: 50 }, HOUSE), wk, "壓到");
  assert.equal(onWalkway({ id: 9, floor: 2, x: 662, y: 0, w: 50, d: 50 }, HOUSE), null, "右邊剛好貼齊不算");
  assert.equal(onWalkway({ id: 9, floor: 2, x: 600, y: 82, w: 50, d: 50 }, HOUSE), null, "下緣貼齊不算");
  assert.equal(onWalkway({ id: 9, floor: 3, x: 600, y: 40, w: 50, d: 50 }, HOUSE), null, "別層不算");
  assert.equal(onWalkway({ id: 9, floor: 2, door: true, x: 600, y: 40, w: 50, d: 50 }, HOUSE), null, "門不算");
  assert.equal(onWalkway({ id: 9, floor: 2, hidden: true, x: 600, y: 40, w: 50, d: 50 }, HOUSE), null, "隱藏不算");
  assert.equal(onWalkway({ id: 9, floor: 2, x: -100, y: -100, w: 50, d: 50 }, HOUSE), null, "暫放不算");
  assert.equal(onWalkway({ id: 9, floor: 2, x: 600, y: 40, w: 50, d: 50 }, [{ ...wk, kind: "bath" }]), null, "同位置但不是走道不算");
  assert.equal(onWalkway(null, HOUSE), null);
});

test("複製整層：from 等於 to 不動", () => {
  assert.deepEqual(copyFloor(FURN, HOUSE, 2, 2, idGen(100), elGen()), { items: FURN, elements: HOUSE });
  assert.deepEqual(copyFloor(FURN, HOUSE, 2, 7, idGen(100), elGen()), { items: FURN, elements: HOUSE }, "樓層不合法也不動");
  assert.deepEqual(copyFloor(null, null, 1, 2, idGen(1), elGen()), { items: [], elements: [] });
});

test("多選複製：同層各偏移 30、跨層同位置", () => {
  const same = cloneMany(FURN, [5, 4], 4, idGen(200));
  assert.deepEqual(same.map((i) => [i.id, i.n, i.x, i.y]), [[200, "衣櫃", 157, 238], [201, "床頭櫃", 280, 122]], "順序照 items 原本、各偏移 30（衣櫃 y 貼對面牆，夾回 238）");
  const cross = cloneMany(FURN, [4, 5], 3, idGen(300));
  assert.deepEqual(cross.map((i) => [i.id, i.floor, i.x, i.y]), [[300, 3, 127, 238], [301, 3, 250, 92]]);
  assert.deepEqual(cloneMany(FURN, [], 3, idGen(1)), []);
  assert.deepEqual(cloneMany(FURN, [999], 3, idGen(1)), [], "不存在的 id 略過");
});

test("多選搬層：只改 floor", () => {
  const r = moveMany(FURN, [4, 5], 2);
  assert.deepEqual(r.map((i) => [i.id, i.floor || 1]), [[1, 1], [2, 2], [3, 2], [4, 2], [5, 2]]);
  assert.deepEqual(r.find((i) => i.id === 4), { ...FURN[3], floor: 2 }, "座標與其他欄位不變");
  assert.equal(r[0], FURN[0], "沒被選的是同一個物件");
  assert.equal(FURN[3].floor, 4, "不動原物件");
});
