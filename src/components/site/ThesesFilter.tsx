"use client";

import {
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, ChevronDown, Search, X } from "lucide-react";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/cn";

export type ThesisProgram = "EMRD" | "SEMI-EMRD";

/** 傳入 Client 的最小資料：只含畫面上顯示的欄位（每篇約 250 位元組） */
export type ThesisEntry = {
  year: number;
  program: ThesisProgram;
  name: string;
  title: string;
  titleEn?: string;
  advisor: string;
  /** 臺科大博碩士論文系統的論文頁 */
  url: string;
  topics: readonly string[];
};

const THESIS_PROGRAMS: readonly ThesisProgram[] = ["EMRD", "SEMI-EMRD"];

type Filters = {
  query: string;
  year: number | null;
  program: ThesisProgram | null;
  topic: string | null;
};

const EMPTY: Filters = { query: "", year: null, program: null, topic: null };

/** 網址查詢參數：站內搜尋以 ?q=<論文題目> 連到本頁 */
const PARAM = { query: "q", year: "year", program: "program", topic: "topic" } as const;

/**
 * 全形英數轉半形、不分大小寫，「臺」視同「台」（與全站搜尋 src/lib/search.ts 相同）。
 * 「臺」「台」皆為單一 UTF-16 字元，Highlight 的位置對應不受影響
 */
function fold(text: string) {
  return text.normalize("NFKC").toLowerCase().replaceAll("臺", "台");
}

/** 以空白分隔的多個關鍵字須同時符合 */
function termsOf(query: string) {
  return fold(query).split(/\s+/).filter(Boolean);
}

const LATIN_CHAR = /[a-z0-9]/;

/**
 * 找出關鍵字位置：以英數字開頭的詞須位於單字開頭（「ic」不命中「Music」、「ev」不命中「Development」，
 * 「ic設計」「aiot」仍可命中）；以中文等開頭的詞為一般子字串比對
 */
function findTerm(haystack: string, term: string, from = 0) {
  let at = haystack.indexOf(term, from);
  if (!LATIN_CHAR.test(term[0])) return at;
  while (at > 0 && LATIN_CHAR.test(haystack[at - 1])) at = haystack.indexOf(term, at + 1);
  return at;
}

const CJK = /[㐀-鿿豈-﫿]/;

function sameFilters(a: Filters, b: Filters) {
  return a.query === b.query && a.year === b.year && a.program === b.program && a.topic === b.topic;
}

function parseFilters(
  params: URLSearchParams,
  years: ReadonlySet<number>,
  topics: ReadonlySet<string>,
): Filters {
  const year = Number(params.get(PARAM.year));
  const program = params.get(PARAM.program)?.trim().toUpperCase();
  const topic = params.get(PARAM.topic)?.trim();
  return {
    query: params.get(PARAM.query) ?? "",
    year: years.has(year) ? year : null,
    program: THESIS_PROGRAMS.find((item) => item === program) ?? null,
    topic: topic && topics.has(topic) ? topic : null,
  };
}

/** 只改寫本元件管理的參數，保留網址上的其他參數 */
function writeFilters(params: URLSearchParams, filters: Filters) {
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
    else params.delete(key);
  };
  set(PARAM.query, filters.query.trim() ? filters.query : null);
  set(PARAM.year, filters.year === null ? null : String(filters.year));
  set(PARAM.program, filters.program);
  set(PARAM.topic, filters.topic);
}

type ThesesFilterProps = {
  /** 依學年度由新到舊排序 */
  entries: readonly ThesisEntry[];
  /** 研究方向，依篇數排序 */
  topics: readonly string[];
};

/**
 * 歷屆畢業論文的即時篩選（關鍵字、學年度、學程、研究方向）。
 * 完整清單於伺服器端輸出（未載入 JavaScript 時仍可瀏覽全部論文）；
 * 網址的 ?q=、?year=、?program=、?topic= 於瀏覽器端讀取（useSearchParams 包在 Suspense 內，
 * 頁面仍為靜態輸出），篩選條件改變時以 history.replaceState 同步回網址，方便分享。
 */
export function ThesesFilter({ entries, topics }: ThesesFilterProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const deferred = useDeferredValue(filters);

  const inputId = useId();
  const statusId = useId();
  const yearId = useId();
  const programLabelId = useId();
  const topicLabelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const years = useMemo(
    () => [...new Set(entries.map((entry) => entry.year))].sort((a, b) => b - a),
    [entries],
  );
  const yearSet = useMemo(() => new Set(years), [years]);
  const topicSet = useMemo(() => new Set(topics), [topics]);
  const haystacks = useMemo(
    () =>
      entries.map((entry) =>
        fold([entry.title, entry.titleEn ?? "", entry.name, entry.advisor].join("\n")),
      ),
    [entries],
  );

  /* ---------------- 網址同步 ---------------- */

  /** 最近一次讀入或寫出的查詢字串：自己寫出的網址不再讀回，避免輸入中的空白被覆寫 */
  const lastSearch = useRef<string | null>(null);
  const urlReady = useRef(false);

  const applySearch = useCallback(
    (search: string) => {
      urlReady.current = true;
      if (search === lastSearch.current) return;
      lastSearch.current = search;
      const next = parseFilters(new URLSearchParams(search), yearSet, topicSet);
      setFilters((prev) => (sameFilters(prev, next) ? prev : next));
    },
    [yearSet, topicSet],
  );

  useEffect(() => {
    // 讀入網址之前不寫出，避免以預設條件覆寫 ?q=
    if (!urlReady.current) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      writeFilters(params, filters);
      const search = params.toString();
      lastSearch.current = search;
      if (search === window.location.search.replace(/^\?/, "")) return;
      window.history.replaceState(null, "", search ? `?${search}` : window.location.pathname);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [filters]);

  /* ---------------- 篩選與各條件的篇數 ---------------- */

  const result = useMemo(() => {
    const terms = termsOf(deferred.query);
    const yearCounts = new Map<number, number>();
    const programCounts = new Map<ThesisProgram, number>();
    const topicCounts = new Map<string, number>();
    let yearAll = 0;
    let programAll = 0;
    let topicAll = 0;
    const groups = new Map<number, ThesisEntry[]>();
    let total = 0;

    entries.forEach((entry, index) => {
      const q = terms.every((term) => findTerm(haystacks[index], term) !== -1);
      const y = deferred.year === null || entry.year === deferred.year;
      const p = deferred.program === null || entry.program === deferred.program;
      const t = deferred.topic === null || entry.topics.includes(deferred.topic);

      // 每個條件的篇數只套用「其他」條件，選項旁的數字即為點選後的結果數
      if (q && p && t) {
        yearAll += 1;
        yearCounts.set(entry.year, (yearCounts.get(entry.year) ?? 0) + 1);
      }
      if (q && y && t) {
        programAll += 1;
        programCounts.set(entry.program, (programCounts.get(entry.program) ?? 0) + 1);
      }
      if (q && y && p) {
        topicAll += 1;
        for (const topic of entry.topics) topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      }
      if (q && y && p && t) {
        total += 1;
        const list = groups.get(entry.year);
        if (list) list.push(entry);
        else groups.set(entry.year, [entry]);
      }
    });

    return { terms, groups: [...groups], total, yearCounts, yearAll, programCounts, programAll, topicCounts, topicAll };
  }, [entries, haystacks, deferred]);

  const filtered =
    filters.query.trim() !== "" ||
    filters.year !== null ||
    filters.program !== null ||
    filters.topic !== null;
  const update = (patch: Partial<Filters>) => setFilters((prev) => ({ ...prev, ...patch }));

  // 「清除篩選」按鈕在清除後即消失：焦點移回搜尋框（其 aria-describedby 會報讀目前篇數），
  // 避免鍵盤焦點落到 <body>
  const reset = () => {
    setFilters(EMPTY);
    inputRef.current?.focus();
  };

  return (
    <div>
      <Suspense fallback={null}>
        <SearchParamsReader onChange={applySearch} />
      </Suspense>

      <div
        role="search"
        aria-label="搜尋歷屆畢業論文"
        className="rounded-md border border-stroke bg-surface p-4 sm:p-5"
      >
        <label htmlFor={inputId} className="text-sm font-medium text-brand-950">
          搜尋論文
        </label>
        <div className="relative mt-2">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-500"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={filters.query}
            onChange={(event) => update({ query: event.target.value })}
            aria-describedby={statusId}
            placeholder="題目、研究生或指導教授"
            autoComplete="off"
            enterKeyHint="search"
            className="h-12 w-full rounded-md border border-stroke bg-white pr-4 pl-10 text-base text-slate-900 placeholder:text-slate-500 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div>
            <label htmlFor={yearId} className="text-sm font-medium text-brand-950">
              學年度
            </label>
            <div className="relative mt-2">
              <select
                id={yearId}
                value={filters.year ?? ""}
                onChange={(event) =>
                  update({ year: event.target.value ? Number(event.target.value) : null })
                }
                className="h-11 w-full appearance-none rounded-md border border-stroke bg-white pr-10 pl-3.5 text-base text-slate-900 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600"
              >
                <option value="">全部學年度（{result.yearAll}）</option>
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year} 學年度（{result.yearCounts.get(year) ?? 0}）
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-slate-600"
              />
            </div>
          </div>

          <div>
            <span id={programLabelId} className="block text-sm font-medium text-brand-950">
              學程
            </span>
            <div
              role="radiogroup"
              aria-labelledby={programLabelId}
              className="mt-2 flex flex-wrap gap-1.5 sm:gap-2"
            >
              {([null, ...THESIS_PROGRAMS] as const).map((program) => (
                <ChoiceChip
                  key={program ?? "all"}
                  name={`${programLabelId}-choice`}
                  checked={filters.program === program}
                  count={
                    program === null ? result.programAll : (result.programCounts.get(program) ?? 0)
                  }
                  onChange={() => update({ program })}
                  large
                >
                  {program ?? "全部"}
                </ChoiceChip>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm">
            <span id={topicLabelId} className="font-medium text-brand-950">
              研究方向
            </span>
            <span className="ml-2 text-slate-600">依論文題目關鍵字自動分類，僅供參考</span>
          </p>
          <div role="radiogroup" aria-labelledby={topicLabelId} className="mt-2 flex flex-wrap gap-2">
            {([null, ...topics] as const).map((topic) => (
              <ChoiceChip
                key={topic ?? "all"}
                name={`${topicLabelId}-choice`}
                checked={filters.topic === topic}
                count={topic === null ? result.topicAll : (result.topicCounts.get(topic) ?? 0)}
                onChange={() => update({ topic })}
              >
                {topic ?? "全部"}
              </ChoiceChip>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p id={statusId} role="status" aria-live="polite" className="text-sm text-slate-600">
          {filtered ? (
            <>
              符合條件{" "}
              <strong className="font-semibold text-brand-950 tabular-nums">{result.total}</strong> 篇（共{" "}
              <span className="tabular-nums">{entries.length}</span> 篇）
            </>
          ) : (
            <>
              共 <strong className="font-semibold text-brand-950 tabular-nums">{entries.length}</strong>{" "}
              篇論文
            </>
          )}
        </p>
        {filtered ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            <X aria-hidden="true" className="size-4" />
            清除篩選
          </button>
        ) : null}
      </div>

      {result.groups.length > 0 ? (
        result.groups.map(([year, items]) => (
          <section key={year} aria-labelledby={`thesis-year-${year}`} className="mt-10 first-of-type:mt-6">
            <h2
              id={`thesis-year-${year}`}
              className="flex flex-wrap items-baseline gap-x-1 border-b-2 border-brand-900 pb-3 text-xl font-semibold text-brand-950 sm:text-2xl"
            >
              <span>{year} 學年度</span>
              <span className="text-base font-medium text-slate-600 tabular-nums">
                （{items.length} 篇）
              </span>
            </h2>
            <ul className="divide-y divide-stroke">
              {items.map((entry) => (
                <li key={entry.url}>
                  <ThesisItem entry={entry} terms={result.terms} />
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <div className="mt-6 rounded-md border border-dashed border-stroke px-6 py-12 text-center">
          <p className="text-base text-slate-700">
            {filters.query.trim()
              ? `找不到符合「${filters.query.trim()}」的論文，請調整關鍵字或篩選條件。`
              : "找不到符合條件的論文，請調整篩選條件。"}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-brand-900 ring-1 ring-stroke ring-inset hover:bg-brand-50"
          >
            清除篩選
          </button>
        </div>
      )}
    </div>
  );
}

/** 讀取網址查詢參數（useSearchParams 在預先渲染時暫停，只有這個空元件延到瀏覽器端渲染） */
function SearchParamsReader({ onChange }: { onChange: (search: string) => void }) {
  const search = useSearchParams().toString();
  useEffect(() => {
    onChange(search);
  }, [search, onChange]);
  return null;
}

/**
 * 單選條件（學程、研究方向）：原生 radio，每組恰有一項選取（含「全部」），
 * 方向鍵在組內移動並選取；radio 本身視覺隱藏，外觀與焦點框畫在標籤上
 */
function ChoiceChip({
  name,
  checked,
  count,
  onChange,
  large = false,
  children,
}: {
  name: string;
  checked: boolean;
  count: number;
  onChange: () => void;
  /** 與下拉選單同高（44px） */
  large?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="relative inline-flex cursor-pointer">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        // 強制色彩模式（Windows 高對比）會移除背景色與 ring（box-shadow）：
        // 未選取為 1px ButtonText 邊框，選取為 2px Highlight 邊框加粗體
        className={cn(
          "inline-flex items-center gap-1.5 rounded-sm text-sm font-medium whitespace-nowrap ring-1 transition-colors duration-200 ring-inset",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-brand-600",
          large ? "min-h-11 px-3 sm:px-3.5" : "min-h-9 px-3",
          checked
            ? "bg-brand-700 text-white ring-brand-700 forced-colors:border-2 forced-colors:border-[color:Highlight] forced-colors:font-semibold"
            : "bg-white text-slate-700 ring-stroke hover:bg-brand-50 hover:text-brand-900 hover:ring-brand-200 forced-colors:border forced-colors:border-[color:ButtonText]",
        )}
      >
        {children}
        <span className={cn("text-xs tabular-nums", checked ? "text-brand-100" : "text-slate-500")}>
          {count}
        </span>
      </span>
    </label>
  );
}

function ThesisItem({ entry, terms }: { entry: ThesisEntry; terms: readonly string[] }) {
  return (
    <article className="py-5">
      <h3 className="text-base leading-snug font-semibold text-pretty break-words text-brand-950 sm:text-[1.0625rem]">
        <a
          href={entry.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group decoration-brand-300 underline-offset-4 hover:text-brand-800 hover:underline focus-visible:outline-offset-4"
        >
          <span lang={CJK.test(entry.title) ? undefined : "en"}>
            <Highlight text={entry.title} terms={terms} />
          </span>
          <span className="sr-only">（另開新視窗：臺科大博碩士論文系統）</span>
          <ArrowUpRight
            aria-hidden="true"
            className="ml-1 inline-block size-4 -translate-y-px align-middle text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          />
        </a>
      </h3>
      {entry.titleEn ? (
        <p lang="en" className="mt-1.5 text-sm leading-relaxed text-pretty break-words text-slate-600">
          <Highlight text={entry.titleEn} terms={terms} />
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <dl className="flex flex-wrap gap-x-5 gap-y-1">
          <div className="flex gap-1.5">
            <dt className="text-slate-600">研究生</dt>
            <dd className="font-medium text-slate-900">
              <Highlight text={entry.name} terms={terms} />
            </dd>
          </div>
          <div className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-slate-600">指導教授</dt>
            <dd className="min-w-0 text-slate-900">
              <Highlight text={entry.advisor} terms={terms} />
            </dd>
          </div>
        </dl>
        <ul aria-label="學程與研究方向" className="flex flex-wrap gap-1.5">
          <li>
            <Tag tone={entry.program === "EMRD" ? "brand" : "champagne"}>{entry.program}</Tag>
          </li>
          {entry.topics.map((topic) => (
            <li key={topic}>
              <Tag>{topic}</Tag>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

/** 標示關鍵字（正規化後長度改變的文字不標示，避免位置錯置） */
function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return text;
  const folded = fold(text);
  if (folded.length !== text.length) return text;

  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    for (let from = 0; ; ) {
      const start = findTerm(folded, term, from);
      if (start < 0) break;
      ranges.push([start, start + term.length]);
      from = start + term.length;
    }
  }
  if (ranges.length === 0) return text;

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="rounded-[2px] bg-champagne-200 text-inherit">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
