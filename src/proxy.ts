/**
 * 舊站（emrd.ntust.edu.tw，Rpage）網址轉址。
 *
 * 明確清單來自 src/content/legacy/data/redirects.json（scripts/migrate_legacy.py 產生），
 * 於 build 時打包進 Proxy，執行環境不需讀檔。重新產生 JSON 後重新 build（dev 會自動重新編譯）即生效。
 *
 * 比對順序：
 *  1. 依查詢字串比對的來源（/app/index.php?Action=downloadfile&file=…）：路徑＋正規化查詢字串完全相符；
 *  2. 明確清單的路徑（忽略 ?Lang=zh-tw 等語系與追蹤參數）；
 *  3. 文章網址家族（16 列印版、404 內文、405 單元內文 ,c…、406 RSS ,r…）：
 *     同一代碼在清單中對應到頁面者沿用該頁面，否則已搬遷的文章 → /posts/<id>；
 *  4. 450 連結紀錄的其他變體 → 該紀錄的目的地；列表單元的其他分頁 → 該單元；
 *  5. /index.php → /；其餘 /p/* → /sitemap（307 暫時轉址，日後補上對照時不會被瀏覽器永久快取）。
 * 轉址目的地一律不帶舊站的查詢字串；目的地可為站外絕對網址（450 連結紀錄的 Google Drive 等）。
 * 其餘未知網址（/var/file/… 未搬遷的檔案、無對照的 /app/index.php 下載）由 Proxy 直接回應 404，
 * 不交給頁面渲染（避免每個探測網址都產生一筆頁面快取；public/ 下沒有這兩個路徑的檔案）。
 */
import { NextResponse, type NextRequest } from "next/server";
import redirectList from "@/content/legacy/data/redirects.json";

type LegacyRedirect = { source: string; destination: string };

/** 原站網站代碼，網址形如 /p/404-1039-12345.php */
const SITE_ID = "1039";
/** 不參與比對的查詢參數（原站語系與常見追蹤參數） */
const IGNORED_QUERY_KEY = /^(?:lang|fbclid|gclid|msclkid|utm_\w+)$/i;

/** 文章網址家族：16 列印版、404 內文、405 單元內文（,c…）、406 RSS（,r…）；逗號後的變體代碼可省略 */
const POST_URL = new RegExp(`^/p/(?:16|40[456])-${SITE_ID}-(\\d+)(?:,[^/]*)?\\.php$`, "i");
/** 450 連結紀錄（原站轉貼外部網址或檔案） */
const LINK_URL = new RegExp(`^/p/450-${SITE_ID}-(\\d+)(?:,[^/]*)?\\.php$`, "i");
/** 列表單元與其分頁：/p/403-1039-<單元>.php、/p/403-1039-<單元>-<頁>.php */
const UNIT_URL = new RegExp(`^/p/403-${SITE_ID}-(\\d+)(?:-\\d+)?\\.php$`, "i");
const POST_DESTINATION = /^\/posts\/(\d+)$/;
const VALID_DESTINATION = /^(?:\/(?!\/)|https?:\/\/)/i;

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 路徑比對鍵：解碼百分比編碼，讓 %28／(、%2C／,、中文的兩種寫法視為相同 */
function pathKey(pathname: string) {
  return safeDecode(pathname);
}

/**
 * 查詢字串比對鍵：去除語系與追蹤參數、參數名不分大小寫並排序。
 * URLSearchParams 會把「+」解成空白，舊站 base64 參數兩種寫法都可能出現，故空白一律還原為「+」。
 */
function queryKey(search: string) {
  const pairs: string[] = [];
  for (const [key, value] of new URLSearchParams(search)) {
    if (!key || IGNORED_QUERY_KEY.test(key)) continue;
    pairs.push(`${key.toLowerCase()}=${value.replace(/ /g, "+")}`);
  }
  return pairs.sort().join("&");
}

function splitSource(source: string) {
  const withoutHash = source.split("#")[0];
  const queryStart = withoutHash.indexOf("?");
  return queryStart === -1
    ? { pathname: withoutHash, search: "" }
    : { pathname: withoutHash.slice(0, queryStart), search: withoutHash.slice(queryStart + 1) };
}

function isRedirect(value: unknown): value is LegacyRedirect {
  if (!value || typeof value !== "object") return false;
  const { source, destination } = value as Partial<LegacyRedirect>;
  return (
    typeof source === "string" &&
    source.startsWith("/") &&
    typeof destination === "string" &&
    VALID_DESTINATION.test(destination)
  );
}

type RedirectIndex = {
  /** 路徑＋正規化查詢字串 → 目的地 */
  byQuery: Map<string, string>;
  /** 路徑 → 目的地（另存小寫鍵供不分大小寫的後備比對） */
  byPath: Map<string, string>;
  byLowerPath: Map<string, string>;
  /** 已搬遷的文章代碼 */
  postIds: Set<string>;
  /** 文章代碼 → 清單中的非文章目的地（例：404-1039-103121 學分費調整專區） */
  postPages: Map<string, string>;
  /** 450 連結紀錄代碼 → 目的地 */
  links: Map<string, string>;
  /** 列表單元代碼 → 目的地 */
  units: Map<string, string>;
};

function setOnce(map: Map<string, string>, key: string, value: string) {
  if (!map.has(key)) map.set(key, value);
}

function buildIndex(): RedirectIndex {
  const index: RedirectIndex = {
    byQuery: new Map(),
    byPath: new Map(),
    byLowerPath: new Map(),
    postIds: new Set(),
    postPages: new Map(),
    links: new Map(),
    units: new Map(),
  };

  // redirects.json 已含依查詢字串轉址的舊下載網址（source 含 ?Action=downloadfile…）
  const entries = (redirectList as unknown[]).filter(isRedirect);
  for (const { destination } of entries) {
    const post = POST_DESTINATION.exec(destination);
    if (post) index.postIds.add(post[1]);
  }

  for (const { source, destination } of entries) {
    const { pathname, search } = splitSource(source);
    const path = pathKey(pathname);
    const query = queryKey(search);
    if (query) {
      setOnce(index.byQuery, `${path}?${query}`, destination);
      continue;
    }
    if (path === destination) continue;
    setOnce(index.byPath, path, destination);
    setOnce(index.byLowerPath, path.toLowerCase(), destination);

    const post = POST_URL.exec(path);
    if (post) {
      if (destination !== `/posts/${post[1]}`) setOnce(index.postPages, post[1], destination);
      continue;
    }
    const link = LINK_URL.exec(path);
    if (link) {
      setOnce(index.links, link[1], destination);
      continue;
    }
    const unit = UNIT_URL.exec(path);
    if (unit) setOnce(index.units, unit[1], destination);
  }
  return index;
}

const index = buildIndex();

/** 回傳 [目的地, 是否永久轉址]；無對照時回傳 undefined（交由 Next 處理，通常為 404） */
function resolveLegacy(pathname: string, search: string): [string, boolean] | undefined {
  const path = pathKey(pathname);

  const query = queryKey(search);
  if (query) {
    const byQuery = index.byQuery.get(`${path}?${query}`);
    if (byQuery) return [byQuery, true];
  }

  const exact = index.byPath.get(path) ?? index.byLowerPath.get(path.toLowerCase());
  if (exact) return [exact, true];

  const post = POST_URL.exec(path);
  if (post) {
    const id = post[1];
    const page = index.postPages.get(id);
    if (page) return [page, true];
    if (index.postIds.has(id)) return [`/posts/${id}`, true];
  }

  const link = LINK_URL.exec(path);
  const linkDestination = link && index.links.get(link[1]);
  if (linkDestination) return [linkDestination, true];

  const unit = UNIT_URL.exec(path);
  const unitDestination = unit && index.units.get(unit[1]);
  if (unitDestination) return [unitDestination, true];

  const lower = path.toLowerCase();
  if (lower === "/index.php") return ["/", true];
  if (lower === "/p" || lower.startsWith("/p/")) return ["/sitemap", false];
  return undefined;
}

/** 舊站檔案與下載網址：無對照時直接回應 404 */
const LEGACY_FILE_URL = /^\/(?:var\/file\/|app\/index\.php$)/i;

function legacyFileNotFound() {
  return new NextResponse("404 Not Found：此檔案未搬遷至新網站。", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const resolved = resolveLegacy(pathname, search);
  if (!resolved) return LEGACY_FILE_URL.test(pathname) ? legacyFileNotFound() : NextResponse.next();

  const [destination, permanent] = resolved;
  // 以絕對網址建立；同網域時 Next 會把 Location 改為相對路徑。目的地不帶舊站查詢字串
  return NextResponse.redirect(new URL(destination, request.url), permanent ? 308 : 307);
}

export const config = {
  matcher: ["/p/:path*", "/var/file/:path*", "/app/index.php", "/index.php"],
};
