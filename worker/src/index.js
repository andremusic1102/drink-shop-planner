/**
 * drink-shop-planner —— Cloudflare Workers 版後端。
 *
 * 從 server.py（271 行 Python，跑在 Mac mini 上）移植過來，API 契約完全一致，
 * 前端 app.html 一行都不用改。
 *
 * ## 樂觀鎖怎麼換掉 threading.Lock
 *
 * server.py 用一把全域 threading.Lock 把「讀 rev → 比對 baseRev → 寫入」框成
 * 臨界區。Workers 沒有跨請求的鎖，也不該有 —— 它可能同時在多個節點執行。
 *
 * 改用 D1 的條件式 UPDATE：
 *
 *     UPDATE plans SET rev = rev + 1, ... WHERE id = ? AND rev = ?
 *
 * SQLite 保證單一 statement 的原子性，所以 WHERE 子句本身就是 compare-and-swap。
 * `meta.changes === 0` 表示 rev 已經被別人改掉了 —— 這就是衝突，回 409 帶上目前
 * 版本讓前端重載。**比原本的鎖更正確**：原版在多行程部署下會失效，這版不會。
 *
 * 垃圾桶改成 deleted_at 軟刪除，不再搬檔案。
 */

const KEEP_REVISIONS = 50;
const PLAN_W = 1300;
const PLAN_H = 375;

const CAT_FILL = {
  counter: "#d3e3de", cold: "#cfe0e8", water: "#cfe6e2", heat: "#f0dcc6",
  seal: "#e4ddf1", shrine: "#eee0c2", shelf: "#dee4e4",
};
const CAT_STROKE = {
  counter: "#2f6f63", cold: "#4a86a6", water: "#2f8f8a", heat: "#c47a3a",
  seal: "#7a5fb0", shrine: "#a5842f", shelf: "#6b7a7a",
};
// 固定的樓層結構（玄關 / 樓梯 / 廁所），縮圖用
const SHELL = [
  [1125, 0, 175, 100],
  [858, 0, 267, 100],
  [137, 106, 140, 269],
];

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

const validId = (id) => /^[a-f0-9]{6,32}$/.test(id || "");
const now = () => Math.floor(Date.now() / 1000);

function hexId() {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function readBody(request) {
  try {
    const t = await request.text();
    if (!t || t.length > 8_000_000) return {};
    return JSON.parse(t);
  } catch {
    return {};
  }
}

/** 存一份版本快照，並修剪到只留最近 KEEP_REVISIONS 份。 */
async function writeRevision(db, planId, rev, ts, planText) {
  await db.prepare(
    "INSERT OR REPLACE INTO revisions (plan_id, rev, ts, plan) VALUES (?, ?, ?, ?)"
  ).bind(planId, rev, ts, planText).run();

  await db.prepare(
    `DELETE FROM revisions WHERE plan_id = ?1 AND rev NOT IN
       (SELECT rev FROM revisions WHERE plan_id = ?1 ORDER BY rev DESC LIMIT ?2)`
  ).bind(planId, KEEP_REVISIONS).run();
}

function thumbSvg(plan) {
  const items = (plan && plan.items) || [];
  const W = 260;
  const H = Math.round((260 * PLAN_H) / PLAN_W);
  const sx = W / PLAN_W;
  const sy = H / PLAN_H;
  const n = (v) => (Number(v) || 0).toFixed(1);
  const g = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  ];
  for (const [x, y, w, d] of SHELL) {
    g.push(`<rect x="${n(x * sx)}" y="${n(y * sy)}" width="${n(w * sx)}" height="${n(d * sy)}" fill="#e9ecec" stroke="#c6d0ce" stroke-width="0.6"/>`);
  }
  for (const it of items) {
    if (it.hidden) continue;
    const x = n((it.x || 0) * sx), y = n((it.y || 0) * sy);
    const w = n((it.w || 0) * sx), h = n((it.d || 0) * sy);
    if (it.door || it.win) {
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#7a5fb0" stroke-width="0.8"/>`);
    } else if (it.wall) {
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2b3236"/>`);
    } else {
      const c = it.c || "shelf";
      g.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${CAT_FILL[c] || "#dee4e4"}" stroke="${CAT_STROKE[c] || "#6b7a7a"}" stroke-width="0.6"/>`);
    }
  }
  g.push(`<rect x="0.5" y="0.5" width="${n(W - 1)}" height="${n(H - 1)}" fill="none" stroke="#2b3236" stroke-width="1"/>`);
  g.push("</svg>");
  return g.join("");
}

async function getPlan(db, id) {
  return db.prepare(
    "SELECT id, name, rev, ts, plan FROM plans WHERE id = ? AND deleted_at IS NULL"
  ).bind(id).first();
}

async function handleApi(request, env, url) {
  const db = env.DB;
  const path = url.pathname;
  const method = request.method;

  // GET /api/plans —— 列表
  if (path === "/api/plans" && method === "GET") {
    const { results } = await db.prepare(
      "SELECT id, name, rev, ts AS updatedAt FROM plans WHERE deleted_at IS NULL ORDER BY ts DESC"
    ).all();
    return json(results || []);
  }

  // POST /api/plans —— 新增
  if (path === "/api/plans" && method === "POST") {
    const body = await readBody(request);
    const name = String(body.name || "新方案").trim().slice(0, 80);
    const plan = body.plan || { items: [], measures: [] };
    const planText = JSON.stringify(plan);
    const id = hexId();
    const ts = now();
    await db.prepare(
      "INSERT INTO plans (id, name, rev, ts, plan) VALUES (?, ?, 1, ?, ?)"
    ).bind(id, name, ts, planText).run();
    await writeRevision(db, id, 1, ts, planText);
    return json({ id, rev: 1 });
  }

  const m = path.match(/^\/api\/plans\/([a-f0-9]+)(\/history|\/thumb\.svg|\/restore)?$/);
  if (!m) return json({ error: "not found" }, 404);

  const id = m[1];
  const sub = m[2] || "";
  if (!validId(id)) return json({ error: "bad id" }, 404);

  // GET /api/plans/{id}[/history|/thumb.svg]
  if (method === "GET") {
    const row = await getPlan(db, id);
    if (!row) return json({ error: "not found" }, 404);

    if (sub === "/thumb.svg") {
      let plan = {};
      try { plan = JSON.parse(row.plan); } catch { /* 壞掉就給空縮圖 */ }
      return new Response(thumbSvg(plan), {
        headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (sub === "/history") {
      const { results } = await db.prepare(
        "SELECT rev, ts FROM revisions WHERE plan_id = ? ORDER BY rev DESC"
      ).bind(id).all();
      return json(results || []);
    }
    return json({
      id: row.id,
      name: row.name,
      plan: JSON.parse(row.plan),
      rev: row.rev,
      updatedAt: row.ts,
    });
  }

  // PUT /api/plans/{id} —— 存檔（樂觀鎖）
  if (method === "PUT" && sub === "") {
    const body = await readBody(request);
    const base = body.baseRev ?? -1;
    const plan = body.plan || { items: [], measures: [] };
    const planText = JSON.stringify(plan);
    const ts = now();

    // 這一句就是 compare-and-swap：rev 對不上就 0 rows affected
    const res = await db.prepare(
      `UPDATE plans SET rev = rev + 1, ts = ?, plan = ?
         WHERE id = ? AND rev = ? AND deleted_at IS NULL`
    ).bind(ts, planText, id, base).run();

    if (!res.meta.changes) {
      const row = await getPlan(db, id);
      if (!row) return json({ error: "not found" }, 404);
      // 樂觀鎖衝突：回傳目前伺服器版本，前端載入最新
      return json({ ok: false, rev: row.rev, plan: JSON.parse(row.plan) }, 409);
    }
    const newRev = base + 1;
    await writeRevision(db, id, newRev, ts, planText);
    return json({ ok: true, rev: newRev });
  }

  // PATCH /api/plans/{id} —— 改名
  if (method === "PATCH" && sub === "") {
    const body = await readBody(request);
    const row = await getPlan(db, id);
    if (!row) return json({ error: "not found" }, 404);
    const name = String(body.name || row.name || "未命名").trim().slice(0, 80);
    await db.prepare("UPDATE plans SET name = ?, ts = ? WHERE id = ?")
      .bind(name, now(), id).run();
    return json({ ok: true });
  }

  // DELETE /api/plans/{id} —— 軟刪除
  if (method === "DELETE" && sub === "") {
    const res = await db.prepare(
      "UPDATE plans SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL"
    ).bind(now(), id).run();
    if (!res.meta.changes) return json({ error: "not found" }, 404);
    return json({ ok: true });
  }

  // POST /api/plans/{id}/restore —— 還原成某個版本
  if (method === "POST" && sub === "/restore") {
    const body = await readBody(request);
    const want = body.rev;
    const row = await getPlan(db, id);
    if (!row) return json({ error: "not found" }, 404);
    const bak = await db.prepare(
      "SELECT plan FROM revisions WHERE plan_id = ? AND rev = ?"
    ).bind(id, want).first();
    if (!bak) return json({ error: "no such version" }, 404);

    const ts = now();
    const res = await db.prepare(
      `UPDATE plans SET rev = rev + 1, ts = ?, plan = ?
         WHERE id = ? AND rev = ? AND deleted_at IS NULL`
    ).bind(ts, bak.plan, id, row.rev).run();
    if (!res.meta.changes) {
      const fresh = await getPlan(db, id);
      return json({ ok: false, rev: fresh ? fresh.rev : row.rev }, 409);
    }
    const newRev = row.rev + 1;
    await writeRevision(db, id, newRev, ts, bak.plan);
    return json({ ok: true, rev: newRev });
  }

  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: "server error", detail: String(err) }, 500);
      }
    }
    // 其餘交給靜態資產（app.html）
    return env.ASSETS.fetch(request);
  },
};
