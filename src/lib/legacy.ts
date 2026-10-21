/**
 * 原 EMRD 網站搬遷內容的讀取層（僅供 Server Components 使用，請勿自 Client Component 匯入）。
 *
 * 資料由 scripts/migrate_legacy.py 產生於 src/content/legacy/data/：
 *   pages/<slug "/"→"__">.json、collections/<slug "__">.json、posts/<id>.json
 *
 * 於模組載入時以 node:fs 同步讀取並建立索引（Cache Components 允許同步 I/O，結果會進入靜態輸出）。
 * 開發模式下若搬遷腳本重新執行（report.json 更新），下次呼叫時自動重建索引，不必重啟 dev server。
 */
import fs from "node:fs";
import path from "node:path";
import type {
  LegacyCollection,
  LegacyPage,
  LegacyPost,
} from "@/content/legacy/types";
import { findPage } from "@/lib/ia";
import { site } from "@/lib/site";

const DATA_DIR = path.join(process.cwd(), "src", "content", "legacy", "data");
const REPORT_FILE = path.join(DATA_DIR, "report.json");

type LegacyIndex = {
  pages: Map<string, LegacyPage>;
  collections: Map<string, LegacyCollection>;
  posts: Map<string, LegacyPost>;
  /** 文章 id → 以條目或內文連結引用該文章的頁面 slug（依頁面讀取順序） */
  postReferrers: Map<string, string[]>;
};

function fileToSlug(file: string) {
  return file.replace(/\.json$/, "").replaceAll("__", "/");
}

function readJsonDir<T>(dir: string): Array<[name: string, value: T]> {
  let files: string[];
  try {
    files = fs.readdirSync(path.join(DATA_DIR, dir));
  } catch {
    return [];
  }
  const entries: Array<[string, T]> = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, dir, file), "utf8");
      entries.push([fileToSlug(file), JSON.parse(raw) as T]);
    } catch {
      // 搬遷腳本寫檔途中或檔案毀損時略過該筆，不讓整站失效
    }
  }
  return entries;
}

const POST_LINK = /href="\/posts\/(\d+)"/g;

function buildIndex(): LegacyIndex {
  const pages = new Map<string, LegacyPage>();
  for (const [slug, page] of readJsonDir<LegacyPage>("pages")) {
    pages.set(page.slug ?? slug, page);
  }

  const collections = new Map<string, LegacyCollection>();
  for (const [slug, collection] of readJsonDir<LegacyCollection>("collections")) {
    collections.set(collection.slug ?? slug, collection);
  }

  const posts = new Map<string, LegacyPost>();
  for (const [id, post] of readJsonDir<LegacyPost>("posts")) {
    posts.set(String(post.id ?? id), post);
  }

  const postReferrers = new Map<string, string[]>();
  const addReferrer = (postId: string, slug: string) => {
    const list = postReferrers.get(postId) ?? [];
    if (!list.includes(slug)) list.push(slug);
    postReferrers.set(postId, list);
  };
  for (const page of pages.values()) {
    for (const item of page.items) {
      const match = /^\/posts\/(\d+)$/.exec(item.href);
      if (match) addReferrer(match[1], page.slug);
    }
    for (const match of page.html.matchAll(POST_LINK)) addReferrer(match[1], page.slug);
  }

  return { pages, collections, posts, postReferrers };
}

function reportStamp() {
  try {
    return fs.statSync(REPORT_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

const isProduction = process.env.NODE_ENV === "production";
let cached: { stamp: number; index: LegacyIndex } = {
  stamp: isProduction ? 0 : reportStamp(),
  index: buildIndex(),
};

function index(): LegacyIndex {
  if (!isProduction) {
    const stamp = reportStamp();
    if (stamp !== cached.stamp) cached = { stamp, index: buildIndex() };
  }
  return cached.index;
}

/* ------------------------------------------------------------------ */
/* 查詢                                                                */
/* ------------------------------------------------------------------ */

export function getPage(slug: string): LegacyPage | undefined {
  return index().pages.get(slug);
}

export function getCollection(slug: string): LegacyCollection | undefined {
  return index().collections.get(slug);
}

export function getPost(id: string): LegacyPost | undefined {
  return index().posts.get(id);
}

export function allPostIds(): string[] {
  return [...index().posts.keys()];
}

/** 文章列表單元的文章（依原站排序；資料缺漏的 id 略過） */
export function postsForCollection(slug: string): LegacyPost[] {
  const collection = getCollection(slug);
  if (!collection) return [];
  const { posts } = index();
  return collection.postIds.flatMap((id) => {
    const post = posts.get(id);
    return post ? [post] : [];
  });
}

export type CollectionRef = { slug: string; title: string };

/** IA 中標記為 collection 的單元名稱（資料檔尚未產生時仍可顯示名稱） */
function collectionLabel(slug: string) {
  const found = findPage(slug);
  return found?.page.collection ? found.page.label : undefined;
}

/** 文章所屬的列表單元（依文章資料的順序；未列於 IA 且無資料檔者略過） */
export function collectionsForPost(id: string): CollectionRef[] {
  const post = getPost(id);
  if (!post) return [];
  return post.collections.flatMap((slug) => {
    const title = collectionLabel(slug) ?? getCollection(slug)?.title;
    return title ? [{ slug, title }] : [];
  });
}

/** 以條目或內文連結引用此文章的頁面（供未歸入任何列表的文章決定所屬單元） */
export function pagesReferencingPost(id: string): string[] {
  return index().postReferrers.get(id) ?? [];
}

/* ------------------------------------------------------------------ */
/* 文字工具                                                            */
/* ------------------------------------------------------------------ */

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  middot: "·",
  bull: "•",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  times: "×",
  copy: "©",
  reg: "®",
  trade: "™",
};

/** 解碼常見 HTML 字元參照（數字參照與常用具名參照） */
export function decodeEntities(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
  });
}

/** 依字元（含中日韓與表情符號）截斷，超過時補上「…」 */
export function truncate(text: string, max: number) {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars.slice(0, Math.max(1, max - 1)).join("").trimEnd()}…`;
}

const BLOCK_BOUNDARY =
  /<\/?(?:p|br|hr|h[1-6]|li|ul|ol|tr|td|th|table|thead|tbody|blockquote|figure|figcaption|div)\b[^>]*>/gi;

/**
 * 將 HTML 轉為純文字摘要（供 meta description 與總覽卡片使用）。
 * @param n 最多字元數；省略則不截斷
 */
export function plainText(html: string, n?: number) {
  const text = decodeEntities(
    html
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(BLOCK_BOUNDARY, " ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[\s 　]+/g, " ")
    .trim();
  return n === undefined ? text : truncate(text, n);
}

/** 原站標題常見的分類標籤 */
export type PostTagName =
  | "活動"
  | "公告"
  | "喜訊"
  | "招生"
  | "報導"
  | "招生公告"
  | "重要公告"
  // 其餘原站自訂標籤（如「學分班公告」）
  | (string & {});

const TITLE_TAG = /^\s*[[【［]\s*([^\]】］]{1,8}?)\s*[\]】］]\s*/;

/** 解析標題開頭的「[活動]」「【公告】」等標籤，回傳標籤與去除標籤後的標題 */
export function titleTag(title: string): { tag?: PostTagName; text: string } {
  const match = TITLE_TAG.exec(title);
  if (!match) return { text: title.trim() };
  const text = title.slice(match[0].length).trim();
  // 標題僅有標籤時保留原文，避免變成空字串
  return text ? { tag: match[1], text } : { text: title.trim() };
}

export type PostSummary = { id: string; title: string };

/**
 * 同一列表中的相鄰文章。原站列表為新到舊，
 * prev 為列表中的前一則（較新），next 為後一則（較舊）。
 */
export function prevNext(
  id: string,
  collectionSlug: string,
): { prev?: PostSummary; next?: PostSummary } {
  const collection = getCollection(collectionSlug);
  if (!collection) return {};
  const { posts } = index();
  const ids = collection.postIds.filter((postId) => posts.has(postId));
  const at = ids.indexOf(id);
  if (at === -1) return {};
  const summary = (postId: string | undefined): PostSummary | undefined => {
    const post = postId ? posts.get(postId) : undefined;
    return post ? { id: post.id, title: post.title } : undefined;
  };
  return { prev: summary(ids[at - 1]), next: summary(ids[at + 1]) };
}

/* ------------------------------------------------------------------ */
/* 招生公告                                                            */
/* ------------------------------------------------------------------ */

/** 招生公告列表單元：其中的文章一律視為招生相關 */
const ADMISSIONS_COLLECTION = "admissions/news";

/** 未列於招生公告者，標題含這些字詞即視為招生相關（招生說明會、隨班附讀、學分班、放榜與錄取名單等） */
const ADMISSION_TITLE = /招生|隨班附讀|學分班|說明會|放榜|錄取|甄試/;

/**
 * 標題雖含上列字詞、內容卻不是招生公告者（逐篇檢視 data/posts 後排除）：
 * 「新生說明會」為錄取後的新生座談（76737），「開學典禮」為入學後的活動（93842，標題含「學分班」）。
 */
const ADMISSION_TITLE_EXCLUDE = /新生說明會|開學典禮/;

/** 招生相關文章：屬於「招生公告」列表，或標題為招生、隨班附讀、學分班等公告 */
export function isAdmissionPost(post: LegacyPost) {
  if (post.collections.includes(ADMISSIONS_COLLECTION)) return true;
  return ADMISSION_TITLE.test(post.title) && !ADMISSION_TITLE_EXCLUDE.test(post.title);
}

/**
 * 明確標示的學年度（offset 為換算成招生年度時加上的年數）：
 * - 「115學年度」與第一學期代碼「110-01」「110-1」：即該學年度（隨班附讀、學分班於前一年 7–8 月報名，
 *   早於該年度簡章公告，屬當年的招生年度）。
 * - 第二學期代碼「111-02」「112-2」、暑期「110暑期」「109-暑期」、「115學年度第2學期／下學期／暑期」：
 *   報名於次一民國年的 1 月或 6 月（例：111-02 學期 112/01/06 截止、110暑期 111/06/02 截止），
 *   正值下一學年度的招生期間，故加 1；否則下一學年度招生期間仍在報名的公告會被誤標為歷史公告。
 */
const EXPLICIT_YEARS: ReadonlyArray<{ pattern: RegExp; offset: number }> = [
  { pattern: /(?<!\d)(1\d{2})\s*學年/g, offset: 0 },
  { pattern: /(?<!\d)(1\d{2})\s*學年度?\s*(?:第\s*[2二]\s*學期|下學期|暑期)/g, offset: 1 },
  { pattern: /(?<!\d)(1\d{2})\s*[-－]\s*0?1(?!\d)/g, offset: 0 },
  { pattern: /(?<!\d)(1\d{2})\s*[-－]\s*0?2(?!\d)/g, offset: 1 },
  { pattern: /(?<!\d)(1\d{2})\s*[-－]?\s*暑期/g, offset: 1 },
];

/**
 * 日期：民國「114/11/08」「110.11.20」「113 年 12 月 3 日」，西元「2018/03/10」「2019年3月23日」。
 * 第 1 組為年、第 3 或第 4 組為月；斜線與點號須成對出現（排除「110.5」等小數）。
 */
const DATES = /(?<!\d)(1\d{2}|20\d{2})\s*(?:([/.])\s*(\d{1,2})\s*\2\s*\d{1,2}(?!\d)|年\s*(\d{1,2})\s*月)/g;

function maxYear(years: number[]) {
  return years.length > 0 ? Math.max(...years) : undefined;
}

function explicitYear(text: string) {
  return maxYear(
    EXPLICIT_YEARS.flatMap(({ pattern, offset }) =>
      [...text.matchAll(pattern)].map((m) => Number(m[1]) + offset),
    ),
  );
}

/** 由日期推算招生學年度：8 月以後的日期屬下一學年度的招生（例：114/11/08 → 115），西元年先換算為民國年 */
function yearFromDates(text: string) {
  return maxYear(
    [...text.matchAll(DATES)].map((m) => {
      const year = Number(m[1]) > 1911 ? Number(m[1]) - 1911 : Number(m[1]);
      const month = Number(m[3] ?? m[4]);
      return month >= 8 ? year + 1 : year;
    }),
  );
}

/**
 * 招生相關文章所屬的招生年度（入學學年度；學期代碼依上方 EXPLICIT_YEARS 換算）。依序取：標題中明確標示的學年度 → 標題日期推算 →
 * 內文明確標示的學年度 → 內文日期推算；同一層有多個時取最大值。皆無法判讀時回傳 undefined。
 * 僅供判斷用，不改動文章內容。
 */
export function admissionYearOf(post: LegacyPost): number | undefined {
  const body = plainText(post.html);
  return (
    explicitYear(post.title) ??
    yearFromDates(post.title) ??
    explicitYear(body) ??
    yearFromDates(body)
  );
}

/**
 * 歷史招生公告：招生相關、且入學學年度早於 currentYear 的文章；無法判讀學年度者亦視為歷史公告。
 * @param currentYear 目前招生的入學學年度（src/content/home.ts 的 currentIntakeYear）
 */
export function isHistoricalAdmissionPost(post: LegacyPost, currentYear: number) {
  if (!isAdmissionPost(post)) return false;
  const year = admissionYearOf(post);
  return year === undefined || year < currentYear;
}

/* ------------------------------------------------------------------ */
/* Meta description                                                    */
/* ------------------------------------------------------------------ */

/**
 * ia.json 為頁面撰寫的 meta description（pages[].description／standalone[].description）。
 * 搬遷 HTML 開頭常是人名、影片說明或日期，自動摘要無法代表頁面時以此為準；未撰寫者回傳 undefined，
 * 由呼叫端退回內文摘要。
 */
export function pageDescription(slug: string): string | undefined {
  const description = findPage(slug)?.page.description?.trim();
  return description || undefined;
}

/** 扣除連結文字後，內文至少要有這麼多字，摘要才足以代表文章 */
const POST_EXCERPT_MIN_CHARS = 30;

/**
 * 文章的 meta description：內文摘要（最多 max 字）。連結型文章，或內文只有影片、日期與
 * 「相關文章」連結（扣除連結文字後不足 30 字）時，改用「標題｜學程正式名稱」，
 * 避免多篇影片文章得到相同的「日期＋連結」摘要。
 */
export function postDescription(post: LegacyPost, max = 110): string {
  const fallback = `${titleTag(post.title).text}｜${site.officialName}`;
  if (linkPostTarget(post)) return fallback;
  const ownText = plainText(post.html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, " "));
  if (Array.from(ownText).length < POST_EXCERPT_MIN_CHARS) return fallback;
  return plainText(post.html, max) || fallback;
}

/**
 * 「連結型」文章：內文僅有單一段落連結（原站以此轉貼其他文章或外部檔案）。
 * 回傳連結目標，否則為 undefined。
 */
export function linkPostTarget(
  post: LegacyPost,
): { href: string; label: string } | undefined {
  // 必須恰好只有一個連結：多個附件連結（例：.doc 與 .odt）的文章是一般內容頁
  if ((post.html.match(/<a/gi) ?? []).length !== 1) return undefined;
  const match = /^\s*<p>\s*<a\s+[^>]*?href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/p>\s*$/i.exec(
    post.html,
  );
  if (!match) return undefined;
  return { href: decodeEntities(match[1]), label: plainText(match[2]) };
}
