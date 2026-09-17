---
contract_commit: "7448c024a895220ee06ebe1c0a552f37eee84cdc"
generated: 2026-09-17T11:05:00
---

先跑 `python3 ~/.claude/skills/kickoff/preflight.py plans/floors.md --json`，
`kickoff_current` 不是 true 就停下來要求重跑 /kickoff，不要照舊的做。

讀 plans/floors.md（大契約已凍結 @ 7448c024a895220ee06ebe1c0a552f37eee84cdc）
與 CONTEXT.md（術語）。照下列單元序列一口氣開發，每個單元：
  git fetch（多 session 並行，開單元前先對齊遠端）
  → ./scripts/contract.py open U<n> --parent D<n> --plan plans/floors.md --goal "…" --accept "…"
    （accept 逐條從 plan 的 Completion criterion 抄，只綁 repo 讀得到的事實：測試名／grep／檔案存在）
  → 做工（code 用 Edit／Write，不用 Bash heredoc；Bash 一次一條）
  → 逐檔 git add、commit
  → ./scripts/contract.py close U<n>（codex 驗收，不過就修到過）

注意事項（這個 repo 的坑）：
  · 前端原始檔是根目錄 app.html；worker/public/ 是 gitignore 的 build 產物，改那裡等於白改。
  · 共用純函式放 worker/src/（rules.js 已在、floors.js 要新建），測試從 ../src/ 匯入。
  · D1 起補 worker/package.json 的 build script（app.html→public/index.html、src/*.js→public/），deploy 先 build。
  · Cloudflare 指令要帶 CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09（~/.zshrc 預設 pin 在學校帳號）。
  · 父母正在用正式站；D6 deploy 前先本機 miniflare 開舊方案，deploy 後立刻在 drinkshop-new 開舊方案驗。
  · vault 路徑在 iCloud，Bash 指令文字出現會被 path_guard 擋；讀寫 vault 用 Read／Write。

單元序列：
  U2: D1 規則引擎三條新規則（rules.js 已由 test-fixer 改到新簽名，此單元收尾：測試名對齊、DEFAULT_STRUCTURE、package.json build script）
  U3: D2 結構 API（GET/PUT /api/structure、history、restore；/api/plans 過濾 structure）
  U4: D3 前端樓層＋投影（curFloor、tab、cur()、projection、floors.js、量測線帶 floor）
  U5: D4 前端結構模式＋紅框（structMode、＋梁／廁所／樓梯、draggableSet、shrineViolations 紅框）
  U6: D5 縮圖（thumbSvg 只畫 1F、結構從 structure 列讀）
  U7: D6 上線＋readback（npm run deploy、docs/d6-readback.md、vault 補一行）

全部關完 → ./scripts/contract.py seal plans/floors.md
卡住需要人決定時：AskUserQuestion 硬停等 Andre，不自作主張。

---

seal 過了才打這行：

/goal plans/floors.md 的大契約 seal 已通過（./scripts/contract.py seal 的結果記錄存在且全數 met）
