"use client";

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { Highlight } from "@/components/search/Highlight";
import { hitDisplay, typeIcons } from "@/components/search/resultParts";
import { loadSearchIndex, useSearchIndex } from "@/components/search/searchIndexStore";
import { cn } from "@/lib/cn";
import {
  docHref,
  groupHits,
  parseQuery,
  search,
  type SearchGroup,
  type SearchTerm,
  type SearchType,
} from "@/lib/search";

/** 目前網址上的 ?q=（未經 React 狀態，判斷 useSearchParams 的值是否已過時） */
function currentUrlQuery() {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

/** 每個類型預設列出的筆數，其餘以按鈕展開 */
const PAGE_SIZE = 20;
/** 輸入停頓後才更新網址（?q=），方便分享與返回 */
const URL_DELAY = 400;
const ANNOUNCE_DELAY = 500;

/** 各類型區塊的錨點（頁面上只有一份結果，使用固定 id 讓網址片段易讀） */
const groupAnchor = (type: SearchType) => `search-${type}`;

const inputClass =
  "h-12 w-full rounded-md border border-stroke bg-white pr-4 pl-11 text-base text-slate-900 placeholder:text-slate-500 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600";
const submitClass =
  "inline-flex h-12 shrink-0 items-center justify-center rounded-md bg-brand-700 px-5 text-sm font-semibold text-white shadow-sm shadow-brand-950/15 transition-colors duration-200 hover:bg-brand-800 active:bg-brand-900";

/**
 * 未載入 JavaScript 或尚未 hydrate 時的搜尋表單（Suspense 後備內容），載入完成後由 <SearchResults> 取代。
 * 不設 action：以 GET 送回目前網址（本頁），不必判斷 basePath 與 trailingSlash（/search 或 /search/）。
 */
export function SearchFormFallback() {
  return (
    <div>
      <form role="search" method="get" className="flex gap-2">
        <label htmlFor="search-page-fallback" className="sr-only">
          搜尋關鍵字
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-500"
          />
          <input
            id="search-page-fallback"
            name="q"
            type="search"
            autoComplete="off"
            placeholder="輸入關鍵字，例如：招生、專利、畢業典禮"
            className={inputClass}
          />
        </div>
        <button type="submit" className={submitClass}>
          搜尋
        </button>
      </form>
      <p className="mt-8 flex items-center gap-2 text-sm text-slate-600">
        <LoaderCircle aria-hidden="true" className="size-4 text-brand-600 motion-safe:animate-spin" />
        正在載入搜尋功能…
      </p>
    </div>
  );
}

/**
 * /search 頁的完整結果：讀取 ?q=（useSearchParams，須包在 Suspense 內），
 * 列出所有符合的結果並依類型分組、顯示各類筆數。索引與搜尋視窗共用同一份下載。
 */
export function SearchResults() {
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const baseId = useId();
  const inputId = `${baseId}-input`;

  const [query, setQuery] = useState(urlQuery);
  const [committed, setCommitted] = useState(urlQuery);
  /**
   * 本元件最後一次寫入（或採用）的網址查詢。寫入網址時不更新任何 state：
   * history.replaceState 經 Next 以 transition 更新 useSearchParams，若同時有一般優先度的更新，
   * React 會先以舊網址渲染一次，輸入框因而短暫退回舊值、吃掉輸入中的字與注音組字。
   */
  const writtenRef = useRef(urlQuery);

  /** 已展開完整清單的類型（隨搜尋文字重設） */
  const [expanded, setExpanded] = useState<{ text: string; types: readonly SearchType[] }>({
    text: "",
    types: [],
  });
  const [announcement, setAnnouncement] = useState("");

  const index = useSearchIndex();
  const searchText = useDeferredValue(committed);
  const terms = useMemo(() => parseQuery(searchText), [searchText]);
  const hits = useMemo(
    () => (index.status === "ready" ? search(index.items, terms) : []),
    [index, terms],
  );
  const groups = useMemo(() => groupHits(hits, "type"), [hits]);
  const expandedTypes = expanded.text === searchText ? expanded.types : [];

  useEffect(() => {
    loadSearchIndex();
  }, []);

  // 網址由外部改變（搜尋視窗「查看全部結果」、瀏覽器上一頁）時才覆寫輸入框。
  // 自己寫入的網址回傳時不動作；已被較新寫入取代的舊值（與目前網址不同）也略過
  useEffect(() => {
    if (urlQuery === writtenRef.current || urlQuery !== currentUrlQuery()) return;
    writtenRef.current = urlQuery;
    setQuery(urlQuery);
    setCommitted(urlQuery);
  }, [urlQuery]);

  // 輸入停頓後把查詢寫回網址（不重新載入頁面；history.replaceState 會同步至 useSearchParams）
  useEffect(() => {
    const target = committed.trim() ? committed : "";
    if (target === writtenRef.current) return;
    const timer = window.setTimeout(() => {
      writtenRef.current = target;
      const url = target ? `?q=${encodeURIComponent(target)}` : window.location.pathname;
      window.history.replaceState(null, "", url);
    }, URL_DELAY);
    return () => window.clearTimeout(timer);
  }, [committed]);

  const statusMessage =
    index.status === "error"
      ? "無法載入搜尋資料"
      : index.status !== "ready" || terms.length === 0
        ? ""
        : hits.length === 0
          ? `找不到符合「${searchText.trim()}」的結果`
          : `共 ${hits.length} 筆結果：${groups.map((group) => `${group.label} ${group.hits.length} 筆`).join("、")}`;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnouncement(statusMessage),
      statusMessage ? ANNOUNCE_DELAY : 0,
    );
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setQuery(value);
    if (!(event.nativeEvent as InputEvent).isComposing) setCommitted(value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCommitted(query);
  };

  return (
    <div>
      <form role="search" method="get" onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          搜尋關鍵字
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-500"
          />
          <input
            id={inputId}
            name="q"
            type="search"
            value={query}
            onChange={handleChange}
            onCompositionEnd={(event) => setCommitted(event.currentTarget.value)}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={100}
            placeholder="輸入關鍵字，例如：招生、專利、畢業典禮"
            className={inputClass}
          />
        </div>
        <button type="submit" className={submitClass}>
          搜尋
        </button>
      </form>

      <div role="status" className="sr-only">
        {announcement}
      </div>

      <div className="mt-8">
        {index.status === "error" ? (
          <Notice title="無法載入搜尋資料">
            請檢查網路連線後再試一次。
            <button
              type="button"
              onClick={loadSearchIndex}
              className="mt-4 flex min-h-11 items-center rounded-md bg-white px-4 text-sm font-semibold text-brand-900 ring-1 ring-stroke ring-inset transition-colors duration-200 hover:bg-brand-50 hover:ring-brand-200"
            >
              重新載入
            </button>
          </Notice>
        ) : index.status !== "ready" ? (
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <LoaderCircle aria-hidden="true" className="size-4 text-brand-600 motion-safe:animate-spin" />
            正在載入搜尋資料…
          </p>
        ) : terms.length === 0 ? (
          <Notice title="請輸入關鍵字">
            可搜尋網站頁面、首頁各單元、最新消息，以及歷屆畢業論文的題目、研究生與指導教授；多個關鍵字以空白分隔，結果須同時符合。
          </Notice>
        ) : hits.length === 0 ? (
          <Notice title={`找不到符合「${searchText.trim()}」的結果`}>
            請改用較短或不同的關鍵字，或瀏覽
            <Link
              href="/sitemap"
              className="mx-0.5 font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-700"
            >
              網站導覽
            </Link>
            。
          </Notice>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-stroke pb-4">
              <p className="text-lg font-semibold text-brand-950">
                「{searchText.trim()}」共 <span className="tabular-nums">{hits.length}</span> 筆結果
              </p>
              {groups.length > 1 ? (
                <nav aria-label="結果類型">
                  <ul className="flex flex-wrap gap-x-1 text-sm">
                    {groups.map((group) => (
                      <li key={group.type}>
                        <a
                          href={`#${groupAnchor(group.type)}`}
                          className="inline-flex min-h-11 items-center gap-1 rounded-sm px-2 font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline"
                        >
                          {group.label}
                          <span className="font-normal text-slate-600 tabular-nums">
                            {group.hits.length}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}
            </div>

            <div className="mt-8 grid gap-12">
              {groups.map((group) => (
                <ResultGroup
                  key={group.type}
                  id={groupAnchor(group.type)}
                  group={group}
                  terms={terms}
                  showAll={expandedTypes.includes(group.type)}
                  onShowAll={() =>
                    setExpanded({ text: searchText, types: [...expandedTypes, group.type] })
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-stroke bg-surface p-5 text-sm leading-relaxed text-slate-700 sm:p-6">
      <p className="text-base font-semibold text-brand-950">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

type ResultGroupProps = {
  id: string;
  group: SearchGroup;
  terms: readonly SearchTerm[];
  showAll: boolean;
  onShowAll: () => void;
};

function ResultGroup({ id, group, terms, showAll, onShowAll }: ResultGroupProps) {
  const Icon = typeIcons[group.type];
  const visible = showAll ? group.hits : group.hits.slice(0, PAGE_SIZE);
  const rest = group.hits.length - visible.length;
  const headingId = `${id}-heading`;

  const handleShowAll = () => {
    onShowAll();
    // 展開後把焦點移到第一筆新增的結果，鍵盤使用者不必從頭找起
    requestAnimationFrame(() => {
      document.getElementById(`${id}-item-${PAGE_SIZE}`)?.focus();
    });
  };

  return (
    <section id={id} aria-labelledby={headingId}>
      <h2
        id={headingId}
        className="flex items-center gap-2.5 text-base font-semibold text-brand-950"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-sm bg-brand-50 text-brand-700"
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        {group.label}
        <span className="text-sm font-normal text-slate-600 tabular-nums">
          {group.hits.length} 筆
        </span>
      </h2>

      <ul className="mt-4 grid gap-3">
        {visible.map((hit, position) => {
          const { doc } = hit;
          const display = hitDisplay(doc, terms, { excerptLength: 160, alwaysShowTitleEn: true });
          return (
            <li key={docHref(doc)}>
              <Link
                id={`${id}-item-${position}`}
                href={docHref(doc)}
                prefetch={false}
                className="group block rounded-md border border-stroke bg-white p-4 transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/40 sm:p-5"
              >
                {display.meta ? (
                  <span className="block text-xs text-slate-600">
                    <Highlight text={display.meta} terms={terms} />
                  </span>
                ) : null}
                <span
                  className={cn(
                    "block text-base leading-snug font-semibold text-brand-900 decoration-brand-300 underline-offset-4 group-hover:underline",
                    display.meta && "mt-1",
                  )}
                >
                  <Highlight text={doc.title} terms={terms} />
                </span>
                {display.titleEn ? (
                  <span lang="en" className="mt-1 block text-sm leading-snug text-slate-600">
                    <Highlight text={display.titleEn} terms={terms} />
                  </span>
                ) : null}
                {display.excerpt ? (
                  <span className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">
                    <Highlight text={display.excerpt} terms={terms} />
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>

      {rest > 0 ? (
        <button
          type="button"
          onClick={handleShowAll}
          aria-describedby={headingId}
          className="group mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-brand-900 ring-1 ring-stroke ring-inset transition-colors duration-200 hover:bg-brand-50 hover:ring-brand-200"
        >
          顯示其餘 {rest} 筆
          <ArrowRight
            aria-hidden="true"
            className="size-4 rotate-90 transition-transform duration-200 group-hover:translate-y-0.5"
          />
        </button>
      ) : null}
    </section>
  );
}
