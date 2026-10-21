"use client";

import { useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Newspaper, PlayCircle, Search, X } from "lucide-react";
import { withBasePath } from "@/lib/basePath";
import { cn } from "@/lib/cn";
import { PostTag } from "./PostTag";

/** 傳入 Client 的最小資料：每則約百位元組，88 則約 9 KB */
export type CollectionEntry = {
  id: string;
  /** 已去除開頭標籤的標題 */
  title: string;
  tag?: string;
  cover?: string;
  /** 一般為 /posts/{id}；「連結型」文章直接指向連結目標 */
  href: string;
  external?: boolean;
};

type CollectionFilterProps = {
  entries: readonly CollectionEntry[];
  /** 單位，例如「則消息」 */
  unit?: string;
  /** 無封面時的佔位圖示：一般消息為報紙，影音專區為播放鈕 */
  placeholder?: "news" | "video";
};

const ALL = "__all__";

function normalize(text: string) {
  return text.toLowerCase().replace(/\s+/g, "");
}

/**
 * 文章列表的即時篩選（標題關鍵字＋標籤）。伺服器端已輸出完整清單，
 * 未載入 JavaScript 時仍可瀏覽全部文章。
 */
export function CollectionFilter({
  entries,
  unit = "則消息",
  placeholder = "news",
}: CollectionFilterProps) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string>(ALL);
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.tag) counts.set(entry.tag, (counts.get(entry.tag) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  const needle = normalize(query);
  const visible = entries.filter(
    (entry) =>
      (activeTag === ALL || entry.tag === activeTag) &&
      (!needle || normalize(`${entry.tag ?? ""}${entry.title}`).includes(needle)),
  );
  const filtered = needle !== "" || activeTag !== ALL;

  // 「清除篩選」按鈕在清除後即消失：焦點移回搜尋框（其 aria-describedby 會報讀目前則數），
  // 避免鍵盤焦點落到 <body>
  const reset = () => {
    setQuery("");
    setActiveTag(ALL);
    inputRef.current?.focus();
  };

  return (
    <div>
      <div className="rounded-md border border-stroke bg-surface p-4 sm:p-5">
        <label htmlFor={inputId} className="text-sm font-medium text-brand-950">
          搜尋標題
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
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby={statusId}
            placeholder="輸入關鍵字，例如：畢業典禮"
            autoComplete="off"
            className="h-12 w-full rounded-md border border-stroke bg-white pr-4 pl-10 text-base text-slate-900 placeholder:text-slate-500 focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-600"
          />
        </div>

        {tags.length > 1 ? (
          <div role="group" aria-label="依標籤篩選" className="mt-4 flex flex-wrap gap-2">
            {[[ALL, entries.length] as const, ...tags].map(([tag, count]) => {
              const pressed = activeTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setActiveTag(tag)}
                  // 強制色彩模式（Windows 高對比）會移除背景色與 ring（box-shadow）：
                  // 未選取為 1px ButtonText 邊框，選取為 2px Highlight 邊框加粗體
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-sm px-3 text-sm font-medium ring-1 transition-colors duration-200 ring-inset",
                    pressed
                      ? "bg-brand-700 text-white ring-brand-700 forced-colors:border-2 forced-colors:border-[color:Highlight] forced-colors:font-semibold"
                      : "bg-white text-slate-700 ring-stroke hover:bg-brand-50 hover:text-brand-900 hover:ring-brand-200 forced-colors:border forced-colors:border-[color:ButtonText]",
                  )}
                >
                  {tag === ALL ? "全部" : tag}
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      pressed ? "text-brand-100" : "text-slate-500",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p id={statusId} role="status" aria-live="polite" className="text-sm text-slate-600">
          {filtered ? (
            <>
              符合條件 <strong className="font-semibold text-brand-950 tabular-nums">{visible.length}</strong>{" "}
              {unit}（共 <span className="tabular-nums">{entries.length}</span> {unit}）
            </>
          ) : (
            <>
              共 <strong className="font-semibold text-brand-950 tabular-nums">{entries.length}</strong> {unit}
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

      {visible.length > 0 ? (
        <ul className="mt-3 border-t border-stroke">
          {visible.map((entry) => (
            <li key={entry.id} className="border-b border-stroke">
              <EntryRow entry={entry} placeholder={placeholder} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-md border border-dashed border-stroke px-6 py-12 text-center">
          <p className="text-base text-slate-700">
            {needle ? `找不到標題含「${query.trim()}」的${unit.replace(/^則/, "")}。` : `目前沒有${unit.replace(/^則/, "")}。`}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={reset}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-semibold text-brand-900 ring-1 ring-stroke ring-inset hover:bg-brand-50"
            >
              清除篩選
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  placeholder,
}: {
  entry: CollectionEntry;
  placeholder: "news" | "video";
}) {
  const linkClass =
    "decoration-brand-300 underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:text-brand-800 group-hover:underline focus-visible:outline-offset-4";
  const title = (
    <>
      {entry.title}
      {entry.external ? <span className="sr-only">（另開新視窗）</span> : null}
    </>
  );

  return (
    <article className="group relative flex items-center gap-4 py-4 sm:gap-6 sm:py-5">
      <Thumbnail cover={entry.cover} placeholder={placeholder} />
      <div className="min-w-0 flex-1">
        {entry.tag ? <PostTag tag={entry.tag} /> : null}
        <h2 className="mt-1.5 text-base leading-snug font-semibold text-balance text-brand-950 sm:text-lg">
          {entry.external ? (
            <a href={entry.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {title}
            </a>
          ) : (
            <Link href={entry.href} className={linkClass}>
              {title}
            </Link>
          )}
        </h2>
      </div>
      {entry.external ? (
        <ArrowUpRight
          aria-hidden="true"
          className="hidden size-5 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 sm:block"
        />
      ) : (
        <ArrowRight
          aria-hidden="true"
          className="hidden size-5 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5 sm:block"
        />
      )}
    </article>
  );
}

/**
 * 列表縮圖：固定 4:3 外框避免版面位移。站內圖片走 next/image 最佳化
 * （原圖平均約 700 KB，縮圖僅需數 KB）；外部圖片無法最佳化，改用原生延遲載入。
 */
function Thumbnail({ cover, placeholder }: { cover?: string; placeholder: "news" | "video" }) {
  const Icon = placeholder === "video" ? PlayCircle : Newspaper;
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-sm bg-brand-50 ring-1 ring-stroke ring-inset sm:w-40"
    >
      {cover ? (
        cover.startsWith("/") ? (
          // next/image 不會替字串 src 加上 basePath（basePath.md「Images」）
          <Image
            src={withBasePath(cover)}
            alt=""
            fill
            sizes="(min-width: 640px) 160px, 96px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- 外部圖片未列入 remotePatterns
          <img
            src={cover}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        )
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="absolute top-0 right-0 size-6 bg-champagne-300/70 [clip-path:polygon(0_0,100%_0,100%_100%)]" />
          <Icon className="size-7 text-brand-300" strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}
