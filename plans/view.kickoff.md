---
contract_commit: "adb3a8a7c1f2624580b6acdd1af5a2eed7f04d10"
generated: 2026-09-17T21:25:00
---

先跑 `python3 ~/.claude/skills/kickoff/preflight.py plans/view.md --json`，
`kickoff_current` 不是 true 就停下來要求重跑 /kickoff，不要照舊的做。

讀 plans/view.md（大契約已凍結 @ adb3a8a7c1f2624580b6acdd1af5a2eed7f04d10）
與 CONTEXT.md（術語：檢視／面板／暫放／四邊地標）。照下列單元序列一口氣開發，每個單元：
  git fetch（多 session 並行，開單元前先對齊遠端）
  → python3 ~/github/claude-config/scripts/contract.py open U<n> --parent D<n> --plan plans/view.md --goal "…" --accept "…"
    （accept 逐條從 plan 的 Completion criterion 抄，只綁 repo 讀得到的事實：測試名／grep／檔案存在；
      這個 clone 沒有 ./scripts/contract.py，一律用 ~/github/claude-config/scripts/contract.py）
  → 做工（code 用 Edit／Write，不用 Bash heredoc；Bash 一次一條）
  → 逐檔 git add、commit
  → python3 ~/github/claude-config/scripts/contract.py close U<n>（codex 驗收，不過就修到過）

注意事項（這個 repo 的坑）：
  · 前端原始檔是根目錄 app.html；worker/public/ 是 gitignore 的 build 產物，改那裡等於白改。
  · 共用純函式放 worker/src/（rules.js、floors.js 已在；view.js 要新建），測試從 ../src/ 匯入，`npm run build` 要一起複製。
  · 資料層完全不動：座標系 1300×375、玄關 +x；只加檢視轉換。存檔的 x/y/rot 不能因為切檢視而變。
  · 單一 `plan` 元素目前 25 處引用（appendChild 9、querySelectorAll 7…）、place() 5 處、clientX 換算 4 處，D2 用 grep 卡完成標準，漏一處＝畫錯面板或拖偏。
  · 暫放 = 位置完全在框外（不加欄位）；壓線照常檢查；worker 端 thumbSvg 也要跳過暫放的。
  · 方向詞用四邊地標（後牆／門口側／樓梯側／對面牆），不要寫左右上下；規則文字不能再出現「圖的右邊」。
  · Cloudflare 指令要帶 CLOUDFLARE_ACCOUNT_ID=639b345cf87fb5c385e13bcfe5f2fe09（~/.zshrc 預設 pin 在學校帳號）。
  · 父母正在用正式站；D4 只在 D5、D6 都關了之後一次 deploy，deploy 前先本機 miniflare 開舊方案，deploy 後立刻在 drinkshop-new 開舊方案驗 1F 沒動。
  · vault 路徑在 iCloud，Bash 指令文字出現會被 path_guard 擋；讀寫 vault 用 Read／Write。
  · scripts/dwg_import.py（DWG 匯入）是另案、已由 U11 驗收，不在這份計畫內。

單元序列：
  U12: D1 檢視轉換純函式（worker/src/view.js：toScreen／fromScreenDelta／toModelPoint／panelSize／visualRot；tests/view.test.js 五個具名測試；build 複製 view.js）
  U13: D2 前端多面板（.plan[data-floor] ×1／×4、place／量測／間距／投影／拖曳全走 view、orientToggle／allFloors 存 localStorage、面板 pointerdown 切樓層、初始值照視窗寬、四層時投影預設關、方向詞改地標）
  U14: D3 匯出跟著檢視（buildSVG 依 view、四層一張、<g data-floor>）
  U15: D5 工具列收納＋設備尺寸可編輯＋拿掉窗戶＋清單預設收合（id="more"、iname/iw/id/ih、addWin=0）
  U16: D6 暫放（isParked 進 floors.js、clampPos 夾 planwrap、門口側留 300、規則／匯出／縮圖跳過、三個具名測試）
  U17: D4 上線＋readback（build → miniflare 驗舊方案 → deploy → drinkshop-new 驗 → docs/d7-readback.md）

全部關完 → python3 ~/github/claude-config/scripts/contract.py seal plans/view.md
卡住需要人決定時：AskUserQuestion 硬停等 Andre，不自作主張。

---

seal 過了才打：
/goal plans/view.md 的大契約 seal 已通過（contract.py seal 的結果記錄存在且全數 met）
