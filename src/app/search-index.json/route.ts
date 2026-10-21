/**
 * 全站搜尋索引：/search-index.json（格式見 src/lib/search.ts）。
 *
 * Cache Components 下，GET Route Handler 不讀取請求資料、亦無非決定性運算（日期、亂數）時，
 * 會於建置時預先產生為靜態回應（route-handlers.md「With Cache Components」）；
 * 搬遷資料由 @/lib/legacy 以同步 I/O 讀取，因此整份索引在 next build 時即固定。
 * 開發模式則每次請求重新產生，搬遷腳本更新資料後不必重啟。
 *
 * 靜態匯出（output: "export"，GitHub Pages 預覽）：Next 要求 GET Route Handler 標示為可靜態產生，
 * 但 Cache Components 不允許 `dynamic`／`revalidate` 設定，故改以 generateStaticParams 標示
 * （next/dist/server/route-modules/app-route/helpers/is-static-gen-enabled.js）；
 * 本路由沒有動態參數，回傳單一空參數即可，匯出時輸出 out/search-index.json。
 */
import { admissions, bento, curriculum, faculty, intro, requirements } from "@/content/home";
import thesesData from "@/content/theses.json";
import { groupHref, groups, hrefFor, standalonePages, type IaGroup } from "@/lib/ia";
import {
  allPostIds,
  collectionsForPost,
  getPage,
  getPost,
  linkPostTarget,
  plainText,
  titleTag,
} from "@/lib/legacy";
import type { SearchDoc, SearchIndex } from "@/lib/search";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return [{}];
}

export function GET() {
  return Response.json(buildSearchIndex());
}

/* ------------------------------------------------------------------ */
/* 建立索引                                                             */
/* ------------------------------------------------------------------ */

/** 文章內文最多收錄的字數（約 800 字即可涵蓋多數文章的重點，索引維持精簡） */
const POST_BODY_MAX = 800;
/** 歷屆畢業論文頁的內容另以 theses.json 逐篇收錄，頁面本身只收錄說明 */
const THESES_SLUG = "curriculum/theses";

type Thesis = {
  year: number;
  program: string;
  name: string;
  title: string;
  titleEn?: string;
  advisor: string;
  topics?: string[];
};

function joinText(parts: ReadonlyArray<string | undefined | null | false>) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** 去除空字串與空陣列，縮小輸出 */
function compact(doc: SearchDoc): SearchDoc {
  const out: SearchDoc = { type: doc.type, title: doc.title };
  if (doc.href) out.href = doc.href;
  if (doc.category) out.category = doc.category;
  if (doc.description) out.description = doc.description;
  const keywords = doc.keywords?.filter(Boolean);
  if (keywords?.length) out.keywords = [...new Set(keywords)];
  if (doc.body) out.body = doc.body;
  if (doc.titleEn) out.titleEn = doc.titleEn;
  if (doc.meta) out.meta = doc.meta;
  if (doc.date) out.date = doc.date;
  return out;
}

function hasOverviewPage(group: IaGroup) {
  return !group.pages.some((page) => page.slug === group.key);
}

/** 搬遷頁面的純文字：HTML 內文＋條目清單＋附件名稱 */
function pageText(slug: string) {
  const data = getPage(slug);
  if (!data) return undefined;
  return joinText([
    plainText(data.html),
    ...data.items.map((item) => titleTag(item.title).text),
    ...data.attachments.map((attachment) => attachment.label),
  ]);
}

function iaDocs(): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const group of groups) {
    if (hasOverviewPage(group)) {
      docs.push({
        type: "page",
        title: group.label,
        href: groupHref(group),
        category: "單元總覽",
        description: group.description,
        body: joinText(group.pages.map((page) => page.label)),
        meta: group.label,
      });
    }
    for (const page of group.pages) {
      // 與 app/[...slug]/page.tsx 的 generateStaticParams 一致：文章列表一律存在，一般頁面需有資料檔
      if (!page.collection && !getPage(page.slug)) continue;
      docs.push({
        type: "page",
        title: page.label,
        href: hrefFor(page.slug),
        category: group.label,
        description: page.description,
        body: page.collection || page.slug === THESES_SLUG ? undefined : pageText(page.slug),
        meta: page.slug === group.key ? group.label : `${group.label} › ${page.label}`,
      });
    }
  }
  for (const page of standalonePages) {
    const body = pageText(page.slug);
    if (body === undefined) continue;
    docs.push({
      type: "page",
      title: page.label,
      href: hrefFor(page.slug),
      category: "網站資訊",
      description: page.description,
      body,
      meta: page.label,
    });
  }
  docs.push(
    {
      type: "page",
      title: "網站導覽",
      href: site.routes.sitemap,
      category: "網站資訊",
      description: "專班特色、前瞻課綱、卓越師資、修業規定、招生專區與最新消息等所有單元頁面一覽。",
      keywords: ["sitemap", "網站地圖"],
      meta: "網站導覽",
    },
    {
      type: "page",
      title: "隱私權政策",
      href: site.routes.privacy,
      category: "網站資訊",
      description: "本網站對個人資料、Cookie 與存取紀錄、嵌入內容及外部連結之處理原則。",
      keywords: ["個人資料", "Cookie", "privacy"],
      meta: "隱私權政策",
    },
  );
  return docs;
}

function postDocs(): SearchDoc[] {
  const docs: SearchDoc[] = [];
  for (const id of allPostIds()) {
    const post = getPost(id);
    if (!post) continue;

    // 轉貼站內另一則文章的連結型文章：正本已收錄，略過以免重複
    const target = linkPostTarget(post);
    const targetId = target && /^\/posts\/(\d+)$/.exec(target.href)?.[1];
    if (targetId && targetId !== id && getPost(targetId)) continue;

    const { tag, text } = titleTag(post.title);
    const lists = collectionsForPost(id).map((collection) => collection.title);
    docs.push({
      type: "news",
      title: text,
      href: `/posts/${id}`,
      category: tag,
      keywords: lists,
      body: plainText(post.html, POST_BODY_MAX),
      meta: [post.date?.replaceAll("-", "/"), lists[0]].filter(Boolean).join(" · "),
      date: post.date,
    });
  }
  return docs;
}

function thesisDocs(): SearchDoc[] {
  const theses = (thesesData as { theses: Thesis[] }).theses;
  return theses.map((thesis) => {
    const advisors = thesis.advisor.split(/[、,，/／]/).map((name) => name.trim());
    const program = thesis.program === "EMRD" ? undefined : thesis.program;
    return {
      type: "thesis",
      title: thesis.title,
      titleEn: thesis.titleEn,
      // href 省略：用戶端以 docHref() 組成 /curriculum/theses?q=<標題>
      category: `${thesis.year} 學年度`,
      keywords: [thesis.name, ...advisors, thesis.program, ...(thesis.topics ?? [])],
      meta: [`${thesis.year} 學年度`, program, thesis.name, `指導教授 ${thesis.advisor}`]
        .filter(Boolean)
        .join(" · "),
      date: String(thesis.year),
    } satisfies SearchDoc;
  });
}

/** 首頁各單元總覽區塊（/#features 等），內容取自 src/content/home.ts */
function sectionDocs(): SearchDoc[] {
  const bodies: Record<string, { description: string; body: string }> = {
    "/#features": {
      description: bento.description,
      body: joinText([
        intro.title,
        ...intro.paragraphs,
        ...intro.points,
        bento.title,
        ...bento.cards.flatMap((card) => [card.title, card.description, ...card.points, ...card.tags]),
      ]),
    },
    "/#curriculum": {
      description: curriculum.description,
      body: joinText(
        curriculum.modules.flatMap((module) => [
          module.label,
          module.summary,
          ...module.courses.flatMap((course) => [course.name, course.description, ...course.tags]),
        ]),
      ),
    },
    "/#faculty": {
      description: faculty.description,
      body: joinText([
        ...faculty.leaders.flatMap((leader) => [
          leader.role,
          leader.name,
          leader.englishName,
          leader.title,
          leader.education,
        ]),
        ...faculty.highlights.flatMap((person) => [
          person.name,
          person.organization,
          person.position,
          person.course,
        ]),
      ]),
    },
    "/#requirements": {
      description: requirements.items.map((item) => `${item.label} ${item.value}`).join("、"),
      body: joinText(requirements.items.map((item) => item.detail)),
    },
    "/#admissions": {
      description: admissions.description,
      body: joinText([
        admissions.title,
        admissions.notice,
        admissions.quota,
        ...admissions.steps.flatMap((step) => [step.title, step.period, step.description, ...step.details]),
        admissions.eligibility.title,
        ...admissions.eligibility.items.flatMap((item) => [item.label, item.detail]),
      ]),
    },
  };

  const docs: SearchDoc[] = [];
  for (const group of groups) {
    const overview = group.overview;
    const content = overview && bodies[overview.href];
    if (!overview || !content) continue;
    docs.push({
      type: "section",
      title: overview.label,
      href: overview.href,
      category: "首頁",
      keywords: [group.label],
      description: content.description,
      body: content.body,
      meta: `首頁 › ${group.label}`,
    });
  }
  return docs;
}

function buildSearchIndex(): SearchIndex {
  return {
    version: 1,
    docs: [...iaDocs(), ...sectionDocs(), ...postDocs(), ...thesisDocs()].map(compact),
  };
}
