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
// 投影只畫這幾種結構元件（2026-09-17 定案：廁所／玄關／房間隔層疊上來太吵，神明桌規則不靠投影）
export const PROJECTED_KINDS = ["beam", "stairs"];
export function projection(elements, items, floor) {
  const f = Number(floor) || 1;
  const out = [];
  for (const e of Array.isArray(elements) ? elements : []) {
    const ef = floorOf(e);
    if (ef === f || !PROJECTED_KINDS.includes(e.kind)) continue;
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
  // 樓梯固定不動（2026-09-17 定案）：結構模式下也不可拖；面板仍可打數字、可刪、可複製到別層
  return mode === "structure" ? elementsOn(elements, floor).filter((e) => e.kind !== "stairs") : cur(items, floor);
}

/**
 * 複製到某一層（結構元件與設備通用）：新 id、floor 改；同層時偏移 30 cm 並夾在框內，跨層時 x/y 原樣。
 * 其他欄位（name／n／kind／c／w／d／h／rot／door…）照抄。回傳新物件，不動原物件。
 */
export function cloneTo(obj, toFloor, newId) {
  const to = Number(toFloor) || 1;
  const c = JSON.parse(JSON.stringify(obj));
  c.id = newId; c.floor = to;
  if (floorOf(obj) === to) {
    const w = Number(c.w) || 0, d = Number(c.d) || 0;
    c.x = Math.max(0, Math.min(1300 - w, (Number(c.x) || 0) + 30));
    c.y = Math.max(0, Math.min(375 - d, (Number(c.y) || 0) + 30));
  }
  return c;
}

/** 搬到某一層：只改 floor，id 與座標不變。回傳新物件，不動原物件。 */
export function moveTo(obj, toFloor) {
  return { ...obj, floor: Number(toFloor) || 1 };
}

/** 複製整層時會跟著走的結構元件種類：廁所、房間隔層、走道。梁／樓梯每層本來就有、玄關只有 1F，不複製。 */
export const COPYABLE_KINDS = ["bath", "partition", "walkway"];

/**
 * 複製整層（2026-09-18 定案）：先清掉目標層的全部設備與 bath／partition，再把來源層的設備與 bath／partition
 * 複製過去（位置不變、新 id）。回傳 {items, elements} 新陣列；來源層與其他層原樣。
 * from === to 或樓層不在 FLOORS 裡 → 原陣列不動。
 * nextItemId()／nextElId(kind) 由呼叫端提供（前端是 uid++ 與 elId(kind)）。
 */
export function copyFloor(items, elements, from, to, nextItemId, nextElId) {
  const f = Number(from), t = Number(to);
  const its = Array.isArray(items) ? items : [], els = Array.isArray(elements) ? elements : [];
  if (f === t || !FLOORS.includes(f) || !FLOORS.includes(t)) return { items: its, elements: els };
  const keptItems = its.filter((it) => floorOf(it) !== t);
  const keptEls = els.filter((e) => floorOf(e) !== t || !COPYABLE_KINDS.includes(e.kind));
  const newItems = cur(its, f).map((it) => cloneTo(it, t, nextItemId()));
  const newEls = elementsOn(els, f).filter((e) => COPYABLE_KINDS.includes(e.kind)).map((e) => cloneTo(e, t, nextElId(e.kind)));
  return { items: keptItems.concat(newItems), elements: keptEls.concat(newEls) };
}

/** 多選複製：ids 裡的設備各自 cloneTo（同層各偏移 30、跨層同位置），順序照 items 原本的順序。回傳新設備陣列（不含原本的）。 */
export function cloneMany(items, ids, toFloor, nextItemId) {
  const want = new Set(Array.isArray(ids) ? ids : []);
  return (Array.isArray(items) ? items : []).filter((it) => want.has(it.id)).map((it) => cloneTo(it, toFloor, nextItemId()));
}

/** 多選搬層：ids 裡的設備只改 floor，其他原樣。回傳整個新陣列。 */
export function moveMany(items, ids, toFloor) {
  const want = new Set(Array.isArray(ids) ? ids : []);
  return (Array.isArray(items) ? items : []).map((it) => (want.has(it.id) ? moveTo(it, toFloor) : it));
}

/** 結構元件種類的中文名（畫標籤用）。 */
export const KIND_LABEL = { beam: "梁", stairs: "樓梯", bath: "廁所", entry: "玄關", partition: "房間隔層", walkway: "走道" };

/**
 * 走道（2026-09-18 定案）：樓梯前後與梯段下方要留的通道，設備壓到算違規（只警告不擋存，跟重疊同一條紅框）。
 * 門／窗／牆／隱藏／暫放的不算；相交用半開區間（貼齊不算壓到），跟 rules.js 的 intersects 同一種算法。
 * 回傳壓到的走道元件，沒有就 null。
 */
export function onWalkway(it, elements) {
  if (!it || it.door || it.win || it.wall || it.hidden || isParked(it)) return null;
  const r = { x: Number(it.x) || 0, y: Number(it.y) || 0, w: Number(it.w) || 0, d: Number(it.d) || 0 };
  for (const e of elementsOn(elements, floorOf(it))) {
    if (e.kind === "walkway" && intersects(r, e)) return e;
  }
  return null;
}
