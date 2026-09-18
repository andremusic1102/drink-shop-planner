// 樓層與投影的純函式 —— app.html 用 <script type="module"> 匯入，node --test 直接測。
// 原始檔在 src/；`npm run build` 複製到 public/。
//
// 詞彙見 CONTEXT.md：設備（item，屬於某層）、結構元件（element，梁／樓梯／廁所／玄關）、
// 投影（把別層的東西畫到目前樓層上）。四層同框 1300×375、同一座標系。

import { floorOf, intersects, FRAME } from "./rules.js";
export { floorOf };

/**
 * 暫放（CONTEXT.md）：設備被拖到房子的框外。矩形跟 0..1300×0..375 **完全不相交**才算；
 * 壓線（一半在框內）不算、照常檢查。不加欄位——位置就是狀態，拖回框內就恢復。
 * 暫放的不算重疊／間距／神明桌規則、不投影、不匯出、不進縮圖，但仍屬原樓層、仍在清單裡。
 * 門（door）與窗（win）一律不算暫放：它們本來就可以放在框外（外開門），照常匯出與進縮圖。
 */
export function isParked(it) {
  if (!it) return false;
  if (it.door || it.win) return false;
  const r = { x: Number(it.x) || 0, y: Number(it.y) || 0, w: Number(it.w) || 0, d: Number(it.d) || 0 };
  return !intersects(r, FRAME);
}

export const FLOORS = [1, 2, 3, 4];

/** 目前樓層的設備。floor 缺 = 1F，所以舊方案全部落在 1F。 */
export function cur(items, floor) {
  const f = Number(floor) || 1;
  return (Array.isArray(items) ? items : []).filter((it) => floorOf(it) === f);
}

/** 目前樓層的結構元件。 */
export function elementsOn(elements, floor) {
  const f = Number(floor) || 1;
  return (Array.isArray(elements) ? elements : []).filter((e) => floorOf(e) === f);
}

/**
 * 站在 floor 這層時要疊上來的東西（2026-09-17 定案：其他樓層的結構元件＋較低樓層的神明桌）。
 * 每筆 {src:'element'|'shrine', floor, kind, name, x, y, w, d, ref}，ref 指回原物件。
 * 隱藏的神明桌不投影。
 */
export function projection(elements, items, floor) {
  const f = Number(floor) || 1;
  const out = [];
  for (const e of Array.isArray(elements) ? elements : []) {
    const ef = floorOf(e);
    if (ef === f) continue;
    out.push({ src: "element", floor: ef, kind: e.kind, name: e.name || e.kind, x: e.x, y: e.y, w: e.w, d: e.d, ref: e });
  }
  for (const it of Array.isArray(items) ? items : []) {
    if (it.c !== "shrine" || it.hidden || isParked(it)) continue;   // 暫放的神明桌不投影
    const itf = floorOf(it);
    if (itf >= f) continue;
    out.push({ src: "shrine", floor: itf, kind: "shrine", name: it.n || "神明桌", x: it.x, y: it.y, w: it.w, d: it.d, ref: it });
  }
  return out;
}

/**
 * 這一刻能被拖的東西。「編輯結構」開關開著（mode==='structure'）只有當層的結構元件能動，
 * 關著只有當層的設備能動——兩種東西永遠不會同時可拖（2026-09-17 定案：避免排設備時誤碰梁）。
 */
export function draggableSet(mode, items, elements, floor) {
  return mode === "structure" ? elementsOn(elements, floor) : cur(items, floor);
}

/** 結構元件種類的中文名（畫標籤用）。 */
export const KIND_LABEL = { beam: "梁", stairs: "樓梯", bath: "廁所", entry: "玄關", partition: "房間隔層" };
