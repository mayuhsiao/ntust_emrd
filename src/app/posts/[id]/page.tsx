import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ArrowUpRight, Info, Link2 } from "lucide-react";
import type { LegacyPost } from "@/content/legacy/types";
import { AttachmentList } from "@/components/site/AttachmentList";
import { ContentLayout, InteriorFrame } from "@/components/site/InteriorFrame";
import { LegacyContent } from "@/components/site/LegacyContent";
import { interiorOpenGraph } from "@/components/site/metadata";
import { PageHeader } from "@/components/site/PageHeader";
import { PostPager } from "@/components/site/PostPager";
import { PostTag } from "@/components/site/PostTag";
import { SideNav } from "@/components/site/SideNav";
import { withBasePath } from "@/lib/basePath";
import { breadcrumbs, findPage, hrefFor, type Crumb } from "@/lib/ia";
import {
  allPostIds,
  collectionsForPost,
  getPost,
  linkPostTarget,
  pagesReferencingPost,
  postDescription,
  prevNext,
  titleTag,
  truncate,
  type CollectionRef,
} from "@/lib/legacy";

type RouteProps = { params: Promise<{ id: string }> };

/** 麵包屑中的文章標題長度上限（完整標題見 h1） */
const CRUMB_TITLE_MAX = 18;
/** 社群平台可預覽的分享圖格式（原站少數封面為 BMP） */
const SHAREABLE_IMAGE = /\.(?:jpe?g|png|webp|gif)$/i;
/** 無所屬列表且無頁面引用時的預設列表 */
const DEFAULT_LIST = "news";

/**
 * 未搬遷的文章代碼一律回應 404，且第一次請求即為 404。
 * ensureStatic = "navigation"：未列於 generateStaticParams 的代碼不先送出 App Shell（狀態碼 200），
 * 而是等待完整的靜態結果，頁面最上層的 notFound() 因此能在回應送出前設定 404
 * （ensureStatic.md「Dynamic route parameters」）。
 * unstable_paramMatching（"not-found"）：未列出的代碼直接回應預先產生的完整 404 頁，
 * 不進入頁面渲染、不新增頁面快取（不穩定 API，說明見 app/[...slug]/page.tsx）。
 * instant = false：頁面在最上層等待 params，未知代碼沒有可用的外殼，略過空外殼驗證。
 */
export const ensureStatic = "navigation";
export const unstable_paramMatching = { id: "not-found" } as const;
export const instant = false;

export function generateStaticParams() {
  return allPostIds().map((id) => ({ id }));
}

/**
 * 文章的所屬脈絡：第一個所屬列表；未歸入任何列表者，改用引用它的頁面（如「隨班附讀」）。
 */
function contextFor(id: string): { slug: string; label: string; collections: CollectionRef[] } {
  const collections = collectionsForPost(id);
  const slug = collections[0]?.slug ?? pagesReferencingPost(id)[0] ?? DEFAULT_LIST;
  const label = collections[0]?.title ?? findPage(slug)?.page.label ?? "公告欄";
  return { slug, label, collections };
}

function crumbsFor(contextSlug: string, contextLabel: string, id: string, title: string): Crumb[] {
  const crumbs = breadcrumbs(contextSlug);
  // 「公告欄」即「最新消息」群組入口，breadcrumbs 只回傳群組名稱，補上列表名稱
  if (crumbs.at(-1)?.label !== contextLabel) {
    crumbs.push({ label: contextLabel, href: hrefFor(contextSlug) });
  }
  crumbs.push({ label: truncate(title, CRUMB_TITLE_MAX), href: `/posts/${id}` });
  return crumbs;
}

function isEmptyPost(post: LegacyPost) {
  return post.html.trim().length === 0 && post.attachments.length === 0;
}

/**
 * 搜尋引擎索引：內容不在本頁的文章不與正本競爭（這些文章也不列入 app/sitemap.ts）。
 *  - 連結型文章指向站內另一則文章 → canonical 指向該文章；
 *  - 連結型文章指向站外網頁或檔案 → noindex（仍允許追蹤連結）；
 *  - 無內文也無附件的空白文章 → 有同標題且有內容的文章時 canonical 指向它，否則 noindex。
 */
function indexing(post: LegacyPost, url: string): Pick<Metadata, "alternates" | "robots"> {
  const noindex = { alternates: { canonical: url }, robots: { index: false, follow: true } };
  const target = linkPostTarget(post);
  if (target) {
    const linked = /^\/posts\/(\d+)$/.exec(target.href);
    return linked && getPost(linked[1]) ? { alternates: { canonical: target.href } } : noindex;
  }
  if (isEmptyPost(post)) {
    const original = allPostIds()
      .map((id) => getPost(id))
      .find((other) => other && other.id !== post.id && other.title === post.title && !isEmptyPost(other));
    return original ? { alternates: { canonical: `/posts/${original.id}` } } : noindex;
  }
  return { alternates: { canonical: url } };
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { id } = await params;
  const post = getPost(id);
  if (!post) return { title: "找不到此頁面", robots: { index: false } };

  const { text } = titleTag(post.title);
  const description = postDescription(post);
  const url = `/posts/${post.id}`;
  return {
    title: text,
    description,
    ...indexing(post, url),
    // 封面為站內相對路徑，由根版面的 metadataBase 轉為絕對網址；無封面時使用預設分享圖
    openGraph: interiorOpenGraph({
      title: text,
      description,
      url,
      type: "article",
      image: post.cover && SHAREABLE_IMAGE.test(post.cover) ? { url: post.cover, alt: text } : undefined,
    }),
  };
}

/**
 * 單篇文章。於頁面最上層 await params：已知文章由 generateStaticParams 預先產生，
 * 未知代碼呼叫 notFound()，搭配上方 ensureStatic = "navigation" 於第一次請求即回應 404。
 */
export default async function PostPage({ params }: RouteProps) {
  const { id } = await params;
  const post = getPost(id);
  if (!post) notFound();

  return (
    <InteriorFrame pathname={`/posts/${post.id}`}>
      <PostContent post={post} />
    </InteriorFrame>
  );
}

function PostContent({ post }: { post: LegacyPost }) {

  const { tag, text } = titleTag(post.title);
  const context = contextFor(post.id);
  const found = findPage(context.slug);
  const group = found?.group;
  const { prev, next } = context.collections.length > 0 ? prevNext(post.id, context.slug) : {};
  const target = linkPostTarget(post);
  const hasHtml = post.html.trim().length > 0;

  return (
    <>
      <PageHeader
        crumbs={crumbsFor(context.slug, context.label, post.id, text)}
        eyebrow={group?.englishLabel ?? "News"}
        meta={tag ? <PostTag tag={tag} inverted /> : undefined}
        title={text}
      />
      <ContentLayout aside={group ? <SideNav group={group} activeSlug={context.slug} currentType="true" /> : undefined}>
        <article aria-label={text} className="grid grid-cols-1 gap-12">
          {target ? (
            <LinkPostCallout href={target.href} label={target.label || text} />
          ) : hasHtml ? (
            <LegacyContent html={post.html} />
          ) : post.attachments.length === 0 ? (
            <p role="note" className="flex gap-3 rounded-md border border-stroke bg-surface p-5 text-sm text-slate-700">
              <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
              本則消息僅有標題，原網站未提供內文。
            </p>
          ) : null}

          <AttachmentList attachments={post.attachments} />

          {context.collections.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span>收錄於</span>
              {context.collections.map((collection, index) => (
                <span key={collection.slug} className="inline-flex items-center gap-2">
                  {index > 0 ? (
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                  ) : null}
                  <Link
                    href={hrefFor(collection.slug)}
                    className="inline-flex min-h-8 items-center font-medium text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-700"
                  >
                    {collection.title}
                  </Link>
                </span>
              ))}
            </p>
          ) : null}
        </article>

        <div className="mt-12">
          <PostPager prev={prev} next={next} listLabel={context.label} listHref={hrefFor(context.slug)} />
        </div>
      </ContentLayout>
    </>
  );
}

/** 「連結型」文章（原站轉貼其他文章、表單或外部頁面）：以明確的行動按鈕呈現 */
function LinkPostCallout({ href, label }: { href: string; label: string }) {
  const external = /^https?:\/\//i.test(href);
  const isPost = /^\/posts\/\d+$/.test(href);
  const linked = isPost ? getPost(href.slice("/posts/".length)) : undefined;
  const linkedTitle = titleTag(linked ? linked.title : label).text;
  const className =
    "group inline-flex min-h-12 items-center gap-2 rounded-md bg-brand-700 px-6 text-base font-semibold text-white shadow-sm shadow-brand-950/15 transition-colors duration-200 hover:bg-brand-800 focus-visible:outline-offset-2 active:bg-brand-900";

  return (
    <div className="flex flex-col gap-5 rounded-md border border-stroke bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
      <div className="flex gap-4">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-white text-brand-700 ring-1 ring-stroke ring-inset"
        >
          <Link2 className="size-5" />
        </span>
        <div>
          <p className="text-sm text-slate-600">
            {external ? "本則消息連結至外部網站" : "本則消息的完整內容位於"}
          </p>
          <p className="mt-1 text-lg leading-snug font-semibold text-pretty text-brand-950">
            {linkedTitle}
          </p>
        </div>
      </div>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          前往連結
          <ArrowUpRight aria-hidden="true" className="size-4.5" />
          <span className="sr-only">（另開新視窗）</span>
        </a>
      ) : href.startsWith("/legacy/") ? (
        <a href={withBasePath(href)} className={className}>
          開啟檔案
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </a>
      ) : (
        <Link href={href} className={className}>
          閱讀全文
          <ArrowRight
            aria-hidden="true"
            className="size-4.5 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      )}
    </div>
  );
}
