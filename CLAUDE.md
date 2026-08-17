# drink-shop-planner — 給 agent 的補充

106號一樓飲料店改裝專案的**線上互動平面編輯器**。
媽媽的飲料店移進住家一樓（純外帶、一人可顧）。

## 🔴 平面規劃一律用這個編輯器，不要再出 SVG／PDF

Andre 與父母都在持續使用它，**不要再產生 SVG 或 PDF 平面圖**。
2026-07-24 之前產生的圖一／圖二／規格總表已經刪除，內容併回 Obsidian。

**正式網址：https://drinkshop.andremusic.dev** —— 多方案版，Andre 跟父母都能編輯、
彼此幾秒內看到。公開無密碼（靠冷門子網域 + 每次存檔自動備份當保險）。

## 空間資料與限制在 Obsidian，不在這裡

vault `50_Projects/106號一樓 飲料店改裝.md` —— 空間 1300×375、設備清單含尺寸、
前場提案 A、**10 條鎖定限制**、待辦。原始 CAD 與設備照片在
Google Drive `My Drive/System/Downloads/106號裝潢/`。

⚠️ Obsidian vault 根在 iCloud，**Bash 指令文字裡出現 iCloud 路徑會被 `path_guard` P5 擋**，
要讀寫 vault 用 Read／Write 工具。

## 架構（2026-08-11 起）

**Cloudflare Worker `drink-shop-planner` + D1** 直接服務，程式在 `worker/`。
D1 database id `e69306ae-…`（WNAM）。同一個 Worker 也綁
`drinkshop-new.andremusic.dev` 當測試入口。

> ⚠️ **舊架構已退役，不要照著做。** 2026-07-30 到 08-11 之間它是自架在 Mac mini
> （`server.py`，Python stdlib，port 8788，launchd `com.andre.drinkshop` 常駐），
> 掛在 andremusic.dev 的 tunnel 上。**那兩個 launchd 服務已經移除，ingress 也拿掉了。**
> repo 裡還留著的 `server.py`／`launchd/`／`notify_digest.py` 是那個時期的東西。

功能：多方案清單（含縮圖 + 最後修改時間）、整份樂觀鎖（rev/409，不會無聲互蓋）、
每份方案的版本紀錄可回復、每天 21:00 摘要 email。

Cloudflare 帳號與部署細節見 claude-config `notes/memory notes/cloudflare.md` ——
這個專案在**個人帳號** `639b345`（`andremusic.dev` 註冊在那裡），
而 `~/.zshrc` 的 `CLOUDFLARE_ACCOUNT_ID` 預設 pin 在**學校帳號**，
所以 wrangler 指令要逐條覆寫帳號。

`state/` 已 gitignore。
