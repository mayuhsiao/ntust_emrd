import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Info } from "lucide-react";
import type { LegacyPage } from "@/content/legacy/types";
import { AttachmentList } from "@/components/site/AttachmentList";
import { CollectionFilter, type CollectionEntry } from "@/components/site/CollectionFilter";
import { ContentLayout, InteriorFrame } from "@/components/site/InteriorFrame";
import { ItemList } from "@/components/site/ItemList";
import { LegacyContent } from "@/components/site/LegacyContent";
import { interiorOpenGraph } from "@/components/site/metadata";
import { OverviewTiles, type OverviewTile } from "@/components/site/OverviewTiles";
import { PageHeader } from "@/components/site/PageHeader";
import { ContactCard, RelatedLinks, type RelatedLink } from "@/components/site/RelatedLinks";
import { SideNav } from "@/components/site/SideNav";
import {
  breadcrumbs,
  findGroup,
  findPage,
  groups,
  hrefFor,
  standalonePages,
  type IaGroup,
  type IaPage,
} from "@/lib/ia";
import {
  getPage,
  pageDescription,
  getPost,
  linkPostTarget,
  plainText,
  postsForCollection,
  titleTag,
} from "@/lib/legacy";
import { site } from "@/lib/site";

type RouteProps = { params: Promise<{ slug: string[] }> };

/* ------------------------------------------------------------------ */
/* 路徑解析                                                            */
/* ------------------------------------------------------------------ */

type Resolved =
  | { kind: "overview"; group: IaGroup }
  | { kind: "collection"; group: IaGroup; page: IaPage }
  | { kind: "page"; group: IaGroup; page: IaPage; data: LegacyPage }
  | { kind: "standalone"; page: IaPage; data: LegacyPage };

function hasOverviewPage(group: IaGroup) {
  return !group.pages.some((page) => page.slug === group.key);
}

function resolve(slug: string): Resolved | undefined {
  const group = findGroup(slug);
  if (group && hasOverviewPage(group)) return { kind: "overview", group };

  const found = findPage(slug);
  if (!found) return undefined;
  const { page } = found;
  if (found.group && page.collection) return { kind: "collection", group: found.group, page };

  const data = getPage(slug);
  if (!data) return undefined;
  return found.group
    ? { kind: "page", group: found.group, page, data }
    : { kind: "standalone", page, data };
}

function safeDecode(segment: string) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function slugFromParams(segments: string[]) {
  return segments.map(safeDecode).join("/");
}

/** IA 中所有可產生內頁的 slug：群組總覽、文章列表（資料檔尚未產生時顯示空清單）、有資料檔的頁面與獨立頁 */
function routableSlugs() {
  const slugs = new Set<string>();
  for (const group of groups) {
    if (hasOverviewPage(group)) slugs.add(group.key);
    for (const page of group.pages) {
      if (page.collection || getPage(page.slug)) slugs.add(page.slug);
    }
  }
  for (const page of standalonePages) {
    if (getPage(page.slug)) slugs.add(page.slug);
  }
  return [...slugs];
}

/**
 * 未列於 generateStaticParams 的網址一律不存在，第一次請求就必須回應 404。
 *
 * partialPrefetching 開啟時，未列出的參數預設先送出 App Shell（狀態碼 200）再於背景渲染，
 * notFound() 來不及改變狀態碼（軟 404）。ensureStatic = "navigation" 要求整個路由為靜態輸出，
 * 未列出的參數改為等待完整的靜態結果再回應（ensureStatic.md「Dynamic route parameters」、
 * incremental-static-regeneration-cache-components.md「Wait for complete static output」），
 * 頁面最上層的 notFound() 因此能在回應送出前設定 404。
 *
 * unstable_paramMatching（參數比對，"not-found"）：可用網址已全數列於 generateStaticParams，
 * 其餘參數不進入頁面渲染，直接回應預先產生的 404 頁（含完整頁首、內容與頁尾，
 * 不必等用戶端 JS 補上），也不會為每個探測網址新增一筆頁面快取。此為不穩定 API，
 * 隨 package.json 鎖定的 next 版本使用；升級 Next 時請確認，若移除仍有 ensureStatic 確保 404 狀態碼。
 *
 * instant = false：頁面在最上層等待 params，未知參數沒有可用的外殼，略過空外殼驗證。
 */
export const ensureStatic = "navigation";
export const unstable_paramMatching = { slug: "not-found" } as const;
export const instant = false;

export function generateStaticParams() {
  return routableSlugs().map((slug) => ({ slug: slug.split("/") }));
}

/* ------------------------------------------------------------------ */
/* 文案                                                                */
/* ------------------------------------------------------------------ */

/** 文章列表頁導言 */
const collectionLeads: Record<string, string> = {
  news: "EMRD 學程的公告、活動與榮譽消息，依發布順序由新到舊排列。",
  "news/events": "迎新、校慶、企業參訪與畢業典禮等活動紀錄。",
  "news/honors": "EMRD 師生與校友的獲獎及榮譽消息。",
  "news/media": "媒體對 EMRD 的報導與學員推薦。",
  "news/videos": "活動影片與影音紀錄。",
  "admissions/news": "招生簡章、招生說明會與錄取名單等招生公告。",
};

/** 獨立頁的英文小標 */
const standaloneEyebrows: Record<string, string> = {
  contact: "Contact Us",
  "alumni-hall": "Alumni Lounge",
};

/** 獨立頁的相關連結 */
const standaloneRelated: Record<string, readonly RelatedLink[]> = {
  contact: [
    { href: "/faculty/office", label: "學程辦公室" },
    { href: "/faculty/executives", label: "現任執行長 / 副執行長" },
    { href: "/admissions/info", label: "招生資訊" },
    { href: "/study/forms", label: "表單下載" },
  ],
  "alumni-hall": [
    { href: "/study/alumni-update", label: "校友資訊更新區" },
    { href: "/news/events", label: "活動集錦" },
    { href: "/news/honors", label: "榮譽榜" },
  ],
};

function pageExcerpt(data: LegacyPage | undefined, max: number) {
  if (!data) return "";
  const fromHtml = plainText(data.html, max);
  if (fromHtml) return fromHtml;
  const fromItems = data.items.map((item) => titleTag(item.title).text).join("、");
  return fromItems ? plainText(fromItems, max) : "";
}

function describe(resolved: Resolved) {
  switch (resolved.kind) {
    case "overview":
      return resolved.group.description || `${resolved.group.label}｜${site.officialName}`;
    case "collection":
      return (
        pageDescription(resolved.page.slug) ??
        collectionLeads[resolved.page.slug] ??
        `${resolved.page.label}｜${site.officialName}`
      );
    default:
      return (
        pageDescription(resolved.page.slug) ??
        (pageExcerpt(resolved.data, 110) || `${resolved.page.label}｜${site.officialName}`)
      );
  }
}

function labelOf(resolved: Resolved) {
  return resolved.kind === "overview" ? resolved.group.label : resolved.page.label;
}

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const slug = slugFromParams((await params).slug);
  const resolved = resolve(slug);
  if (!resolved) return { title: "找不到此頁面", robots: { index: false } };

  const title = labelOf(resolved);
  const description = describe(resolved);
  const url = hrefFor(slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: interiorOpenGraph({ title, description, url }),
  };
}

/* ------------------------------------------------------------------ */
/* 頁面                                                                */
/* ------------------------------------------------------------------ */

/**
 * 全站內頁（群組總覽、搬遷頁面、文章列表與獨立頁）。
 * 於頁面最上層 await params 並解析網址：已知網址皆由 generateStaticParams 預先產生；
 * 未知網址呼叫 notFound()，搭配上方 ensureStatic = "navigation" 於第一次請求即回應 404。
 */
export default async function InteriorPage({ params }: RouteProps) {
  const slug = slugFromParams((await params).slug);
  const resolved = resolve(slug);
  if (!resolved) notFound();

  return <InteriorFrame pathname={hrefFor(slug)}>{renderResolved(slug, resolved)}</InteriorFrame>;
}

function renderResolved(slug: string, resolved: Resolved) {
  switch (resolved.kind) {
    case "overview":
      return <OverviewView slug={slug} group={resolved.group} />;
    case "collection":
      return <CollectionView slug={slug} group={resolved.group} page={resolved.page} />;
    case "page":
      return <PageView slug={slug} group={resolved.group} page={resolved.page} data={resolved.data} />;
    case "standalone":
      return <StandaloneView slug={slug} page={resolved.page} data={resolved.data} />;
  }
}

function OverviewView({ slug, group }: { slug: string; group: IaGroup }) {
  const tiles: OverviewTile[] = group.pages.map((page) => {
    if (page.collection) {
      const count = postsForCollection(page.slug).length;
      return {
        href: hrefFor(page.slug),
        label: page.label,
        excerpt: collectionLeads[page.slug],
        meta: count > 0 ? `共 ${count} 則` : undefined,
      };
    }
    return { href: hrefFor(page.slug), label: page.label, excerpt: pageExcerpt(getPage(page.slug), 80) };
  });

  return (
    <>
      <PageHeader
        crumbs={breadcrumbs(slug)}
        eyebrow={group.englishLabel}
        title={group.label}
        lead={group.description}
      />
      <ContentLayout>
        <h2 className="sr-only">{group.label}單元頁面</h2>
        <OverviewTiles tiles={tiles} />
        {group.overview ? (
          <p className="mt-10 border-t border-stroke pt-8">
            <Link
              href={group.overview.href}
              className="group inline-flex min-h-11 items-center gap-2 text-base font-semibold text-brand-700 underline-offset-4 hover:underline"
            >
              在首頁瀏覽{group.overview.label}
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </p>
        ) : null}
      </ContentLayout>
    </>
  );
}

function collectionEntries(slug: string): CollectionEntry[] {
  return postsForCollection(slug).map((post) => {
    const { tag, text } = titleTag(post.title);
    const entry: CollectionEntry = { id: post.id, title: text, tag, cover: post.cover, href: `/posts/${post.id}` };

    // 連結型文章（原站轉貼）：直接前往目標，並沿用目標文章的封面
    const target = linkPostTarget(post);
    if (target) {
      const postMatch = /^\/posts\/(\d+)$/.exec(target.href);
      if (postMatch) {
        entry.href = target.href;
        entry.cover ??= getPost(postMatch[1])?.cover;
      } else if (/^https?:\/\//i.test(target.href)) {
        entry.href = target.href;
        entry.external = true;
      } else if (target.href.startsWith("/") && !target.href.startsWith("/legacy/")) {
        entry.href = target.href;
      }
    }
    return entry;
  });
}

function CollectionView({ slug, group, page }: { slug: string; group: IaGroup; page: IaPage }) {
  const entries = collectionEntries(slug);
  const unit = slug.startsWith("admissions/") ? "則公告" : "則消息";

  return (
    <>
      <PageHeader
        crumbs={breadcrumbs(slug)}
        eyebrow={group.englishLabel}
        title={page.label}
        lead={collectionLeads[slug]}
      />
      <ContentLayout aside={<SideNav group={group} activeSlug={slug} />}>
        <CollectionFilter
          entries={entries}
          unit={unit}
          placeholder={slug === "news/videos" ? "video" : "news"}
        />
      </ContentLayout>
    </>
  );
}

function PageBody({ data }: { data: LegacyPage }) {
  const hasHtml = data.html.trim().length > 0;
  const empty = !hasHtml && data.items.length === 0 && data.attachments.length === 0;

  return (
    <div className="grid grid-cols-1 gap-12">
      {hasHtml ? <LegacyContent html={data.html} /> : null}
      <ItemList items={data.items} title={hasHtml ? "相關連結" : undefined} />
      <AttachmentList attachments={data.attachments} />
      {empty ? (
        <p role="note" className="flex gap-3 rounded-md border border-stroke bg-surface p-5 text-sm text-slate-700">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
          本頁目前沒有內容，如需相關資訊請洽學程辦公室。
        </p>
      ) : null}
    </div>
  );
}

function PageView({
  slug,
  group,
  page,
  data,
}: {
  slug: string;
  group: IaGroup;
  page: IaPage;
  data: LegacyPage;
}) {
  return (
    <>
      <PageHeader crumbs={breadcrumbs(slug)} eyebrow={group.englishLabel} title={page.label} />
      <ContentLayout aside={<SideNav group={group} activeSlug={slug} />}>
        <PageBody data={data} />
      </ContentLayout>
    </>
  );
}

function StandaloneView({ slug, page, data }: { slug: string; page: IaPage; data: LegacyPage }) {
  const related = standaloneRelated[slug] ?? [];
  const aside =
    slug === "contact" || related.length > 0 ? (
      <div className="grid gap-6 lg:sticky lg:top-28">
        {slug === "contact" ? <ContactCard /> : null}
        <RelatedLinks links={related} />
      </div>
    ) : undefined;

  return (
    <>
      <PageHeader
        crumbs={breadcrumbs(slug)}
        eyebrow={standaloneEyebrows[slug] ?? site.shortName}
        title={page.label}
      />
      <ContentLayout aside={aside} asidePosition="end">
        <PageBody data={data} />
      </ContentLayout>
    </>
  );
}
