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
├─ lib/site.ts              聯絡資訊與所有對外連結（簡章 PDF、預約諮詢…）
└─ components/
   ├─ ui/                   Container、Section、SectionHeading、ButtonLink、Tag、Logo
   ├─ layout/               Navbar、Footer
   └─ sections/             Hero、StatStrip、BentoGrid、CurriculumTabs、Faculty、Timeline
```

## 內容維護

| 要更新的項目 | 檔案 |
| --- | --- |
| 招生簡章 PDF 連結、預約諮詢連結、電話 / E-mail | `src/lib/site.ts` |
| Hero 文案、關鍵數據、課程、師資、招生時程、報考資格 | `src/content/home.ts` |

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

需求：Python 3.10+、numpy、opencv-python、Pillow、ffmpeg。
