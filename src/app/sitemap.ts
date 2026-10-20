import type { MetadataRoute } from "next";
import type { LegacyPost } from "@/content/legacy/types";
import { groupHref, groups, hrefFor, standalonePages, type IaPage } from "@/lib/ia";
import { allPostIds, getPage, getPost, linkPostTarget } from "@/lib/legacy";
import { site } from "@/lib/site";

/*
 * sitemap.xml：首頁、各群組總覽、搬遷頁面／文章列表、獨立頁與所有文章。
 * 與內頁共用 @/lib/legacy 的資料索引，可列出的頁面與 app/[...slug]/page.tsx 的 generateStaticParams 規則相同。
 * 原站沒有可靠的日期，故不輸出 lastModified。
 */

type Entry = MetadataRoute.Sitemap[number];

/** 列表單元一律可瀏覽（資料檔尚未產生時顯示空清單）；其餘頁面需有搬遷資料 */
function pageExists(page: IaPage) {
  return Boolean(page.collection || getPage(page.slug));
}

/**
 * 內容在其他網址的文章不列入（app/posts/[id]/page.tsx 以 canonical 或 noindex 處理）：
 * 連結型文章（轉貼站內文章、站外網頁或檔案）與無內文也無附件的空白文章。
 */
function isIndexablePost(post: LegacyPost) {
  if (linkPostTarget(post)) return false;
  return post.html.trim().length > 0 || post.attachments.length > 0;
}

/**
 * 站內路徑 → 正式網址；& 與 ' 依 XML 規則跳脫（Next 不會替 sitemap 內容跳脫）。
 * 首頁輸出與 canonical 相同的 https://emrd.ntust.edu.tw（不帶結尾斜線）。
 */
function absolute(pathname: string) {
  const url = new URL(pathname, site.url);
  const href = url.pathname === "/" && !url.search ? url.origin : url.href;
  return href.replace(/&/g, "&amp;").replace(/'/g, "&apos;");
}

/** 只收站內、字元安全的封面圖（站外圖片不屬於本站，不列入圖片 sitemap） */
function coverImage(cover?: string) {
  return cover && /^\/[\w\-./~%]+$/.test(cover) ? [absolute(cover)] : undefined;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: Entry[] = [];
  const seen = new Set<string>();
  const add = (pathname: string, options: Omit<Entry, "url">) => {
    const url = absolute(pathname);
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ url, ...options });
  };

  add("/", { changeFrequency: "weekly", priority: 1 });

  for (const group of groups) {
    const pages = group.pages.filter(pageExists);
    const overview = groupHref(group);
    // 最新消息以公告欄（/news）為入口，該頁本身即列表單元，交由下方頁面清單輸出
    if (!group.pages.some((page) => hrefFor(page.slug) === overview)) {
      add(overview, { changeFrequency: "monthly", priority: 0.8 });
    }
    for (const page of pages) {
      const isEntry = hrefFor(page.slug) === overview;
      if (page.collection) {
        add(hrefFor(page.slug), { changeFrequency: "weekly", priority: isEntry ? 0.8 : 0.7 });
      } else {
        add(hrefFor(page.slug), {
          changeFrequency: "monthly",
          priority: group.key === "admissions" ? 0.8 : 0.7,
        });
      }
    }
  }

  for (const page of standalonePages.filter(pageExists)) {
    add(hrefFor(page.slug), { changeFrequency: "monthly", priority: 0.6 });
  }

  add("/sitemap", { changeFrequency: "monthly", priority: 0.3 });
  add("/privacy", { changeFrequency: "yearly", priority: 0.2 });

  const posts = allPostIds()
    .filter((id) => /^\d+$/.test(id))
    .sort((a, b) => Number(b) - Number(a))
    .flatMap((id) => {
      const post = getPost(id);
      return post && isIndexablePost(post) ? [post] : [];
    });
  for (const post of posts) {
    const images = coverImage(post.cover);
    add(`/posts/${post.id}`, {
      changeFrequency: "yearly",
      priority: 0.5,
      ...(images ? { images } : {}),
    });
  }

  return entries;
}
