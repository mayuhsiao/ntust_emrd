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

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
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
        {children}
      </body>
    </html>
  );
}
