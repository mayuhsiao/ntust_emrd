import type { NextConfig } from "next";

/*
 * 舊站（emrd.ntust.edu.tw，Rpage）網址轉址改由 src/proxy.ts 處理：
 * 明確清單（src/content/legacy/data/redirects.json）於 build 時打包進 Proxy，
 * 並可依查詢字串比對（/app/index.php?Action=downloadfile&file=…）與通用規則（文章網址變體等）。
 */

/*
 * Content-Security-Policy（content-security-policy.md「Without Nonces」）。
 * Partial Prerendering 的靜態外殼無法帶 nonce，Next 內嵌的 RSC／PPR 指令碼因此需要 'unsafe-inline'。
 * 只在正式環境送出：開發模式的 React 需要 'unsafe-eval' 與即時更新連線。
 *  - img-src：next/image 與搬遷圖片皆為站內路徑，data: 供 next/image 的模糊預覽；
 *    i.ytimg.com 為 YouTube 嵌入的縮圖預覽（srcdoc 文件沿用本頁 CSP）。
 *    搬遷內容若再引用站外圖片，需在此加入該網域（或改為下載到站內）。
 *  - frame-src：搬遷內容的 YouTube（youtube-nocookie）與 Google 日曆嵌入（本機 mp4 已改寫為 <video>）。
 *  - media-src：Hero 背景影片與文章內的本機 mp4。
 *  - frame-ancestors／X-Frame-Options：只允許本站框架嵌入，防止點擊劫持。
 * HSTS 請於 TLS 前端（反向代理）設定；不使用 upgrade-insecure-requests，避免內網 http 測試失效。
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://i.ytimg.com",
  "font-src 'self'",
  "media-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://calendar.google.com",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // YouTube 嵌入需要 Referer（來源網域）才能播放，故不使用 no-referrer
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(isProduction ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }] : []),
];

/*
 * 靜態匯出（GitHub Pages 預覽版，.github/workflows/pages.yml）：
 *   NEXT_OUTPUT=export NEXT_PUBLIC_BASE_PATH=/ntust_emrd \
 *     NEXT_PUBLIC_SITE_URL=https://mayuhsiao.github.io/ntust_emrd next build   → out/
 * 正式建置不設這些變數，行為完全不變（完整 Next 伺服器：Proxy 轉址、安全標頭、圖片最佳化）。
 * 匯出模式（static-exports.md「Unsupported Features」）：
 *  - output: "export"；headers() 不適用（靜態主機不送自訂標頭），改為不設定；
 *  - images.unoptimized：沒有圖片最佳化伺服器，next/image 直接輸出原圖網址；
 *  - trailingSlash：每頁輸出為 <路徑>/index.html。/news 與 /news/events 同時存在時，
 *    靜態主機才不會在 news.html 與 news/ 資料夾之間取捨；
 *  - cacheComponents 關閉：Next 16.4 的匯出流程不支援 Cache Components（export/index.js
 *    「PPR cannot be enabled in export mode」），partialPrefetching 依附於它，一併關閉；
 *    Footer 的 "use cache"＋cacheLife 改由 experimental.useCache 啟用（建置時產生一次）。
 *    動態路由的 ensureStatic／instant／unstable_paramMatching 只在 cacheComponents 下有效
 *    （否則建置失敗），工作流程於建置前刪除這三行；它們只影響伺服器對未知網址回應 404 的方式，
 *    靜態主機一律回應 404.html，效果相同；
 *  - src/proxy.ts（舊站轉址）不支援匯出（保留時 Next 只會警告並略過），由工作流程在建置前刪除；
 *  - robots.ts、sitemap.ts 等 Route Handler 以 generateStaticParams 宣告為靜態（說明見 app/robots.ts）；
 *  - NEXT_PUBLIC_SITE_PREVIEW：根版面據此輸出 noindex 與預覽版提示列（全站 HTML 排除索引）；
 *    robots.txt 改為全站禁止，但部署於子路徑時搜尋引擎不會讀取它，PDF／圖片等檔案無法以 noindex 排除。
 */
const isStaticExport = process.env.NEXT_OUTPUT === "export";
/** 子路徑部署（例：/ntust_emrd）；與 src/lib/basePath.ts 讀取同一個變數，正式網域部署時為空 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport
    ? { output: "export" as const, trailingSlash: true }
    : {
        async headers() {
          return [{ source: "/:path*", headers: securityHeaders }];
        },
      }),
  env: {
    NEXT_PUBLIC_SITE_PREVIEW: isStaticExport ? "1" : "",
  },
  ...(isStaticExport
    ? { experimental: { useCache: true } }
    : { cacheComponents: true, partialPrefetching: true }),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [75],
    ...(isStaticExport ? { unoptimized: true } : {}),
  },
  outputFileTracingExcludes: {
    "/*": [
      // Hero 以 existsSync 偵測 public/videos；影片由 CDN／靜態路徑提供，不需打包進伺服器函式
      "./public/videos/**/*",
      // 搬遷素材只以靜態檔提供：內容 <img> 的寬高已寫在 HTML，頁面渲染時不讀取這些檔案
      "./public/legacy/**/*",
    ],
  },
};

export default nextConfig;
