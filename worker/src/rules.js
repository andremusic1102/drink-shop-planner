// 神明桌的擺放限制 —— 前端與 worker 共用。
// 原始檔在 src/；`npm run build` 複製到 public/（public/ 是 gitignore 的產生物）。
//
// 兩條規則，都只看平面投影（同一個座標系、原點在 CAD 左上、單位 cm）：
//   1. 不能在梁下：與任何 c:'beam' 的 item 矩形相交。
//      梁掛在「它所屬樓層」的天花板，所以 1F 的梁 floor=1。
//   2. 不能在廁所下方：與任何比自己高的樓層的 bath 殼矩形相交（2F–4F 全查，
//      2026-09-17 Andre 定案）。
//
// floor 缺 = 1，舊方案不用改。

export const PLAN_W = 1300;
export const PLAN_H = 375;

// 固定的樓層結構。1F 是 CAD 實測；2–4F 目前是空的 —— 沒有圖，等實測後填。
// bath:true 的殼會被規則 2 拿去投影。
export const SHELL = {
  1: [
    { name: "玄關 175×100", x: 1125, y: 0, w: 175, d: 100 },
    { name: "樓梯 267×100", x: 858, y: 0, w: 267, d: 100, stairs: true },
    { name: "廁所 140×269", x: 137, y: 106, w: 140, d: 269, bath: true },
  ],
  2: [],
  3: [],
  4: [],
};

export function floorOf(o) {
  return o && o.floor != null ? Number(o.floor) : 1;
}

// 半開區間相交：邊剛好貼齊不算撞（跟 index.html 的 overlaps 同一種算法）
export function intersects(a, b) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.d <= b.y || b.y + b.d <= a.y);
}

// 回傳撞到的清單，每筆 {kind:'beam'|'bath', floor, name, rect}。
// 空陣列 = 合格。多張神明桌就每張各算，結果帶 shrineId。
export function shrineViolations(items, shell = SHELL) {
  const out = [];
  const list = Array.isArray(items) ? items : [];
  for (const s of list) {
    if (s.c !== "shrine" || s.hidden) continue;
    const sf = floorOf(s);
    for (const b of list) {
      if (b.c !== "beam" || b.hidden || floorOf(b) !== sf) continue;
      if (intersects(s, b)) out.push({ kind: "beam", floor: sf, name: b.n || "梁", rect: b, shrineId: s.id });
    }
    for (const f of Object.keys(shell).map(Number).filter((f) => f > sf).sort()) {
      for (const sh of shell[f] || []) {
        if (!sh.bath) continue;
        if (intersects(s, sh)) out.push({ kind: "bath", floor: f, name: sh.name || "廁所", rect: sh, shrineId: s.id });
      }
    }
  }
  return out;
}
