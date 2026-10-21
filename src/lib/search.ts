/**
 * 全站搜尋：索引格式與用戶端比對、排序、標示邏輯。
 *
 * 索引於建置時由 src/app/search-index.json/route.ts 產生為靜態 JSON（/search-index.json），
 * 搜尋視窗第一次開啟時才以 fetch(withBasePath("/search-index.json")) 載入。
 * 本檔會被 Client Component 匯入：只能放純函式，不得匯入 node:fs、@/lib/legacy 等伺服器模組。
 *
 * 比對規則：
 *  - 正規化：NFKC（全形英數轉半形）→ 小寫 →「臺」視同「台」→ 標點、符號與空白一律收合為單一空白。
 *  - 查詢依空白切成多個詞，每個詞都必須命中（AND）。
 *  - 含中日韓文字或以標點相連的詞：於去除空白的文字中做子字串比對（「A公司」可命中「A 公司」，
 *    「R&D」比對「rd」）。
 *  - 以英數字開頭的詞：須從單字開頭比對（「ai」命中「AI 伺服器」「AIoT」，不命中「chain」）。
 *    去除空白的文字中，單字開頭依原文判斷：「Hardware R&D」的「rd」、「Taiwan's」的「taiwans」皆位於單字開頭。
 *  - 計分：標題 > 分類 > 頁面說明 > 關鍵字 > 內文；同分時依類型、日期（新到舊）排序。
 */

import { site } from "@/lib/site";

/* ------------------------------------------------------------------ */
/* 索引格式                                                             */
/* ------------------------------------------------------------------ */

export type SearchType = "page" | "section" | "news" | "thesis";

export type SearchDoc = {
  type: SearchType;
  title: string;
  /**
   * 站內路徑（不含 basePath），例如 "/posts/123"、"/#features"。
   * 論文省略此欄，由 docHref() 依標題組成「歷屆畢業論文」頁的查詢網址（避免索引重複存放編碼後的標題）。
   */
  href?: string;
  /** 分類：頁面所屬單元、文章標籤（「活動」等）、論文學程 */
  category?: string;
  /** 頁面說明（ia.json 撰寫的 description／單元簡介） */
  description?: string;
  /** 關鍵字：文章所屬列表、論文研究生／指導教授／研究主題 */
  keywords?: string[];
  /** 內文純文字（文章截斷至約 800 字） */
  body?: string;
  /** 英文標題（論文；與標題同權重，顯示時標記 lang="en"） */
  titleEn?: string;
  /** 結果列的補充說明，例如「114 學年度 · 劉嘉容 · 指導教授 鄭正元」 */
  meta?: string;
  /** 排序用日期：文章為 YYYY-MM-DD，論文為學年度 */
  date?: string;
};

export type SearchIndex = {
  version: 1;
  docs: SearchDoc[];
};

export const SEARCH_INDEX_PATH = "/search-index.json";

/** 結果連結（不含 basePath，交給 next/link 或 router）；論文連到「歷屆畢業論文」頁並以 ?q= 預先篩選 */
export function docHref(doc: SearchDoc) {
  return doc.href ?? `${site.routes.theses}?q=${encodeURIComponent(doc.title)}`;
}

/** 結果類型：顯示名稱與分組順序 */
export const searchTypes: Record<SearchType, { label: string; order: number }> = {
  page: { label: "頁面", order: 0 },
  section: { label: "首頁區塊", order: 1 },
  news: { label: "最新消息", order: 2 },
  thesis: { label: "畢業論文", order: 3 },
};

export const searchTypeOrder: readonly SearchType[] = ["page", "section", "news", "thesis"];

/* ------------------------------------------------------------------ */
/* 正規化                                                               */
/* ------------------------------------------------------------------ */

// 以 RegExp 建構子撰寫 Unicode 屬性：tsconfig target 為 ES2017，字面值的 u 旗標會被型別檢查拒絕
const SEPARATORS = new RegExp("[\\p{P}\\p{S}\\p{Z}\\s]+", "gu");
const SEPARATOR_CHAR = new RegExp("^[\\p{P}\\p{S}\\p{Z}\\s]$", "u");
const ASCII_WORD_CHAR = /[a-z0-9]/;
const NON_ASCII = /[^\x00-\x7f]/;

/**
 * NFKC → 小寫 →「臺」視同「台」（NFKC 不統一這組異體字；兩者皆為單一 UTF-16 字元，位置對應不變）。
 * 與「歷屆畢業論文」頁篩選（ThesesFilter 的 fold）相同，兩處搜尋結果一致。
 */
function fold(text: string) {
  return text.normalize("NFKC").toLowerCase().replaceAll("臺", "台");
}

/** fold → 標點、符號與空白收合為單一空白 */
export function normalize(text: string) {
  return fold(text).replace(SEPARATORS, " ").trim();
}

export type SearchTerm = {
  /** 正規化後的詞（不含空白） */
  text: string;
  /**
   * 於去除空白的文字中比對：含中文等非 ASCII 字元，或原詞以標點相連
   * （「R&D」→「rd」、「Chin-Yang」→「chinyang」，避免拆成單一字母而命中過多）
   */
  compact: boolean;
  /** 以英數字開頭：須位於單字開頭（「ai」不命中「chain」、「a公司」不命中「NVIDIA公司」） */
  wordStart: boolean;
};

/** 查詢字串 → 比對詞：依空白切開，去除重複，最多 8 個 */
export function parseQuery(query: string): SearchTerm[] {
  const seen = new Set<string>();
  const terms: SearchTerm[] = [];
  for (const token of query.split(/\s+/)) {
    const spaced = normalize(token);
    const text = spaced.replaceAll(" ", "");
    if (!text || seen.has(text)) continue;
    seen.add(text);
    terms.push({
      text,
      compact: NON_ASCII.test(text) || spaced.includes(" "),
      wordStart: ASCII_WORD_CHAR.test(text[0]),
    });
    if (terms.length === 8) break;
  }
  return terms;
}

/* ------------------------------------------------------------------ */
/* 比對與計分                                                           */
/* ------------------------------------------------------------------ */

type Field = {
  /** 正規化後（保留單一空白） */
  spaced: string;
  /** 正規化後去除空白 */
  compact: string;
  /** compact 每個位置在 spaced 中是否為單字開頭（1：前一字元為空白、非英數字或位於開頭） */
  compactWordStart: Uint8Array;
};

/** spaced 的第 i 個字元是否位於單字開頭 */
function isSpacedWordStart(spaced: string, i: number) {
  return i === 0 || !ASCII_WORD_CHAR.test(spaced[i - 1]);
}

function prepareField(text: string | undefined): Field {
  const spaced = text ? normalize(text) : "";
  const compactWordStart = new Uint8Array(spaced.length);
  let length = 0;
  for (let i = 0; i < spaced.length; i += 1) {
    if (spaced[i] === " ") continue;
    compactWordStart[length] = isSpacedWordStart(spaced, i) ? 1 : 0;
    length += 1;
  }
  return {
    spaced,
    compact: spaced.replaceAll(" ", ""),
    compactWordStart: compactWordStart.subarray(0, length),
  };
}

/**
 * 於字串中找出詞的起點；英數字詞須位於單字開頭。
 * @param wordStarts 去除空白的字串須傳入（compactWordStart）：其中相鄰的字元在原文可能以空白或標點分隔，
 *   不能以前一個字元判斷（「industrial sd-wan」→「industrialsdwan」，「sdwan」前一字元為「l」）
 */
function findTerm(
  haystack: string,
  term: string,
  wordStart: boolean,
  from = 0,
  wordStarts?: ArrayLike<number>,
) {
  let at = haystack.indexOf(term, from);
  if (!wordStart) return at;
  const isStart = (index: number) =>
    wordStarts ? wordStarts[index] === 1 : isSpacedWordStart(haystack, index);
  while (at !== -1 && !isStart(at)) {
    at = haystack.indexOf(term, at + 1);
  }
  return at;
}

function fieldHas(field: Field, term: SearchTerm) {
  if (!term.compact) return findTerm(field.spaced, term.text, true) !== -1;
  // 「a公司」：原文「以A公司」（無空白）或「A 公司」（有空白）皆可命中；
  // 「sdwan」「rd」命中原文的「SD-WAN」「R&D」
  return findTerm(field.compact, term.text, term.wordStart, 0, field.compactWordStart) !== -1;
}

export type PreparedDoc = {
  doc: SearchDoc;
  /** 於索引中的順序（同分時的最後依據） */
  position: number;
  title: Field;
  titleEn: Field;
  category: Field;
  description: Field;
  keywords: Field;
  body: Field;
};

/** 載入索引後一次完成正規化，之後每次輸入只做字串比對 */
export function prepareIndex(index: SearchIndex): PreparedDoc[] {
  return index.docs.map((doc, position) => ({
    doc,
    position,
    title: prepareField(doc.title),
    titleEn: prepareField(doc.titleEn),
    category: prepareField(doc.category),
    description: prepareField(doc.description),
    keywords: prepareField(doc.keywords?.join(" ")),
    body: prepareField(doc.body),
  }));
}

const WEIGHT = {
  title: 10,
  titleStart: 2,
  category: 5,
  description: 4,
  keywords: 3,
  body: 1,
  exactTitle: 20,
  phraseInTitle: 5,
} as const;

/** 每個詞都必須命中，否則回傳 0；同一詞只計最高權重的欄位 */
function scoreDoc(item: PreparedDoc, terms: readonly SearchTerm[], phrase: string) {
  let score = 0;
  for (const term of terms) {
    if (fieldHas(item.title, term) || fieldHas(item.titleEn, term)) {
      score += WEIGHT.title;
      if (item.title.compact.startsWith(term.text)) score += WEIGHT.titleStart;
    } else if (fieldHas(item.category, term)) {
      score += WEIGHT.category;
    } else if (fieldHas(item.description, term)) {
      score += WEIGHT.description;
    } else if (fieldHas(item.keywords, term)) {
      score += WEIGHT.keywords;
    } else if (fieldHas(item.body, term)) {
      score += WEIGHT.body;
    } else {
      return 0;
    }
  }
  if (item.title.compact === phrase) score += WEIGHT.exactTitle;
  else if (terms.length > 1 && item.title.compact.includes(phrase)) score += WEIGHT.phraseInTitle;
  return score;
}

export type SearchHit = { doc: SearchDoc; score: number };

/** 依分數排序的所有命中結果；同分時依類型（頁面優先）、日期（新到舊）、索引順序 */
export function search(items: readonly PreparedDoc[], terms: readonly SearchTerm[]): SearchHit[] {
  if (terms.length === 0) return [];
  const phrase = terms.map((term) => term.text).join("");
  const scored: Array<{ item: PreparedDoc; score: number }> = [];
  for (const item of items) {
    const score = scoreDoc(item, terms, phrase);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      searchTypes[a.item.doc.type].order - searchTypes[b.item.doc.type].order ||
      (b.item.doc.date ?? "").localeCompare(a.item.doc.date ?? "") ||
      a.item.position - b.item.position,
  );
  return scored.map(({ item, score }) => ({ doc: item.doc, score }));
}

/**
 * 搜尋視窗的精選結果：依分數挑選，每種類型最多 perType 筆，避免單一類型（如論文）佔滿；
 * 不足 limit 筆時再依序補上其餘結果。
 */
export function topHits(hits: readonly SearchHit[], limit = 8, perType = 4): SearchHit[] {
  const picked = new Set<SearchHit>();
  const counts = new Map<SearchType, number>();
  for (const hit of hits) {
    if (picked.size === limit) break;
    const count = counts.get(hit.doc.type) ?? 0;
    if (count >= perType) continue;
    counts.set(hit.doc.type, count + 1);
    picked.add(hit);
  }
  for (const hit of hits) {
    if (picked.size === limit) break;
    picked.add(hit);
  }
  return hits.filter((hit) => picked.has(hit));
}

export type SearchGroup = { type: SearchType; label: string; hits: SearchHit[] };

/**
 * 依類型分組。order = "rank"：群組依其最佳結果的名次排列（搜尋視窗，最相關者在最上方）；
 * order = "type"：固定依頁面、首頁區塊、最新消息、畢業論文排列（搜尋結果頁）。
 */
export function groupHits(hits: readonly SearchHit[], order: "rank" | "type" = "rank"): SearchGroup[] {
  const groups = new Map<SearchType, SearchGroup>();
  for (const hit of hits) {
    const { type } = hit.doc;
    let group = groups.get(type);
    if (!group) {
      group = { type, label: searchTypes[type].label, hits: [] };
      groups.set(type, group);
    }
    group.hits.push(hit);
  }
  const list = [...groups.values()];
  if (order === "type") list.sort((a, b) => searchTypes[a.type].order - searchTypes[b.type].order);
  return list;
}

/* ------------------------------------------------------------------ */
/* 標示與摘要                                                           */
/* ------------------------------------------------------------------ */

export type TextSegment = { text: string; hit: boolean };

type MappedText = {
  spaced: string;
  /** spaced 每個字元對應的原文範圍（UTF-16 位置） */
  spacedStart: number[];
  spacedEnd: number[];
  compact: string;
  compactStart: number[];
  compactEnd: number[];
  /** 同 Field.compactWordStart */
  compactWordStart: number[];
};

/**
 * 逐字正規化並記錄與原文的位置對應，供標示命中文字（只用於畫面上的少量文字）。
 * 與 normalize() 的差異僅在組合字元序列等罕見情形。
 */
function mapText(text: string): MappedText {
  let spaced = "";
  const spacedStart: number[] = [];
  const spacedEnd: number[] = [];
  let offset = 0;
  for (const char of text) {
    const start = offset;
    const end = offset + char.length;
    offset = end;
    for (const unit of fold(char)) {
      if (SEPARATOR_CHAR.test(unit)) {
        if (spaced !== "" && !spaced.endsWith(" ")) {
          spaced += " ";
          spacedStart.push(start);
          spacedEnd.push(end);
        }
        continue;
      }
      for (let i = 0; i < unit.length; i += 1) {
        spaced += unit[i];
        spacedStart.push(start);
        spacedEnd.push(end);
      }
    }
  }

  let compact = "";
  const compactStart: number[] = [];
  const compactEnd: number[] = [];
  const compactWordStart: number[] = [];
  for (let i = 0; i < spaced.length; i += 1) {
    if (spaced[i] === " ") continue;
    compact += spaced[i];
    compactStart.push(spacedStart[i]);
    compactEnd.push(spacedEnd[i]);
    compactWordStart.push(isSpacedWordStart(spaced, i) ? 1 : 0);
  }
  return { spaced, spacedStart, spacedEnd, compact, compactStart, compactEnd, compactWordStart };
}

/** 所有命中位置（原文 UTF-16 範圍，已排序並合併重疊）；比對方式與 fieldHas 相同 */
function hitRanges(mapped: MappedText, terms: readonly SearchTerm[]) {
  const ranges: Array<[number, number]> = [];
  const collect = (
    haystack: string,
    starts: number[],
    ends: number[],
    term: SearchTerm,
    wordStarts?: ArrayLike<number>,
  ) => {
    let at = findTerm(haystack, term.text, term.wordStart, 0, wordStarts);
    while (at !== -1) {
      ranges.push([starts[at], ends[at + term.text.length - 1]]);
      at = findTerm(haystack, term.text, term.wordStart, at + term.text.length, wordStarts);
    }
  };
  for (const term of terms) {
    if (term.compact) {
      collect(mapped.compact, mapped.compactStart, mapped.compactEnd, term, mapped.compactWordStart);
    } else {
      collect(mapped.spaced, mapped.spacedStart, mapped.spacedEnd, term);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** 將文字切成一般／命中片段，交由元件以 <mark> 呈現（不使用 innerHTML） */
export function highlight(text: string, terms: readonly SearchTerm[]): TextSegment[] {
  if (!text || terms.length === 0) return text ? [{ text, hit: false }] : [];
  const ranges = hitRanges(mapText(text), terms);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), hit: false });
    segments.push({ text: text.slice(start, end), hit: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false });
  return segments;
}

/** 避免切在代理對（表情符號等）中間 */
function safeIndex(text: string, index: number) {
  const code = text.charCodeAt(index);
  return code >= 0xdc00 && code <= 0xdfff ? index - 1 : index;
}

/**
 * 摘要：自第一個命中處前約 lead 字開始，長度約 length 字；文字中沒有命中時回傳 undefined。
 * 截斷處補上「…」。
 */
export function excerptAround(
  text: string | undefined,
  terms: readonly SearchTerm[],
  length = 110,
  lead = 24,
): string | undefined {
  if (!text || terms.length === 0) return undefined;
  const first = hitRanges(mapText(text), terms)[0];
  if (!first) return undefined;
  let start = Math.max(0, first[0] - lead);
  // 盡量從句讀或空白之後開始，讀起來較自然
  const boundary = text.slice(start, first[0]).search(/[。！？；，、\s][^。！？；，、\s]*$/);
  if (start > 0 && boundary !== -1) start += boundary + 1;
  start = safeIndex(text, start);
  const end = safeIndex(text, Math.min(text.length, start + length));
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

/** 摘要退回：文字開頭約 length 字 */
export function excerptStart(text: string | undefined, length = 110): string | undefined {
  if (!text) return undefined;
  if (text.length <= length) return text;
  return `${text.slice(0, safeIndex(text, length)).trimEnd()}…`;
}

/** 結果列的摘要：內文命中處 → 說明命中處 → 說明開頭 → 內文開頭 */
export function hitExcerpt(doc: SearchDoc, terms: readonly SearchTerm[], length = 110) {
  return (
    excerptAround(doc.body, terms, length) ??
    excerptAround(doc.description, terms, length) ??
    excerptStart(doc.description, length) ??
    excerptStart(doc.body, length)
  );
}

/** 搜尋結果頁網址（不含 basePath，交給 next/link 或 router） */
export function searchPageHref(query: string) {
  const trimmed = query.trim();
  return trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search";
}
