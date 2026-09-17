// package.json 的 build script：public/ 是 gitignore 的產生物，deploy 前由它複製。
// 守兩件事：前端要的檔都到了；Worker 入口 src/index.js 不會被當靜態檔公開。
// 在暫存目錄裡跑，不動 repo 的 public/。
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const worker = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(worker);

test("build 複製 app.html 與 src/rules.js，不複製 src/index.js", () => {
  const root = mkdtempSync(join(tmpdir(), "dsp-build-"));
  const w = join(root, "worker");
  mkdirSync(w);
  cpSync(join(repo, "app.html"), join(root, "app.html"));
  cpSync(join(worker, "package.json"), join(w, "package.json"));
  cpSync(join(worker, "src"), join(w, "src"), { recursive: true });

  const build = JSON.parse(readFileSync(join(w, "package.json"), "utf8")).scripts.build;
  execSync(build, { cwd: w, shell: "/bin/sh", stdio: "pipe" });

  assert.equal(existsSync(join(w, "public", "index.html")), true, "public/index.html");
  assert.equal(existsSync(join(w, "public", "rules.js")), true, "public/rules.js");
  assert.equal(existsSync(join(w, "public", "index.js")), false, "Worker 入口不得進 public/");
  assert.equal(readFileSync(join(w, "public", "index.html"), "utf8"), readFileSync(join(repo, "app.html"), "utf8"));
});

test("deploy 先跑 build", () => {
  const scripts = JSON.parse(readFileSync(join(worker, "package.json"), "utf8")).scripts;
  assert.match(scripts.deploy, /^npm run build && /);
});
