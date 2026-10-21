import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchFormFallback, SearchResults } from "@/components/search/SearchResults";
import { ContentLayout, InteriorFrame } from "@/components/site/InteriorFrame";
import { interiorOpenGraph } from "@/components/site/metadata";
import { PageHeader } from "@/components/site/PageHeader";
import { site } from "@/lib/site";

const description = `搜尋${site.name}網站的頁面、最新消息與歷屆畢業論文。`;

/**
 * 全站搜尋結果頁（/search?q=…）。不列於選單與 sitemap，由搜尋視窗的「查看全部結果」連入；
 * 結果依查詢而異，不供搜尋引擎索引（noindex），連結仍可追蹤。
 */
export const metadata: Metadata = {
  title: "搜尋",
  description,
  robots: { index: false, follow: true },
  openGraph: interiorOpenGraph({ title: "搜尋", description, url: "/search" }),
};

/**
 * 頁面外框與表單後備內容於建置時預先產生；查詢（?q=）由用戶端以 useSearchParams 讀取，
 * 依 Cache Components 規則包在 Suspense 內（靜態匯出時同樣適用），索引於載入後在瀏覽器中比對。
 */
export default function SearchPage() {
  return (
    <InteriorFrame pathname="/search">
      <PageHeader
        crumbs={[
          { label: "首頁", href: "/" },
          { label: "搜尋", href: "/search" },
        ]}
        eyebrow="Search"
        title="搜尋"
        lead="搜尋全站頁面、首頁各單元、最新消息與歷屆畢業論文。"
      />
      <ContentLayout>
        <div className="max-w-4xl">
          <Suspense fallback={<SearchFormFallback />}>
            <SearchResults />
          </Suspense>
        </div>
      </ContentLayout>
    </InteriorFrame>
  );
}
