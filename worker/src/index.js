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

import { DEFAULT_STRUCTURE, floorOf } from "./rules.js";

const KEEP_REVISIONS = 50;

// 建築結構（梁／樓梯／廁所／玄關）全部方案共用一份，存在 plans 表的保留列。
// 它的 id 不是 hex，所以 /api/plans/{id} 那組路由碰不到它；列表也要濾掉。
const STRUCTURE_ID = "structure";
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

// 方案列表的縮圖：只畫 1F（floor 缺＝1）。結構元件從共用的 structure 列來，梁畫斜線。
function thumbSvg(plan, elements = DEFAULT_STRUCTURE) {
  const items = ((plan && plan.items) || []).filter((it) => floorOf(it) === 1);
  const els = (Array.isArray(elements) ? elements : []).filter((e) => floorOf(e) === 1);
  const W = 260;
  const H = Math.round((260 * PLAN_H) / PLAN_W);
  const sx = W / PLAN_W;
  const sy = H / PLAN_H;
  const n = (v) => (Number(v) || 0).toFixed(1);
  const g = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs><pattern id="beam" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="#e9ecec"/><rect width="1.2" height="4" fill="#8a9491"/></pattern></defs>`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  ];
  for (const e of els) {
    const fill = e.kind === "beam" ? "url(#beam)" : "#e9ecec";
    g.push(`<rect data-kind="${e.kind}" x="${n(e.x * sx)}" y="${n(e.y * sy)}" width="${n(e.w * sx)}" height="${n(e.d * sy)}" fill="${fill}" stroke="#c6d0ce" stroke-width="0.6"/>`);
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

  // GET /api/plans —— 列表（不含建築結構那一列）
  if (path === "/api/plans" && method === "GET") {
    const { results } = await db.prepare(
      "SELECT id, name, rev, ts AS updatedAt FROM plans WHERE deleted_at IS NULL AND id <> ? ORDER BY ts DESC"
    ).bind(STRUCTURE_ID).all();
    return json((results || []).filter((r) => r.id !== STRUCTURE_ID));
  }

  if (path === "/api/structure" || path === "/api/structure/history" || path === "/api/structure/restore") {
    return handleStructure(request, db, path, method);
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
      const { elements } = structureOf(await getPlan(db, STRUCTURE_ID));
      return new Response(thumbSvg(plan, elements), {
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

/* ── 建築結構 ──────────────────────────────────────────────────────────
 *
 * 一棟房子只有一份：梁、樓梯、廁所、玄關。存在 plans 表 id='structure' 那列，
 * plan 欄放 {elements:[...]}，所以 rev／409／revisions／restore 全部沿用方案那套。
 * 沒有那一列（還沒人改過結構）時 GET 回 rules.js 的 DEFAULT_STRUCTURE、rev 0；
 * 第一次 PUT 帶 baseRev 0 就 INSERT。
 */
function structureOf(row) {
  if (!row) return { rev: 0, elements: DEFAULT_STRUCTURE, updatedAt: null };
  let elements = [];
  try { elements = JSON.parse(row.plan).elements || []; } catch { /* 壞掉當空 */ }
  return { rev: row.rev, elements, updatedAt: row.ts };
}

function normalizeElements(body) {
  const src = body && body.structure && Array.isArray(body.structure.elements) ? body.structure.elements : null;
  if (!src) return null;
  // 每個元素都得是物件；[null]、["x"] 這種 body 是壞的，回 400 而不是在 e.id 上炸成 500。
  if (!src.every((e) => e && typeof e === "object" && !Array.isArray(e))) return null;
  return src.map((e) => ({
    id: String(e.id || ""),
    kind: String(e.kind || ""),
    floor: Number(e.floor) || 1,
    name: String(e.name || ""),
    x: Number(e.x) || 0, y: Number(e.y) || 0, w: Number(e.w) || 0, d: Number(e.d) || 0,
  }));
}

async function handleStructure(request, db, path, method) {
  const id = STRUCTURE_ID;
  const sub = path.slice("/api/structure".length);

  if (method === "GET" && sub === "") {
    return json(structureOf(await getPlan(db, id)));
  }

  if (method === "GET" && sub === "/history") {
    const { results } = await db.prepare(
      "SELECT rev, ts FROM revisions WHERE plan_id = ? ORDER BY rev DESC"
    ).bind(id).all();
    return json(results || []);
  }

  if (method === "PUT" && sub === "") {
    const body = await readBody(request);
    const base = Number(body.baseRev ?? -1);
    const elements = normalizeElements(body);
    if (!elements) return json({ error: "structure.elements must be an array" }, 400);
    const planText = JSON.stringify({ elements });
    const ts = now();

    if (base === 0) {
      // 還沒有那一列：建它。INSERT OR IGNORE 讓兩個「第一次」只有一個成功，
      // 輸的那個 changes 為 0，走下面的 409。
      const ins = await db.prepare(
        "INSERT OR IGNORE INTO plans (id, name, rev, ts, plan) VALUES (?, '建築結構', 1, ?, ?)"
      ).bind(id, ts, planText).run();
      if (ins.meta.changes) {
        await writeRevision(db, id, 1, ts, planText);
        return json({ ok: true, rev: 1 });
      }
    } else {
      const res = await db.prepare(
        `UPDATE plans SET rev = rev + 1, ts = ?, plan = ?
           WHERE id = ? AND rev = ? AND deleted_at IS NULL`
      ).bind(ts, planText, id, base).run();
      if (res.meta.changes) {
        await writeRevision(db, id, base + 1, ts, planText);
        return json({ ok: true, rev: base + 1 });
      }
    }
    const cur = structureOf(await getPlan(db, id));
    return json({ ok: false, rev: cur.rev, structure: { elements: cur.elements } }, 409);
  }

  if (method === "POST" && sub === "/restore") {
    const body = await readBody(request);
    const row = await getPlan(db, id);
    if (!row) return json({ error: "not found" }, 404);
    const bak = await db.prepare(
      "SELECT plan FROM revisions WHERE plan_id = ? AND rev = ?"
    ).bind(id, body.rev).first();
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
    await writeRevision(db, id, row.rev + 1, ts, bak.plan);
    return json({ ok: true, rev: row.rev + 1 });
  }

  return json({ error: "not found" }, 404);
}

/* ── 每日摘要 ──────────────────────────────────────────────────────────
 *
 * 移植自 notify_digest.py（原本是 launchd 每晚 21:00 跑）。行為保持一致：
 * **只有當天真的有方案被更新才寄信**，沒有就完全不出聲。
 *
 * 時區是這裡唯一麻煩的地方。Cron 一律用 UTC，而 21:00 America/Chicago
 * 夏令是 02:00 UTC、冬令是 03:00 UTC。所以排兩個時間都醒，醒來先算當地
 * 幾點，不是 21 點就直接離開 —— 這樣不用管什麼時候換日光節約時間。
 * meta.digest_last_sent 再保證一天只寄一封。
 */

const TZ = "America/Chicago";
// 正式是 21 點。本機測試時用 DIGEST_HOUR 覆寫成當下的小時，才走得到寄信那條路。
const DEFAULT_DIGEST_HOUR = 21;

/** 回傳當地時間的 {y, m, d, hour} 與 YYYY-MM-DD 字串。 */
function localParts(date, timeZone = TZ) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** 當地某一天的起點，換算成 epoch 秒。用來篩「今天更新過的」。 */
function localDayStartEpoch(date, timeZone = TZ) {
  // 先問這個時區現在偏移多少，再用它把當地零點推回 UTC
  const asUTC = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const asLocal = new Date(date.toLocaleString("en-US", { timeZone }));
  const offsetMs = asUTC.getTime() - asLocal.getTime();
  const { ymd } = localParts(date, timeZone);
  return Math.floor((Date.parse(`${ymd}T00:00:00Z`) + offsetMs) / 1000);
}

async function runDigest(env, opts = {}) {
  const nowDate = new Date();
  const { ymd, hour } = localParts(nowDate);
  const wantHour = Number(env.DIGEST_HOUR ?? DEFAULT_DIGEST_HOUR);

  if (hour !== wantHour) {
    return `當地 ${hour} 點，不是 ${wantHour} 點，跳過`;
  }

  const sent = await env.DB.prepare("SELECT v FROM meta WHERE k = 'digest_last_sent'").first();
  if (sent && sent.v === ymd) return `${ymd} 已經寄過了`;

  const since = localDayStartEpoch(nowDate);
  const { results } = await env.DB.prepare(
    "SELECT name, ts FROM plans WHERE deleted_at IS NULL AND ts >= ? ORDER BY ts DESC"
  ).bind(since).all();

  // 沒改動就不寄 —— 這是這個功能的重點
  if (!results || !results.length) {
    await env.DB.prepare(
      "INSERT OR REPLACE INTO meta (k, v) VALUES ('digest_last_sent', ?)"
    ).bind(ymd).run();
    return "今天沒有方案被更新，不寄信";
  }

  const lines = ["今天有這些飲料店平面方案被更新：", ""];
  for (const r of results) {
    const t = new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(r.ts * 1000));
    lines.push(`· ${r.name}（${t}）`);
  }
  lines.push("", "打開查看：https://drinkshop.andremusic.dev");

  await sendMail(env, `飲料店平面 · 今日更新 ${results.length} 份方案`, lines.join("\n"));
  await env.DB.prepare(
    "INSERT OR REPLACE INTO meta (k, v) VALUES ('digest_last_sent', ?)"
  ).bind(ymd).run();
  return `已寄出：${results.length} 份方案`;
}

/** 用 Cloudflare Email Routing 寄信。
 *
 * 手刻 MIME 有兩個地雷：
 *  - 主旨含中文，必須用 RFC 2047 的 =?UTF-8?B?…?= 編碼，否則會變亂碼
 *  - **一定要有 Message-ID**，少了 Cloudflare 直接擋 `invalid message-id`
 */
async function sendMail(env, subject, body) {
  const { EmailMessage } = await import("cloudflare:email");
  const from = "drinkshop@andremusic.dev";
  const b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  const rand = crypto.randomUUID();
  const raw =
    `From: ${from}\r\n` +
    `To: ${env.DIGEST_TO}\r\n` +
    `Message-ID: <${rand}@andremusic.dev>\r\n` +
    `Date: ${new Date().toUTCString()}\r\n` +
    `Subject: =?UTF-8?B?${b64(subject)}?=\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    b64(body).replace(/(.{76})/g, "$1\r\n");
  await env.DIGEST.send(new EmailMessage(from, env.DIGEST_TO, raw));
}

export default {
  async scheduled(event, env, ctx) {
    const msg = await runDigest(env);
    console.log("digest:", msg);
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: "server error", detail: String(err) }, 500);
      }
    }
    // 其餘交給靜態資產（app.html）。
    //
    // 注意：預設情況下 assets 會在 Worker 之前就直接回應，所以這行對 `/`
    // 其實不會執行 —— 靜態檔根本進不到這個 handler。曾經在這裡加過「補上
    // charset header」的程式碼，實測完全沒生效（回應仍是 text/html）。
    //
    // 中文亂碼的真正修法是 app.html 檔首的 <meta charset="utf-8">。
    // 那個缺陷本來就存在，只是 server.py 明寫了 charset header 才沒暴露。
    return env.ASSETS.fetch(request);
  },
};
