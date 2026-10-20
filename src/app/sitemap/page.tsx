import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ContentLayout, InteriorFrame } from "@/components/site/InteriorFrame";
import { interiorOpenGraph } from "@/components/site/metadata";
import { PageHeader } from "@/components/site/PageHeader";
import { groupHref, groups, hrefFor, standalonePages, type IaGroup } from "@/lib/ia";
import { getPage, postsForCollection } from "@/lib/legacy";
import { site } from "@/lib/site";

const description = `${site.name}網站導覽：專班特色、前瞻課綱、卓越師資、修業規定、招生專區與最新消息等所有單元頁面一覽。`;

export const metadata: Metadata = {
  title: "網站導覽",
  description,
  alternates: { canonical: "/sitemap" },
  openGraph: interiorOpenGraph({ title: "網站導覽", description, url: "/sitemap" }),
};

type SitemapLink = { href: string; label: string; meta?: string };

const linkClass =
  "group inline-flex min-h-10 items-baseline gap-2 py-1.5 text-[0.9375rem] leading-snug text-slate-700 transition-colors duration-200 hover:text-brand-900";

function groupLinks(group: IaGroup): SitemapLink[] {
  const links: SitemapLink[] = [];
  if (!group.pages.some((page) => page.slug === group.key)) {
    links.push({ href: groupHref(group), label: `${group.label}總覽` });
  }
  for (const page of group.pages) {
    if (page.collection) {
      const count = postsForCollection(page.slug).length;
      links.push({
        href: hrefFor(page.slug),
        label: page.label,
        meta: count > 0 ? `${count} 則` : undefined,
      });
    } else if (getPage(page.slug)) {
      links.push({ href: hrefFor(page.slug), label: page.label });
    }
  }
  return links;
}

function LinkColumn({ links }: { links: readonly SitemapLink[] }) {
  return (
    <ul className="mt-4 grid gap-0.5">
      {links.map((link) => (
        <li key={link.href}>
          <Link href={link.href} className={linkClass}>
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 shrink-0 translate-y-0.5 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5"
            />
            <span className="decoration-brand-300 underline-offset-4 group-hover:underline">
              {link.label}
            </span>
            {link.meta ? (
              <span className="text-sm text-slate-600 tabular-nums">（{link.meta}）</span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 網站導覽（人類閱讀用）：依資訊架構列出所有單元、頁面與文章列表 */
export default function SitemapPage() {
  const otherLinks: SitemapLink[] = [
    { href: "/", label: "首頁" },
    ...standalonePages
      .filter((page) => getPage(page.slug))
      .map((page) => ({ href: hrefFor(page.slug), label: page.label })),
    { href: "/privacy", label: "隱私權政策" },
  ];

  return (
    <InteriorFrame pathname={site.routes.sitemap}>
      <PageHeader
        crumbs={[
          { label: "首頁", href: "/" },
          { label: "網站導覽", href: "/sitemap" },
        ]}
        eyebrow="Sitemap"
        title="網站導覽"
        lead="本站所有單元與頁面一覽，最新消息各列表並標示文章數量。"
      />
      <ContentLayout>
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <section key={group.key} className="border-t-2 border-brand-600 pt-5">
              <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link
                  href={groupHref(group)}
                  className="text-lg font-semibold text-brand-950 decoration-brand-300 underline-offset-4 hover:underline"
                >
                  {group.label}
                </Link>
                <span
                  lang="en"
                  className="text-xs font-semibold tracking-[0.16em] text-champagne-700 uppercase"
                >
                  {group.englishLabel}
                </span>
              </h2>
              <LinkColumn links={groupLinks(group)} />
            </section>
          ))}
          <section className="border-t-2 border-champagne-400 pt-5">
            <h2 className="text-lg font-semibold text-brand-950">其他頁面</h2>
            <LinkColumn links={otherLinks} />
          </section>
        </div>
      </ContentLayout>
    </InteriorFrame>
  );
}
