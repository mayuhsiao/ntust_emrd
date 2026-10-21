/**
 * 搬遷內容 HTML 的伺服器端字串改寫（建置時執行一次，結果直接進入靜態 HTML）。
 *
 * 搬遷腳本已以白名單清洗標籤與屬性，本檔只做版面與無障礙層面的調整：
 *  1. 過長的 h2–h4（原站常把整段內文設成標題）降為段落，維持標題大綱可讀
 *  2. 連續 3 張以上的 <figure> 包成 .legacy-gallery 相簿格線
 *  3. 表格分類：資料表包進可左右捲動、可聚焦的 region（名稱取自 <caption> 或前方的段落標題；
 *     實際無須捲動時由 LegacyTableRegions 於瀏覽器端移除 region 與 tabindex）；
 *     排版用表格標為 role="presentation"
 *  4. 站內點陣圖改用 next/image 的最佳化網址（srcset／sizes）；寬高取自 HTML 的 width／height 屬性
 *     （搬遷腳本寫入），渲染時不讀取 public/ 內的檔案
 *  5. 外部連結另開新視窗並提示；只有圖片的連結補上可辨識的替代文字；非 http(s)／mailto／tel
 *     或相對網址的 href 一律移除；iframe 補 title 與延遲載入；YouTube 嵌入改為點擊後才載入播放器；
 *     本機 mp4 改為原生 <video>
 *  6. 子路徑部署（GitHub Pages 預覽版，src/lib/basePath.ts）：站內根路徑的 href／src／srcset
 *     一律加上 basePath；正式網域部署時 basePath 為空字串，輸出與原本完全相同
 */
import { getImageProps } from "next/image";
import { basePath, withBasePath } from "@/lib/basePath";
import { decodeEntities, plainText } from "@/lib/legacy";
import { site } from "@/lib/site";
import { TABLE_REGION_ATTR } from "./legacyTableRegion";

/* ------------------------------------------------------------------ */
/* 屬性解析                                                            */
/* ------------------------------------------------------------------ */

type Attr = { name: string; value?: string };

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(source: string): Attr[] {
  const attrs: Attr[] = [];
  for (const match of source.matchAll(ATTR)) {
    attrs.push({ name: match[1].toLowerCase(), value: match[2] ?? match[3] ?? match[4] });
  }
  return attrs;
}

function getAttr(attrs: Attr[], name: string) {
  return attrs.find((attr) => attr.name === name)?.value;
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * 原始屬性值保持既有的字元參照（不重複跳脫 &），但一律以雙引號輸出：原本以單引號包住、
 * 值內含 " 的屬性（搬遷腳本的 BeautifulSoup 會如此輸出）必須把 " 與 < 轉為參照，才不會提早結束屬性。
 * 新增或改寫的值以 raw: false 交由 escapeAttr 完整跳脫。
 */
function serializeAttrs(attrs: Array<Attr & { raw?: boolean }>) {
  return attrs
    .map(({ name, value, raw = true }) =>
      value === undefined
        ? ` ${name}`
        : ` ${name}="${raw ? value.replace(/"/g, "&quot;").replace(/</g, "&lt;") : escapeAttr(value)}"`,
    )
    .join("");
}

/**
 * 連結與嵌入網址的協定白名單（縱深防禦；搬遷腳本已先過濾）。瀏覽器解析網址時會移除 tab、換行等
 * 控制字元並解碼字元參照，因此先解碼、去除控制字元與空白再判斷：只接受 http(s)、mailto、tel，
 * 或第一個 / ? # 之前沒有冒號與未解碼字元參照的相對網址（含 #錨點）。
 */
function isSafeUrl(value: string) {
  const url = decodeEntities(value).replace(/[\u0000- \u007f]+/g, "");
  if (/^(?:https?|mailto|tel):/i.test(url)) return true;
  const head = url.split(/[/?#]/, 1)[0];
  return !/[:&]/.test(head);
}

function setAttr(attrs: Array<Attr & { raw?: boolean }>, name: string, value: string) {
  const existing = attrs.find((attr) => attr.name === name);
  if (existing) {
    existing.value = value;
    existing.raw = false;
  } else {
    attrs.push({ name, value, raw: false });
  }
}

/** 站內根路徑（/legacy/…、/posts/…）：以單一「/」開頭，排除 protocol-relative 的「//」 */
function isRootRelative(url: string) {
  return url.startsWith("/") && !url.startsWith("//");
}

/**
 * 為原始屬性值中的站內根路徑加上 basePath（6.）。只在開頭加上前綴，既有的字元參照維持原樣
 * （raw 旗標不變，不會重複跳脫 &amp;）；srcset 逐一處理每個候選網址。basePath 為空時不改動。
 */
function prefixUrlAttrs(attrs: Array<Attr & { raw?: boolean }>, names: readonly string[]) {
  if (!basePath) return false;
  let changed = false;
  for (const attr of attrs) {
    if (attr.value === undefined || !names.includes(attr.name)) continue;
    const value =
      attr.name === "srcset"
        ? attr.value
            .split(",")
            .map((candidate) => {
              const trimmed = candidate.trim();
              return isRootRelative(trimmed) ? candidate.replace(trimmed, withBasePath(trimmed)) : candidate;
            })
            .join(",")
        : isRootRelative(attr.value.trim())
          ? withBasePath(attr.value.trim())
          : attr.value;
    if (value !== attr.value) {
      attr.value = value;
      changed = true;
    }
  }
  return changed;
}

/* ------------------------------------------------------------------ */
/* 1. 過長標題降為段落                                                  */
/* ------------------------------------------------------------------ */

const HEADING_MAX_CHARS = 60;

function demoteLongHeadings(html: string) {
  return html.replace(
    /<(h[2-4])(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (whole, _tag: string, attrSource: string | undefined, inner: string) => {
      if (Array.from(plainText(inner)).length <= HEADING_MAX_CHARS) return whole;
      // 保留錨點 id 等既有屬性（站內「#legacy-n」連結仍可跳轉）
      const attrs: Array<Attr & { raw?: boolean }> = parseAttrs(attrSource ?? "");
      const className = getAttr(attrs, "class");
      setAttr(attrs, "class", className ? `legacy-lead ${className}` : "legacy-lead");
      return `<p${serializeAttrs(attrs)}>${inner}</p>`;
    },
  );
}

/* ------------------------------------------------------------------ */
/* 2. 相簿格線                                                          */
/* ------------------------------------------------------------------ */

const GALLERY_MIN = 3;
const GALLERY_MARK = "data-legacy-gallery";

function wrapGalleries(html: string) {
  // 每個 figure 內不得跨越 </figure>，確保只合併「緊鄰」的圖片
  const figure = String.raw`<figure\b[^>]*>(?:(?!<\/figure>)[\s\S])*<\/figure>\s*`;
  const run = new RegExp(`(?:${figure}){${GALLERY_MIN},}`, "gi");
  return html.replace(run, (figures) => {
    const marked = figures.replace(/<img\b/gi, `<img ${GALLERY_MARK}`);
    return `<div class="legacy-gallery">${marked.trim()}</div>`;
  });
}

/* ------------------------------------------------------------------ */
/* 3. 表格分類                                                          */
/* ------------------------------------------------------------------ */

type CellTag = { open: [number, number]; close?: [number, number]; tag: "td" | "th"; attrs: string };

type TableInfo = {
  open: [number, number];
  close?: [number, number];
  attrs: string;
  rows: number;
  maxCells: number;
  currentCells: number;
  nested: number;
  media: number;
  hasTh: boolean;
  firstRow: CellTag[];
  inFirstRow: boolean;
  openCell?: CellTag;
};

type Edit = { start: number; end: number; text: string };

const TABLE_TOKEN = /<(\/?)(table|tr|td|th|img|iframe|video)\b([^>]*)>/gi;

function tableSizeClass(cols: number) {
  if (cols >= 5) return "l";
  if (cols >= 3) return "m";
  return undefined;
}

function classifyTables(html: string) {
  const stack: TableInfo[] = [];
  const done: TableInfo[] = [];

  for (const match of html.matchAll(TABLE_TOKEN)) {
    const start = match.index;
    const end = start + match[0].length;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const current = stack.at(-1);

    if (tag === "table") {
      if (!closing) {
        stack.push({
          open: [start, end],
          attrs: match[3],
          rows: 0,
          maxCells: 0,
          currentCells: 0,
          nested: 0,
          media: 0,
          hasTh: false,
          firstRow: [],
          inFirstRow: false,
        });
      } else if (current) {
        current.close = [start, end];
        stack.pop();
        done.push(current);
        const parent = stack.at(-1);
        if (parent) parent.nested += 1;
      }
      continue;
    }

    if (tag === "img" || tag === "iframe" || tag === "video") {
      if (!closing) for (const table of stack) table.media += 1;
      continue;
    }

    if (!current) continue;

    if (tag === "tr") {
      if (!closing) {
        current.rows += 1;
        current.currentCells = 0;
        current.inFirstRow = current.rows === 1;
      } else {
        current.inFirstRow = false;
      }
      continue;
    }

    // td / th
    if (!closing) {
      current.currentCells += 1;
      current.maxCells = Math.max(current.maxCells, current.currentCells);
      if (tag === "th") current.hasTh = true;
      if (current.inFirstRow) {
        const cell: CellTag = { open: [start, end], tag: tag as "td" | "th", attrs: match[3] };
        current.firstRow.push(cell);
        current.openCell = cell;
      }
    } else if (current.openCell && current.inFirstRow) {
      current.openCell.close = [start, end];
      current.openCell = undefined;
    }
  }

  return done.filter((table) => table.close);
}

/** 表格名稱的長度上限（完整標題仍在 caption 或段落標題中） */
const TABLE_NAME_MAX = 40;
/** 搬遷腳本為站內錨點（#legacy-…）加上 id 的段落或標題 */
const ANCHOR_BLOCK = /<(h[2-6]|p)\b[^>]*\bid\s*=\s*["']?legacy-[^>]*>([\s\S]*?)<\/\1>/gi;
const HEADING_BLOCK = /<(h[2-4])\b[^>]*>([\s\S]*?)<\/\1>/gi;
const CAPTION = /^\s*<caption\b[^>]*>([\s\S]*?)<\/caption>/i;

function lastMatch(pattern: RegExp, source: string) {
  let last: RegExpMatchArray | undefined;
  for (const match of source.matchAll(pattern)) last = match;
  return last;
}

/**
 * 資料表捲動外框的名稱：表格的 <caption>；否則為上一個資料表之後、最接近的錨點段落
 * （只取第一行，例如「105學年度畢業 (11位)」「產業界 I」）或標題；都沒有時為「表格 N」。
 */
function tableName(captionHtml: string | undefined, before: string, index: number) {
  const firstLine = (fragment: string | undefined) =>
    fragment === undefined ? "" : plainText(fragment.split(/<br\b[^>]*>/i)[0], TABLE_NAME_MAX);
  return (
    (captionHtml === undefined ? "" : plainText(captionHtml, TABLE_NAME_MAX)) ||
    firstLine(lastMatch(ANCHOR_BLOCK, before)?.[2]) ||
    firstLine(lastMatch(HEADING_BLOCK, before)?.[2]) ||
    `表格 ${index}`
  );
}

function rewriteTables(html: string) {
  const tables = classifyTables(html);
  if (tables.length === 0) return html;

  const edits: Edit[] = [];
  const names = new Set<string>();
  let dataIndex = 0;
  let previousEnd = 0;

  // 依開始位置處理：表格名稱只往前找到上一個資料表為止，同頁名稱重複時附上序號
  for (const table of [...tables].sort((a, b) => a.open[0] - b.open[0])) {
    const close = table.close as [number, number];
    const isData =
      table.rows >= 2 && table.maxCells >= 2 && table.nested === 0 && table.media === 0;

    if (!isData) {
      edits.push({
        start: table.open[0],
        end: table.open[1],
        text: `<table role="presentation" class="legacy-layout">`,
      });
      continue;
    }

    dataIndex += 1;
    const caption = CAPTION.exec(html.slice(table.open[1], close[0]))?.[1];
    const baseName = tableName(caption, html.slice(previousEnd, table.open[0]), dataIndex);
    const name = names.has(baseName) ? `${baseName}（表格 ${dataIndex}）` : baseName;
    names.add(name);
    previousEnd = close[1];
    const label = `${name}（可左右捲動）`;

    const size = tableSizeClass(table.maxCells);
    const attrs = parseAttrs(table.attrs).filter((attr) => attr.name !== "class");
    if (size) setAttr(attrs, "data-size", size);
    // 一律輸出 region／tabindex（未執行 JavaScript 時仍可用鍵盤捲動）；
    // 瀏覽器端的 LegacyTableRegions 會在表格不需要捲動時移除，需要時以 TABLE_REGION_ATTR 的名稱補回
    const region = serializeAttrs([
      { name: "class", value: "legacy-table", raw: false },
      { name: "role", value: "region", raw: false },
      { name: "aria-label", value: label, raw: false },
      { name: "tabindex", value: "0", raw: false },
      { name: TABLE_REGION_ATTR, value: label, raw: false },
    ]);
    edits.push({
      start: table.open[0],
      end: table.open[1],
      text: `<div${region}><table${serializeAttrs(attrs)}>`,
    });
    edits.push({ start: close[1], end: close[1], text: "</div>" });

    // 第一列：沒有任何 th 的資料表，若第一列欄數完整且無合併儲存格，視為欄標題
    const cells = table.firstRow;
    const promote =
      !table.hasTh &&
      cells.length === table.maxCells &&
      cells.every((cell) => cell.close && !/\b(?:col|row)span\s*=/i.test(cell.attrs)) &&
      cells.every((cell) => {
        const inner = html.slice(cell.open[1], cell.close?.[0]);
        return plainText(inner).length > 0;
      });

    for (const cell of cells) {
      if (promote && cell.close) {
        edits.push({ start: cell.open[0], end: cell.open[1], text: `<th scope="col"${cell.attrs}>` });
        edits.push({ start: cell.close[0], end: cell.close[1], text: "</th>" });
      } else if (cell.tag === "th" && !/\bscope\s*=/i.test(cell.attrs)) {
        edits.push({ start: cell.open[0], end: cell.open[1], text: `<th scope="col"${cell.attrs}>` });
      }
    }
  }

  // 由後往前套用；同一位置先替換既有標籤，再插入（插入內容會落在替換結果之前）
  edits.sort((a, b) => b.start - a.start || b.end - b.start - (a.end - a.start));
  let output = html;
  for (const edit of edits) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
}

/* ------------------------------------------------------------------ */
/* 4–5. 圖片、連結與嵌入                                                */
/* ------------------------------------------------------------------ */

const SITE_HOST = new URL(site.url).host;
const OPTIMIZABLE = /\.(?:jpe?g|png|webp)$/i;
/** 內容欄寬：lg 以上為 12 欄格線的 9 欄（約 900px） */
const CONTENT_SIZES = "(min-width: 1280px) 900px, (min-width: 1024px) 70vw, 100vw";
const GALLERY_SIZES = "(min-width: 1280px) 440px, (min-width: 640px) 45vw, 100vw";
/** 顯示寬度在此以下時改用 1x／2x 密度描述，不需 sizes */
const FIXED_WIDTH_MAX = 640;
const NEW_WINDOW = "（另開新視窗）";

function isExternalHref(href: string) {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return new URL(href).host !== SITE_HOST;
  } catch {
    return true;
  }
}

function toInt(value: string | undefined) {
  if (!value) return undefined;
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function rewriteImage(attrSource: string, eager: boolean) {
  const attrs: Array<Attr & { raw?: boolean }> = parseAttrs(attrSource);
  const inGallery = attrs.some((attr) => attr.name === GALLERY_MARK);
  const rest = attrs.filter((attr) => attr.name !== GALLERY_MARK);
  const rawSrc = getAttr(rest, "src") ?? "";
  const src = decodeEntities(rawSrc);
  const alt = decodeEntities(getAttr(rest, "alt") ?? "");

  const loading = eager ? undefined : ("lazy" as const);
  const optimizable =
    src.startsWith("/legacy/") && OPTIMIZABLE.test(src) && !src.includes("..");
  // 顯示寬高：搬遷腳本寫入 HTML 的 width／height（依原圖比例）。CSS 為 height: auto，
  // height 屬性只用來在載入前保留版面比例，與原圖比例略有出入也不會變形
  const width = toInt(getAttr(rest, "width"));
  const height = toInt(getAttr(rest, "height"));

  if (optimizable && width) {
    const sizes = inGallery
      ? GALLERY_SIZES
      : width > FIXED_WIDTH_MAX
        ? CONTENT_SIZES
        : undefined;

    // srcset 只取決於寬度；缺高度時以寬度暫代以通過檢查，輸出時不寫入 height
    // next/image 不會替字串 src 加上 basePath（basePath.md「Images」），需自行加上
    const { props } = getImageProps({
      src: withBasePath(src),
      alt,
      width,
      height: height ?? width,
      sizes,
      loading: eager ? "eager" : "lazy",
      decoding: "async",
    });
    const output: Array<Attr & { raw?: boolean }> = [
      { name: "alt", value: alt, raw: false },
      { name: "src", value: props.src, raw: false },
    ];
    if (props.srcSet) output.push({ name: "srcset", value: props.srcSet, raw: false });
    if (props.sizes) output.push({ name: "sizes", value: props.sizes, raw: false });
    output.push({ name: "width", value: String(width), raw: false });
    if (height) output.push({ name: "height", value: String(height), raw: false });
    if (loading) output.push({ name: "loading", value: loading, raw: false });
    output.push({ name: "decoding", value: "async", raw: false });
    return `<img${serializeAttrs(output)}>`;
  }

  // 外部圖片、非點陣格式或 HTML 未提供寬度：保留原始屬性（原圖直接輸出），補上延遲載入
  prefixUrlAttrs(rest, ["src", "srcset"]);
  if (loading) setAttr(rest, "loading", loading);
  setAttr(rest, "decoding", "async");
  return `<img${serializeAttrs(rest)}>`;
}

function rewriteIframe(attrSource: string): { open: string; videoSrc?: string } {
  const attrs: Array<Attr & { raw?: boolean }> = parseAttrs(attrSource);
  const src = decodeEntities(getAttr(attrs, "src") ?? "");

  // 本機影片檔：原生播放器，不自動播放，只預先載入中繼資料
  if (/^\/legacy\/.+\.(?:mp4|webm|m4v)$/i.test(src)) {
    const output: Array<Attr & { raw?: boolean }> = [
      { name: "class", value: "legacy-video", raw: false },
      // #t=0.1：僅預載中繼資料時仍顯示第一個畫格作為封面
      { name: "src", value: `${withBasePath(src)}#t=0.1`, raw: false },
      { name: "controls" },
      { name: "playsinline" },
      { name: "preload", value: "metadata", raw: false },
    ];
    return { open: `<video${serializeAttrs(output)}>`, videoSrc: withBasePath(src) };
  }

  const isCalendar = /^https:\/\/calendar\.google\.com\//i.test(src);
  const title = getAttr(attrs, "title");
  if (!title || !title.trim()) setAttr(attrs, "title", isCalendar ? "嵌入日曆" : "嵌入影片");
  setAttr(attrs, "loading", "lazy");
  setAttr(attrs, "referrerpolicy", "strict-origin-when-cross-origin");
  // 搬遷資料可能帶有固定高度，交由 CSS 依比例縮放；不安全的協定（javascript: 等）不輸出 src
  const cleaned = attrs.filter(
    (attr) =>
      attr.name !== "height" &&
      attr.name !== "width" &&
      attr.name !== "srcdoc" &&
      !(attr.name === "src" && !isSafeUrl(attr.value ?? "")),
  );
  setAttr(cleaned, "class", isCalendar ? "legacy-embed legacy-embed--calendar" : "legacy-embed");

  // YouTube：先顯示縮圖與播放鈕（srcdoc），點擊後才在框內載入播放器並自動播放，
  // 避免每頁一進來就下載約 1 MB 的播放器。影片代碼限定 [\w-]{11}，無法注入標記；保留 src 與 title
  const youtube = YOUTUBE_EMBED.exec(src);
  if (youtube) {
    const start = youtubeStart(src);
    setAttr(cleaned, "srcdoc", youtubeFacade(youtube[1], /^\d+$/.test(start) ? start : undefined));
    setAttr(cleaned, "allow", "autoplay; encrypted-media; picture-in-picture");
  }
  return { open: `<iframe${serializeAttrs(cleaned)}>` };
}

const YOUTUBE_EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})(?=[?#]|$)/;

function youtubeStart(src: string) {
  try {
    return new URL(src).searchParams.get("start") ?? "";
  } catch {
    return "";
  }
}

/** srcdoc 內的播放畫面：整個框為一個連結（替代文字「播放影片」），縮圖裁成 16:9、置中播放鈕 */
function youtubeFacade(id: string, start?: string) {
  const play = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&amp;start=${start}` : ""}`;
  return [
    `<!doctype html><html lang="zh-Hant-TW"><style>`,
    `*{box-sizing:border-box;margin:0;padding:0}`,
    `html,body{height:100%;overflow:hidden;background:#001a36}`,
    `a{position:relative;display:block;height:100%}`,
    `img{display:block;width:100%;height:100%;object-fit:cover;color:#fff;font:16px/1.5 sans-serif}`,
    `span{position:absolute;top:50%;left:50%;width:68px;height:48px;margin:-24px 0 0 -34px;border-radius:14px;background:rgba(0,26,54,.85);transition:background-color .2s}`,
    `span::after{content:"";position:absolute;top:13px;left:26px;border-style:solid;border-width:11px 0 11px 19px;border-color:transparent transparent transparent #fff}`,
    `a:hover span,a:focus-visible span{background:#e00}`,
    `a:focus-visible{outline:3px solid #fff;outline-offset:-6px}`,
    `</style>`,
    `<a href="${play}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="播放影片"><span></span></a>`,
  ].join("");
}

/* ------------------------------------------------------------------ */
/* 只有圖片的連結：補上可辨識的替代文字                                   */
/* ------------------------------------------------------------------ */

/** 原站的占位替代文字（與搬遷腳本的判斷一致） */
const JUNK_ALT = /^(?:圖片|圖|pic|p|img|image|photo|event|link|\(\w+\)|\d{1,3})$/i;
const IMAGE_LINK = /<a\b([^>]*)>(\s*)<img\b([^>]*)>(\s*)<\/a>/gi;

/** 連結目的：有意義的 title → 站內原尺寸圖片 → 已知網站 → 網域 */
function imageLinkPurpose(anchorAttrs: Attr[]) {
  const title = decodeEntities(getAttr(anchorAttrs, "title") ?? "").trim();
  if (title && !/^(?:link|page|圖片)$/i.test(title) && !/另開新視窗/.test(title)) return title;

  const href = decodeEntities(getAttr(anchorAttrs, "href") ?? "");
  if (/^\/legacy\/img\//i.test(href)) return "檢視原尺寸圖片";
  let url: URL;
  try {
    url = new URL(href, site.url);
  } catch {
    return "";
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtube.com" && /^\/(?:channel|c|user|@)/.test(url.pathname)) return "EMRD YouTube 頻道";
  if (host === "facebook.com" && /^\/EMRDofNTUST\b/i.test(url.pathname)) return "EMRD Facebook 粉絲專頁";
  if (host === "forms.gle" || (host === "docs.google.com" && url.pathname.startsWith("/forms/"))) {
    return "活動報名表單";
  }
  return host;
}

/**
 * 連結內只有一張圖片、而圖片的替代文字為空或占位字（如「圖片」「4」「EVENT」）時，
 * 改寫圖片的 alt 作為連結名稱。不在 <a> 加 aria-label，以免蓋過外部連結的「（另開新視窗）」提示。
 */
function nameImageLinks(html: string) {
  return html.replace(
    IMAGE_LINK,
    (whole, anchorSource: string, lead: string, imageSource: string, trail: string) => {
      const image: Array<Attr & { raw?: boolean }> = parseAttrs(imageSource);
      const alt = decodeEntities(getAttr(image, "alt") ?? "").trim();
      if (alt && !JUNK_ALT.test(alt)) return whole;
      const purpose = imageLinkPurpose(parseAttrs(anchorSource));
      if (!purpose) return whole;
      setAttr(image, "alt", purpose);
      return `<a${anchorSource}>${lead}<img${serializeAttrs(image)}>${trail}</a>`;
    },
  );
}

const INLINE_TOKEN = /<(\/?)(a|img|iframe)\b([^>]*)>/gi;

function rewriteInline(html: string) {
  let externalAnchorOpen = false;
  /** 目前開啟中的 <video>（由本機影片 iframe 改寫）之來源，用於關閉標籤前的備援連結 */
  let videoSrc: string | undefined;
  let imageCount = 0;

  return html.replace(INLINE_TOKEN, (whole, slash: string, rawTag: string, attrSource: string) => {
    const tag = rawTag.toLowerCase();
    const closing = slash === "/";

    if (tag === "img") {
      if (closing) return "";
      const eager = imageCount === 0;
      imageCount += 1;
      return rewriteImage(attrSource, eager);
    }

    if (tag === "iframe") {
      if (closing) {
        if (videoSrc === undefined) return whole;
        const fallback = `您的瀏覽器不支援影片播放，請<a href="${escapeAttr(videoSrc)}">下載影片檔</a>觀看。`;
        videoSrc = undefined;
        return `${fallback}</video>`;
      }
      const { open, videoSrc: src } = rewriteIframe(attrSource);
      videoSrc = src;
      return open;
    }

    // <a>
    if (closing) {
      if (!externalAnchorOpen) return whole;
      externalAnchorOpen = false;
      return `<span class="sr-only">${NEW_WINDOW}</span></a>`;
    }
    const attrs: Array<Attr & { raw?: boolean }> = parseAttrs(attrSource);
    const rawHref = getAttr(attrs, "href") ?? "";
    // 縱深防禦：javascript:、data: 等協定（含以 tab／換行混淆者）直接移除 href
    if (!isSafeUrl(rawHref)) {
      return `<a${serializeAttrs(attrs.filter((attr) => attr.name !== "href"))}>`;
    }
    const href = decodeEntities(rawHref);
    if (!isExternalHref(href)) {
      return prefixUrlAttrs(attrs, ["href"]) ? `<a${serializeAttrs(attrs)}>` : whole;
    }
    externalAnchorOpen = true;
    setAttr(attrs, "target", "_blank");
    setAttr(attrs, "rel", "noopener noreferrer");
    // 原站常見「(另開新視窗)」title，已有螢幕閱讀器提示時移除重複說明
    const title = getAttr(attrs, "title");
    const cleaned =
      title && /另開新視窗/.test(title) ? attrs.filter((attr) => attr.name !== "title") : attrs;
    return `<a${serializeAttrs(cleaned)}>`;
  });
}

/* ------------------------------------------------------------------ */

const memo = new Map<string, string>();

/** 將搬遷內容 HTML 改寫為新網站使用的版本（同一段 HTML 只處理一次） */
export function transformLegacyHtml(html: string) {
  const cached = memo.get(html);
  if (cached !== undefined) return cached;
  const output = rewriteInline(
    nameImageLinks(rewriteTables(wrapGalleries(demoteLongHeadings(html)))),
  );
  memo.set(html, output);
  return output;
}
