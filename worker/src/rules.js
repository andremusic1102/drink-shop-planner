// 神明桌的擺放限制 —— 前端與 worker 共用。
// 原始檔在 src/；`npm run build` 複製到 public/（public/ 是 gitignore 的產生物）。
//
// 三條規則。前兩條只看平面投影（同一個座標系、原點在 CAD 左上、單位 cm）：
//   1. beam   不能在梁下：與同層 kind:'beam' 的結構元件矩形相交。
//             梁掛在「它所屬樓層」的天花板，所以 1F 的梁 floor=1。
//   2. bath   不能在廁所下方：只看「正上一層」（floor === 神明桌 floor + 1）
//             的 kind:'bath' 結構元件；隔兩層以上不算。
//   3. facing 正面要朝 +x（圖右、玄關側）：(rot||0) % 360 !== 0 就違規。
//
// 梁／廁所／樓梯／玄關都是「建築結構」，不在方案 items 裡，
// 由第二參數 elements 傳入（GET /api/structure 的 elements 陣列）。
// floor 缺 = 1，舊方案不用改。

export const PLAN_W = 1300;
export const PLAN_H = 375;

// 預設的建築結構：1F 是 CAD 實測；2–4F 目前沒有圖，等實測後在 UI 的結構模式輸入。
// GET /api/structure 讀不到那一列時就回這份。
export const DEFAULT_STRUCTURE = [
  { id: "entry-1", kind: "entry", floor: 1, name: "玄關 175×100", x: 1125, y: 0, w: 175, d: 100 },
  { id: "stairs-1", kind: "stairs", floor: 1, name: "樓梯 267×100", x: 858, y: 0, w: 267, d: 100 },
  { id: "bath-1", kind: "bath", floor: 1, name: "廁所 140×269", x: 137, y: 106, w: 140, d: 269 },
];

export function floorOf(o) {
  return o && o.floor != null ? Number(o.floor) : 1;
}

// 半開區間相交：邊剛好貼齊不算撞（跟 index.html 的 overlaps 同一種算法）
export function intersects(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y);
}

// 回傳違規清單，每筆 {rule:'beam'|'bath'|'facing', floor, name, shrineId}。
// 空陣列 = 合格。多張神明桌就每張各算，結果帶 shrineId。
export function shrineViolations(items, elements = DEFAULT_STRUCTURE) {
  const out = [];
  const list = Array.isArray(items) ? items : [];
  const els = Array.isArray(elements) ? elements : [];
  for (const s of list) {
    if (s.c !== "shrine" || s.hidden) continue;
    const sf = floorOf(s);
    for (const e of els) {
      if (e.kind === "beam" && floorOf(e) === sf && intersects(s, e)) {
        out.push({ rule: "beam", floor: sf, name: e.name || "梁", shrineId: s.id });
      }
    }
    for (const e of els) {
      if (e.kind === "bath" && floorOf(e) === sf + 1 && intersects(s, e)) {
        out.push({ rule: "bath", floor: sf + 1, name: e.name || "廁所", shrineId: s.id });
      }
    }
    if ((s.rot || 0) % 360 !== 0) {
      out.push({ rule: "facing", floor: sf, name: s.n || "神明桌", shrineId: s.id });
    }
  }
  return out;
}
