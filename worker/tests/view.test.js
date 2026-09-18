// src/view.js：檢視轉換的純函式。直向 = 順時針 90°（門口側在下、樓梯側在右）。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_W, PLAN_H, normalizeView, panelSize, toScreen, fromScreenDelta, toModelPoint, toScreenPoint, visualRot,
} from "../src/view.js";

const V = { orient: "v", floors: [1, 2, 3, 4] };
const H = { orient: "h", floors: [1] };
const ENTRY = { x: 1125, y: 0, w: 175, d: 100 };   // 玄關：門口側、樓梯側那個角

test("直向：玄關落在面板右下角", () => {
  const s = toScreen(V, ENTRY);
  assert.deepEqual(s, { sx: 275, sy: 1125, sw: 100, sh: 175 });
  assert.equal(s.sx + s.sw, PLAN_H, "貼右緣（樓梯側）");
  assert.equal(s.sy + s.sh, PLAN_W, "貼下緣（門口側）");
  assert.deepEqual(panelSize(V), { w: PLAN_H, h: PLAN_W });
});

test("直向：拖曳 delta 轉回模型後再轉回畫面等於原值", () => {
  const it = { x: 300, y: 50, w: 60, d: 40 };
  const before = toScreen(V, it);
  const { dx, dy } = fromScreenDelta(V, 37, -12);          // 畫面上往右 37、往上 12
  const after = toScreen(V, { ...it, x: it.x + dx, y: it.y + dy });
  assert.equal(after.sx - before.sx, 37);
  assert.equal(after.sy - before.sy, -12);
  assert.deepEqual(fromScreenDelta(V, 0, 0), { dx: 0, dy: 0 });
});

test("直向：點在面板左上角 = 模型 (0, 375)", () => {
  assert.deepEqual(toModelPoint(V, 0, 0), { x: 0, y: PLAN_H });
  assert.deepEqual(toModelPoint(V, PLAN_H, PLAN_W), { x: PLAN_W, y: 0 }, "右下角 = 門口側×樓梯側");
  // toScreenPoint 是反函式
  for (const [x, y] of [[0, 0], [1300, 375], [640, 120]]) {
    const s = toScreenPoint(V, x, y);
    assert.deepEqual(toModelPoint(V, s.sx, s.sy), { x, y });
  }
});

test("橫向：toScreen 是恆等", () => {
  assert.deepEqual(toScreen(H, ENTRY), { sx: 1125, sy: 0, sw: 175, sh: 100 });
  assert.deepEqual(fromScreenDelta(H, 5, -7), { dx: 5, dy: -7 });
  assert.deepEqual(toModelPoint(H, 12, 34), { x: 12, y: 34 });
  assert.deepEqual(panelSize(H), { w: PLAN_W, h: PLAN_H });
  assert.equal(visualRot(H, 90), 90);
});

test("門 rot=0 直向顯示 90", () => {
  assert.equal(visualRot(V, 0), 90);
  assert.equal(visualRot(V, 270), 0, "270+90 繞回 0");
  assert.equal(visualRot(V, undefined), 90, "rot 缺當 0");
});

test("normalizeView：orient 亂值當直向、floors 缺當 [1]", () => {
  assert.deepEqual(normalizeView({ orient: "sideways" }), { orient: "v", floors: [1] });
  assert.deepEqual(normalizeView(null), { orient: "v", floors: [1] });
  assert.deepEqual(normalizeView({ orient: "h", floors: ["2", 3] }), { orient: "h", floors: [2, 3] });
  assert.deepEqual(toScreen({ orient: "nope" }, ENTRY), toScreen(V, ENTRY));
});
