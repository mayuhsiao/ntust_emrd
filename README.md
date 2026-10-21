# NTUST EMRD Executive Portal

國立臺灣科技大學 研發碩士在職專班（高階科技研發碩士學位學程，EMRD）官方形象首頁。

- Next.js 16（App Router、Cache Components）＋ React 19
- Tailwind CSS v4（設計 token 定義於 `src/app/globals.css`）
- 字型：全站 Noto Sans TC（next/font 自架），後備微軟正黑體
- lucide-react 圖示

> 上線前仍待學程／學校回覆的項目，集中在根目錄的 [`待確認事項.md`](待確認事項.md)。

## 開發

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 正式建置
npm run start    # 以正式建置啟動
npm run lint
```

## 預覽網站（GitHub Pages）

給同仁瀏覽的預覽版：<https://mayuhsiao.github.io/ntust_emrd/>

- **自動更新**：每次推送到 `main`（或在 Actions 頁手動執行「Deploy preview to GitHub Pages」），
  [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 會重新建置並部署，約 2–3 分鐘後生效。
- **建置方式**：靜態匯出（`output: "export"`），由 `next.config.ts` 依環境變數切換，正式建置完全不受影響：

  ```bash
  rm src/proxy.ts            # Proxy（舊站轉址）需要伺服器，匯出前移除
  # 刪除 src/app 內 ensureStatic／instant／unstable_paramMatching 三行宣告（見工作流程，匯出模式不支援）
  NEXT_OUTPUT=export NEXT_PUBLIC_BASE_PATH=/ntust_emrd \
    NEXT_PUBLIC_SITE_URL=https://mayuhsiao.github.io/ntust_emrd npm run build   # → out/
  # 建置後修正首頁／404 頁分享圖網址重複的子路徑（見工作流程），再加上 out/.nojekyll
  ```

  以上步驟只在 CI 的工作目錄中執行；本機要自行試做時請在專案的複本中進行，
  並以任一靜態伺服器將 `out/` 掛在 `/ntust_emrd/` 子路徑下瀏覽。
  （Next 16.4 在 Windows 上匯出時，換頁預先載入檔會被寫成子資料夾 `__next.x/…`，
  用戶端以 `__next.x.….txt` 請求而得到 404；CI 在 Linux 上建置沒有這個問題。）
- **與正式網站的差異**：預覽版是純靜態檔案，
  - 沒有舊站網址轉址（`/p/…`、`/app/index.php?…` 會顯示 404 頁），
  - 沒有自訂安全標頭（CSP 等），
  - 圖片不經最佳化（直接提供原圖，載入較慢），
  - 頁首顯示「預覽版網站」提示列；全站 HTML 頁面以 `<meta name="robots" content="noindex, nofollow">` 排除索引。
    匯出的 `robots.txt` 位於子路徑（`/ntust_emrd/robots.txt`），搜尋引擎只讀取網域根目錄的 `/robots.txt`，
    因此不會生效；PDF、圖片、影片等檔案無法以 noindex 排除，仍可能被收錄。若需排除，請在使用者網站儲存庫
    （`mayuhsiao.github.io`）的 `robots.txt` 加上 `Disallow: /ntust_emrd/`。
- **子路徑**：網站位於 `/ntust_emrd/` 之下。`next/link`、靜態匯入的圖片與 metadata 會自動處理；
  其餘原始字串網址（搬遷內容的連結與圖片、`<video src>`、`fetch()`、指向檔案的 `<a href>`）
  請一律經過 `src/lib/basePath.ts` 的 `withBasePath()`，正式網域部署時它不會改變網址。

一次性設定（儲存庫管理員）：

1. GitHub 儲存庫 **Settings → Pages → Build and deployment → Source** 選擇 **GitHub Actions**。
2. 第一次設定後，到 **Actions** 頁手動執行一次工作流程（或推送任一提交）。

## 專案結構

```
src/
├─ app/
│  ├─ layout.tsx            字型、metadata、跳至主要內容連結
│  ├─ page.tsx              首頁組裝
│  ├─ privacy/page.tsx      隱私權政策
│  ├─ globals.css           設計 token（香檳金 / 鈦金屬 / 科技深藍）
│  └─ icon.png              網站圖示（EMRD 徽章）
├─ assets/
│  ├─ ntust-logo.png        臺科大標準字（校徽＋國立臺灣科技大學），導覽列
│  ├─ ntust-logo-white.png  反白版，深色頁尾
│  ├─ ntust-symbol.png      校徽符號，窄螢幕導覽列
│  ├─ ntust-logo-vertical.png 直式標準字，品牌形象片結尾
│  └─ emrd-seal.png         EMRD 學程徽章（商標審定號 01962663）
├─ content/home.ts          首頁所有文案與數據（年度更新請改這裡）
├─ content/campus.ts        校園地圖（/campus）的建物、進駐單位、座標與 EMRD 空間
├─ lib/site.ts              聯絡資訊與所有對外連結（簡章 PDF、預約諮詢…）
└─ components/
   ├─ ui/                   Container、Section、SectionHeading、ButtonLink、Tag、Logo
   ├─ layout/               Navbar、Footer
   ├─ sections/             Hero、StatStrip、BentoGrid、CurriculumTabs、Faculty、Timeline
   └─ campus/               CampusMap（校園地圖互動元件）
```

## 內容維護

| 要更新的項目 | 檔案 |
| --- | --- |
| 招生簡章 PDF 連結、預約諮詢連結、電話 / E-mail | `src/lib/site.ts` |
| Hero 文案、關鍵數據、課程、師資、招生時程、報考資格 | `src/content/home.ts` |
| 學程名稱（導覽列、頁尾）| `src/lib/site.ts`（`programName`）|
| 校園地圖的建物、進駐單位、EMRD 教室與辦公室 | `src/content/campus.ts`（地圖圖檔 `src/assets/campus/`）|

每年 116、117… 學年度簡章公告後，請更新 `site.links.brochurePdf`、`brochureLabel`
以及 `admissions` 的時程文字。

## Hero 背景影片

Next.js 只會從 `public/` 提供靜態檔，因此影片請放在：

```
public/videos/hero-bg.mp4       背景影片（必要，建議 H.264、1920×1080、10–20 秒無縫循環、< 8 MB）
media/videos/hero-poster.jpg    首格封面（選用，不部署）
```

建置時若偵測不到影片，Hero 會自動改用「科技幾何點陣微動態背景」，不會發出 404 請求；
瀏覽器載入失敗、使用者開啟「減少動態效果」或「節省數據」時也會退回同一背景。
新增或替換影片後需重新 `npm run build`。

## 品牌素材來源

- 臺科大標準字：秘書室「20190701 臺科大標準字」
  <https://www.secretariat.ntust.edu.tw/p/406-1063-85380,r1785.php?Lang=zh-tw>（網站取用 `台科logo-08.png` 輸出彩色、反白與校徽符號三種；品牌形象片取用直式的 `台科logo-07.png`）
- EMRD 徽章：學程官網「學程 Logo」頁

## 形象動畫

`scripts/render_hero_video.py` 以程式生成四幕 15 秒動畫（晶圓微觀 → 智慧工廠與 AI 節點網絡 → 光點匯聚樞紐 → 品牌定格）：

```bash
python scripts/render_hero_video.py --variant loop    # → public/videos/hero-bg.mp4（網站背景，無文字、可無縫循環）＋ media/videos/hero-poster.jpg
python scripts/render_hero_video.py --variant brand   # → media/videos/emrd-brand-15s.mp4（含徽章與標語，社群／簡報用；media/ 不會部署）
python scripts/render_hero_video.py --variant loop --width 960 --height 540 --preview 0,4,8,12   # 快速預覽關鍵格
```

另有兩支以同一套管線生成的影片：

```bash
python -X utf8 scripts/render_alumni_film.py --workers 4   # → public/videos/emrd-alumni-15s.mp4 ＋ emrd-alumni-poster.jpg（15 秒校友與同儕連結片，照片取自 reference_形象素材/；首頁「社群與校友」區塊播放，隨網站部署）
python -X utf8 scripts/render_logo_wall.py                 # → media/videos/emrd-logo-wall-10s.mp4 ＋ emrd-logo-wall-poster.jpg（10 秒校友企業字標牆；不部署，說明見 scripts/logos/README.md）
```

需求：Python 3.10+、numpy、opencv-python、Pillow、ffmpeg。
