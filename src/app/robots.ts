import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/**
 * GitHub Pages 預覽版（靜態匯出，next.config.ts）：全站禁止索引，正式網站不受影響。
 * 部署於子路徑（/ntust_emrd/robots.txt）時搜尋引擎只讀取網域根目錄的 /robots.txt，此設定不會生效；
 * 預覽版的 HTML 頁面另以根版面的 noindex 排除（app/layout.tsx），改用自訂網域時本檔才有作用。
 */
const isPreview = process.env.NEXT_PUBLIC_SITE_PREVIEW === "1";

/**
 * 靜態匯出要求 Route Handler（含 robots.ts、sitemap.ts）明確宣告為靜態，但 cacheComponents
 * 不允許 dynamic／revalidate；Next 也接受 generateStaticParams 作為靜態宣告（is-static-gen-enabled），
 * 本路由沒有動態參數，回傳單一空參數組。正式建置時本來就於建置時預先產生，行為不變。
 */
export function generateStaticParams() {
  return [{}];
}

/** robots.txt：全站開放索引（舊網址由 src/proxy.ts 轉址，搜尋引擎需能抓取以更新索引） */
export default function robots(): MetadataRoute.Robots {
  if (isPreview) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
