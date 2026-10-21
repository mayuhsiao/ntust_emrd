import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC } from "next/font/google";
import { SkipLink } from "@/components/site/SkipLink";
import { site } from "@/lib/site";
import "./globals.css";

const notoSansTC = Noto_Sans_TC({
  variable: "--font-noto-tc",
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
});

const description =
  "專為高科技產業技術決策者與研發高階主管打造的碩士在職學程。全國首創技術長（CTO）學程，匯聚跨領域產學頂尖人脈與前瞻智造視野。";

/**
 * GitHub Pages 預覽版（靜態匯出，見 next.config.ts）：禁止索引、頁首顯示預覽提示列。
 * 分享卡片與 canonical 以預覽網址（NEXT_PUBLIC_SITE_URL，含 /ntust_emrd 子路徑）為基準，
 * 站內相對網址（文章封面、預設分享圖）才會指向預覽版實際存在的檔案；未提供時沿用正式網域。
 * 檔案慣例的 app/opengraph-image.jpg 網址已含 basePath，與含子路徑的 metadataBase 相加會重複，
 * 由工作流程於建置後修正（.github/workflows/pages.yml）。正式建置不受影響。
 */
const isPreview = process.env.NEXT_PUBLIC_SITE_PREVIEW === "1";
const previewUrl = process.env.NEXT_PUBLIC_SITE_URL;
const officialHost = new URL(site.url).host;

export const metadata: Metadata = {
  metadataBase: new URL(isPreview && previewUrl ? previewUrl : site.url),
  ...(isPreview ? { robots: { index: false, follow: false } } : {}),
  title: {
    default: `${site.name}｜${site.officialName}`,
    template: `%s｜${site.shortName}`,
  },
  description,
  applicationName: site.shortName,
  keywords: [
    "臺科大",
    "EMRD",
    "高階科技研發碩士",
    "碩士在職專班",
    "技術長學程",
    "CTO",
    "研發管理",
    "半導體",
    "智慧製造",
  ],
  openGraph: {
    type: "website",
    locale: "zh_TW",
    siteName: site.shortName,
    title: site.name,
    description,
    url: "/",
  },
  // og:image 由 app/opengraph-image.jpg 自動產生
  twitter: { card: "summary_large_image" },
  // canonical 由各頁面自行宣告（首頁見 app/page.tsx），避免 404 頁等未宣告者繼承首頁網址
};

export const viewport: Viewport = {
  themeColor: "#001a36",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-Hant-TW"
      data-scroll-behavior="smooth"
      className={`${notoSansTC.variable} antialiased`}
    >
      <body className="min-h-dvh bg-white font-sans text-slate-900">
        {/* 隱藏的 Activity 路由仍保留各自的 <main id="main">，由 SkipLink 聚焦目前顯示的那一個 */}
        <SkipLink className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-full focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white">
          跳到主要內容
        </SkipLink>
        {isPreview ? <PreviewBanner /> : null}
        {children}
      </body>
    </html>
  );
}

/** 預覽版提示列：位於頁首之上、隨頁面捲走；放在跳到主要內容之後，鍵盤使用者仍可先略過 */
function PreviewBanner() {
  return (
    <aside
      aria-label="預覽版網站說明"
      className="border-b border-champagne-300 bg-champagne-100 text-brand-950"
    >
      <p className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-center gap-x-2 px-4 py-1.5 text-center text-xs leading-relaxed sm:px-6 sm:text-[13px] lg:px-8">
        <span className="font-semibold">預覽版網站</span>
        <span aria-hidden="true" className="text-champagne-600">
          ｜
        </span>
        <span className="sr-only">，</span>
        <span>
          正式網址：
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            lang="en"
            className="font-medium text-brand-800 underline decoration-champagne-500 underline-offset-2 hover:text-brand-950 hover:decoration-brand-800"
          >
            {officialHost}
            <span lang="zh-Hant-TW" className="sr-only">
              （另開新視窗）
            </span>
          </a>
        </span>
      </p>
    </aside>
  );
}
