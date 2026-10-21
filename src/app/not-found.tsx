import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { Navbar } from "@/components/layout/Navbar";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { groupHref, groups } from "@/lib/ia";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "找不到此頁面",
  robots: { index: false },
};

/** 每個主題摘列的頁面數，其餘以「等」帶過，完整清單見網站導覽 */
const PAGE_PREVIEW_COUNT = 4;

const topics = groups.map((group) => {
  const labels = group.pages.map((page) => page.label);
  const preview = labels.slice(0, PAGE_PREVIEW_COUNT).join("、");
  return {
    key: group.key,
    label: group.label,
    englishLabel: group.englishLabel,
    href: groupHref(group),
    summary: labels.length > PAGE_PREVIEW_COUNT ? `${preview}等` : preview,
  };
});

const textLinkClass =
  "group inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline";

export default function NotFound() {
  return (
    <>
      {/* 404 頁沒有對應的單元，不標示目前位置 */}
      <Navbar pathname={null} />
      <main id="main" tabIndex={-1} className="outline-none">
        <Section aria-labelledby="not-found-title">
          <Container>
            <div className="max-w-3xl">
              <p
                lang="en"
                className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase"
              >
                <span aria-hidden="true" className="h-px w-8 bg-champagne-500/70" />
                404 Not Found
              </p>
              <h1
                id="not-found-title"
                className="mt-4 text-3xl leading-tight font-semibold tracking-[0.01em] text-balance text-brand-950 sm:text-4xl lg:text-5xl"
              >
                找不到此頁面
              </h1>
              <p className="mt-5 text-base leading-relaxed text-pretty break-keep text-slate-700 sm:text-lg">
                您要找的頁面可能已移除或網址有誤。EMRD
                網站已全新改版，若您由舊書籤或其他網站的連結進入，請從下方主題或網站導覽找到新的頁面位置。
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <ButtonLink href={site.routes.home} size="lg">
                  回到首頁
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5"
                  />
                </ButtonLink>
                <ButtonLink href={site.routes.news} variant="secondary" size="lg">
                  最新公告
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5"
                  />
                </ButtonLink>
              </div>
            </div>

            <nav
              aria-labelledby="not-found-links-title"
              className="mt-14 border-t border-stroke pt-10 lg:mt-16"
            >
              <h2
                id="not-found-links-title"
                className="text-sm font-semibold tracking-wide text-brand-950"
              >
                或從以下主題繼續瀏覽
              </h2>
              <ul className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
                {topics.map((topic) => (
                  <li key={topic.key}>
                    <p
                      lang="en"
                      className="text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase"
                    >
                      {topic.englishLabel}
                    </p>
                    <Link
                      href={topic.href}
                      className="group mt-1 inline-flex min-h-11 items-center gap-2 text-lg font-semibold text-brand-700 underline-offset-4 hover:underline"
                    >
                      {topic.label}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </Link>
                    <p className="text-sm leading-relaxed text-pretty break-keep text-slate-600">
                      {topic.summary}
                    </p>
                  </li>
                ))}
              </ul>

              <ul
                aria-label="其他頁面"
                className="mt-10 flex flex-wrap gap-x-8 border-t border-stroke pt-4"
              >
                <li>
                  <Link href={site.routes.sitemap} className={textLinkClass}>
                    網站導覽
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
                <li>
                  <Link href={site.routes.contact} className={textLinkClass}>
                    聯絡資訊
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              </ul>
            </nav>
          </Container>
        </Section>
      </main>
      <MobileActionBar pathname={null} />
      <Footer />
    </>
  );
}
