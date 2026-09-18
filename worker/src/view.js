// 檢視（View）的純函式 —— app.html 用 <script type="module"> 匯入，node --test 直接測。
// 原始檔在 src/；`npm run build` 複製到 public/。
//
// 詞彙見 CONTEXT.md：檢視（同一份方案怎麼擺到畫面上）、面板（畫一個樓層的那一格）。
// 資料完全不動：模型座標永遠是 1300×375、原點左上、玄關在 +x（門口側）、樓梯在 y=0（樓梯側）。
// 直向 'v' = 把模型順時針轉 90°：門口側在下、樓梯側在右，跟原始 CAD 同向；橫向 'h' = 恆等。

export const PLAN_W = 1300;
export const PLAN_H = 375;

/** 檢視物件的正規化：orient 只認 'v'|'h'，其他值當 'v'；floors 缺或空當 [1]。 */
export function normalizeView(view) {
  const orient = view && view.orient === "h" ? "h" : "v";
  const floors = Array.isArray(view && view.floors) && view.floors.length ? view.floors.map(Number) : [1];
  return { orient, floors };
}

export function isVertical(view) {
  return normalizeView(view).orient === "v";
}

/** 一個面板在畫面上的尺寸（模型單位 cm，乘 scale 才是 px）。 */
export function panelSize(view) {
  return isVertical(view) ? { w: PLAN_H, h: PLAN_W } : { w: PLAN_W, h: PLAN_H };
}

/**
 * 模型矩形 {x,y,w,d} → 畫面矩形 {sx,sy,sw,sh}（同樣是 cm，面板左上為原點）。
 * 直向：sx = PLAN_H − y − d, sy = x, sw = d, sh = w。
 */
export function toScreen(view, r) {
  const x = Number(r.x) || 0, y = Number(r.y) || 0, w = Number(r.w) || 0, d = Number(r.d) || 0;
  if (!isVertical(view)) return { sx: x, sy: y, sw: w, sh: d };
  return { sx: PLAN_H - y - d, sy: x, sw: d, sh: w };
}

/** 畫面上的位移 (dsx, dsy) → 模型位移 {dx, dy}。直向：dx = dsy, dy = −dsx。 */
export function fromScreenDelta(view, dsx, dsy) {
  dsx = Number(dsx) || 0; dsy = Number(dsy) || 0;
  if (!isVertical(view)) return { dx: dsx, dy: dsy };
  return { dx: dsy, dy: 0 - dsx || 0 };   // `|| 0` 把 -0 壓成 0，deepEqual 才不會分家
}

/** 畫面上的點 (sx, sy)（面板左上為原點）→ 模型點 {x, y}。直向：x = sy, y = PLAN_H − sx。 */
export function toModelPoint(view, sx, sy) {
  sx = Number(sx) || 0; sy = Number(sy) || 0;
  if (!isVertical(view)) return { x: sx, y: sy };
  return { x: sy, y: PLAN_H - sx };
}

/** 模型點 {x, y} → 畫面點 {sx, sy}。toModelPoint 的反函式。 */
export function toScreenPoint(view, x, y) {
  x = Number(x) || 0; y = Number(y) || 0;
  if (!isVertical(view)) return { sx: x, sy: y };
  return { sx: PLAN_H - y, sy: x };
}

/** 門／窗存檔的 rot → 畫面上要套的角度。存檔的 rot 不變，只有顯示時直向加 90。 */
export function visualRot(view, rot) {
  const r = Number(rot) || 0;
  return isVertical(view) ? (r + 90) % 360 : r % 360;
}
