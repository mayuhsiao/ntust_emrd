import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

/** robots.txt：全站開放索引（舊網址由 next.config 轉址，搜尋引擎需能抓取以更新索引） */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
