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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
