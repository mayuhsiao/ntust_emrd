"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, LoaderCircle, Search, X } from "lucide-react";
import { Highlight } from "@/components/search/Highlight";
import {
  OPEN_SEARCH_EVENT,
  SEARCH_TRIGGER_SELECTOR,
  type OpenSearchDetail,
} from "@/components/search/openSearch";
import { hitDisplay, typeIcons } from "@/components/search/resultParts";
import { loadSearchIndex, useSearchIndex } from "@/components/search/searchIndexStore";
import { cn } from "@/lib/cn";
import { lockScroll } from "@/lib/scrollLock";
import {
  docHref,
  groupHits,
  parseQuery,
  search,
  searchPageHref,
  topHits,
  type SearchHit,
  type SearchTerm,
} from "@/lib/search";

/** 尚未輸入時的建議關鍵字 */
const SUGGESTIONS = ["招生資訊", "課程介紹", "學分抵免", "畢業典禮", "專利", "AI"] as const;

/** 結果數量的語音提示延遲：輸入停頓後才報讀，避免每打一個字就打斷 */
const ANNOUNCE_DELAY = 450;

/** 元素是否實際顯示：Activity 保留的隱藏路由以 display: none 留在文件中 */
function isShown(element: HTMLElement) {
  if (!element.isConnected) return false;
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : element.getClientRects().length > 0;
}

function focusableIn(root: HTMLElement) {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.tabIndex >= 0 && isShown(element));
}

function isPlainClick(event: ReactMouseEvent) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * 全站搜尋視窗（頁首內各一份；Activity 隱藏的路由不接收事件）。
 *
 * - 原生 <dialog> showModal()：頁面其餘部分成為 inert，並另以 Tab 循環把焦點留在視窗內；
 *   關閉時焦點歸還開啟前的元素（已隱藏時改為頁首的搜尋鈕）。
 * - 輸入框為 WAI-ARIA combobox（aria-activedescendant）：焦點留在輸入框，
 *   上下方向鍵移動選取、Enter 開啟、Esc 關閉；結果依類型分組（listbox > group > option）。
 * - 開啟方式：頁首搜尋鈕、行動版選單、Ctrl／⌘＋K。不提供單一字元快速鍵（如「/」）：
 *   使用者無法關閉時不符 WCAG 2.1.4（語音輸入或焦點在連結上時會誤觸）。
 */
export function SearchDialog() {
  const router = useRouter();
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const listboxId = `${baseId}-listbox`;
  const hintId = `${baseId}-hint`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const backdropPressRef = useRef(false);

  const [open, setOpen] = useState(false);
  /** 輸入框的值（含注音等輸入法組字中的文字） */
  const [query, setQuery] = useState("");
  /** 實際用來搜尋的文字：組字完成後才更新 */
  const [committed, setCommitted] = useState("");
  /** 目前選取的結果；list 不是目前的結果清單時視為第一筆 */
  const [cursor, setCursor] = useState<{ list: readonly SearchHit[] | null; index: number }>({
    list: null,
    index: 0,
  });
  const [announcement, setAnnouncement] = useState("");

  const index = useSearchIndex();
  const searchText = useDeferredValue(committed);
  const terms = useMemo(() => parseQuery(searchText), [searchText]);
  const hits = useMemo(
    () => (index.status === "ready" ? search(index.items, terms) : []),
    [index, terms],
  );
  const groups = useMemo(() => groupHits(topHits(hits)), [hits]);
  const options = useMemo(() => groups.flatMap((group) => group.hits), [groups]);
  const activeIndex =
    options.length === 0
      ? -1
      : cursor.list === options
        ? Math.min(cursor.index, options.length - 1)
        : 0;
  const activeId = activeIndex >= 0 ? optionId(activeIndex) : undefined;

  const show = useCallback((trigger: HTMLElement | null) => {
    // 觸控點擊不會讓按鈕取得焦點（activeElement 為 <body>），此時關閉後改聚焦頁首的搜尋鈕
    const active = document.activeElement;
    triggerRef.current =
      trigger ?? (active instanceof HTMLElement && active !== document.body ? active : null);
    restoreFocusRef.current = true;
    loadSearchIndex();
    setOpen(true);
  }, []);

  /** @param restoreFocus 前往結果頁時不歸還焦點（交由換頁處理） */
  const close = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }, []);

  // 開啟／關閉 <dialog>。以 layout effect 在同一個使用者事件內聚焦，行動裝置才會叫出鍵盤
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    inputRef.current?.focus();
    inputRef.current?.select();

    // 鎖定頁面捲動（與行動版選單共用計數，從選單開啟搜尋時兩者的開關不會互相覆寫）
    const releaseScroll = lockScroll();

    return () => {
      releaseScroll();
      // 路由被 Activity 隱藏時（例如瀏覽器返回）視窗已不可見：只關閉、不搬動焦點
      const visible = isShown(dialog);
      if (dialog.open) dialog.close();
      if (!visible || !restoreFocusRef.current) return;
      const trigger = triggerRef.current;
      const target =
        trigger && isShown(trigger)
          ? trigger
          : Array.from(document.querySelectorAll<HTMLElement>(SEARCH_TRIGGER_SELECTOR)).find(isShown);
      target?.focus({ preventScroll: true });
    };
  }, [open]);

  // Cache Components 以 <Activity> 保留離開的路由；隱藏時收合，返回時不殘留開啟的視窗
  useLayoutEffect(() => () => setOpen(false), []);

  // 開啟事件與快速鍵（Ctrl／⌘＋K）
  useEffect(() => {
    const focusInput = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    const handleOpen = (event: Event) => {
      if (dialogRef.current?.open) return focusInput();
      show((event as CustomEvent<OpenSearchDetail>).detail?.trigger ?? null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const shortcut =
        event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey) && !event.shiftKey;
      if (!shortcut) return;
      event.preventDefault();
      if (dialogRef.current?.open) focusInput();
      else show(null);
    };
    window.addEventListener(OPEN_SEARCH_EVENT, handleOpen);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, handleOpen);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [show]);

  // 選取的結果保持在可視範圍內
  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId, options]);

  // 結果數量的語音提示（role="status"）
  const statusMessage = !open
    ? ""
    : index.status === "error"
      ? "無法載入搜尋資料"
      : index.status !== "ready"
        ? "正在載入搜尋資料"
        : terms.length === 0
          ? ""
          : hits.length === 0
            ? `找不到符合「${searchText.trim()}」的結果`
            : hits.length > options.length
              ? `找到 ${hits.length} 筆結果，列出最相關的 ${options.length} 筆，可用上下方向鍵選擇`
              : `找到 ${hits.length} 筆結果，可用上下方向鍵選擇`;
  useEffect(() => {
    const timer = window.setTimeout(
      () => setAnnouncement(statusMessage),
      statusMessage ? ANNOUNCE_DELAY : 0,
    );
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const go = (href: string) => {
    close(false);
    router.push(href);
  };

  const setText = (value: string) => {
    setQuery(value);
    setCommitted(value);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setQuery(value);
    // 注音、倉頡等輸入法組字中不搜尋，compositionend 時再更新
    if (!(event.nativeEvent as InputEvent).isComposing) setCommitted(value);
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    const count = options.length;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (count === 0) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setCursor({ list: options, index: (activeIndex + step + count) % count });
        return;
      }
      case "Enter": {
        event.preventDefault();
        const hit = options[activeIndex];
        if (hit) go(docHref(hit.doc));
        else if (query.trim()) go(searchPageHref(query));
        return;
      }
    }
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      // 自行處理，避免頁首大選單等文件層級的 Esc 監聽同時作用
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const items = focusableIn(dialog);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !dialog.contains(current))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (current === last || !dialog.contains(current))) {
      event.preventDefault();
      first.focus();
    }
  };

  /** 一般點擊結果：關閉視窗後由 next/link 換頁；Ctrl／⌘ 點擊等另開分頁時保留視窗 */
  const handleLinkClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (isPlainClick(event)) close(false);
  };

  const optionIndex = new Map(options.map((hit, position) => [hit, position]));
  const showAllHref = terms.length > 0 && hits.length > 0 ? searchPageHref(searchText) : undefined;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      onKeyDown={handleDialogKeyDown}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      // 點擊視窗外的遮罩關閉（按下與放開都在遮罩上，避免拖曳選字時誤關）
      onPointerDown={(event) => {
        backdropPressRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && backdropPressRef.current) close();
        backdropPressRef.current = false;
      }}
      className={cn(
        // 手機：全螢幕；sm 以上：上方置中的白色面板
        "fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-white p-0 text-slate-900 open:flex open:flex-col",
        "sm:mx-auto sm:mt-[10vh] sm:mb-auto sm:h-auto sm:max-h-[min(42rem,80dvh)] sm:w-[calc(100%-3rem)] sm:max-w-2xl sm:rounded-md sm:border sm:border-stroke sm:shadow-2xl sm:shadow-brand-950/20",
        "backdrop:bg-brand-950/40",
        "transition-[opacity,translate] duration-150 ease-out starting:opacity-0 motion-safe:starting:translate-y-1",
      )}
    >
      {open ? (
        <>
          <h2 id={titleId} className="sr-only">
            搜尋網站
          </h2>
          <p id={hintId} className="sr-only">
            可搜尋網站頁面、最新消息與歷屆畢業論文。輸入關鍵字後，以上下方向鍵選擇結果，Enter 開啟，Esc 關閉。
          </p>

          <div className="flex shrink-0 items-center gap-1 border-b border-stroke py-2 pr-2 pl-4 has-[input:focus-visible]:shadow-[inset_0_-2px_0_var(--color-brand-600)]">
            <Search aria-hidden="true" className="size-5 shrink-0 text-brand-700" strokeWidth={1.9} />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-label="搜尋關鍵字"
              aria-autocomplete="list"
              aria-expanded={options.length > 0}
              aria-controls={listboxId}
              aria-activedescendant={activeId}
              aria-describedby={hintId}
              inputMode="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={100}
              placeholder="搜尋頁面、最新消息、畢業論文…"
              value={query}
              onChange={handleChange}
              onCompositionEnd={(event) => setCommitted(event.currentTarget.value)}
              onKeyDown={handleInputKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent px-2 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  inputRef.current?.focus();
                }}
                className="inline-flex h-11 shrink-0 items-center rounded-md px-3 text-sm font-medium text-slate-600 transition-colors duration-200 hover:bg-surface hover:text-brand-900"
              >
                清除
              </button>
            ) : null}
            <button
              type="button"
              aria-label="關閉搜尋"
              onClick={() => close()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors duration-200 hover:bg-surface hover:text-brand-900"
            >
              <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
            </button>
          </div>

          {/* 捲動區不列入 Tab 順序（Chrome 預設讓可捲動區塊可聚焦）：選取由方向鍵控制並自動捲入可視範圍 */}
          <div tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 outline-none">
            {index.status === "error" ? (
              <StateMessage>
                <p className="font-medium text-brand-950">無法載入搜尋資料</p>
                <p className="mt-1 text-slate-600">請檢查網路連線後再試一次。</p>
                <button
                  type="button"
                  onClick={loadSearchIndex}
                  className="mt-4 inline-flex min-h-11 items-center rounded-md bg-white px-4 text-sm font-semibold text-brand-900 ring-1 ring-stroke ring-inset transition-colors duration-200 hover:bg-brand-50 hover:ring-brand-200"
                >
                  重新載入
                </button>
              </StateMessage>
            ) : index.status !== "ready" ? (
              <StateMessage>
                <p className="flex items-center gap-2 text-slate-600">
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 text-brand-600 motion-safe:animate-spin"
                  />
                  正在載入搜尋資料…
                </p>
              </StateMessage>
            ) : terms.length === 0 ? (
              <StateMessage>
                <p className="text-xs font-semibold tracking-[0.08em] text-champagne-700">建議搜尋</p>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map((word) => (
                    <li key={word}>
                      <button
                        type="button"
                        onClick={() => {
                          setText(word);
                          inputRef.current?.focus();
                        }}
                        className="inline-flex min-h-9 items-center rounded-sm bg-white px-3 text-sm font-medium text-slate-700 ring-1 ring-stroke ring-inset transition-colors duration-200 hover:bg-brand-50 hover:text-brand-900 hover:ring-brand-200"
                      >
                        {word}
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-slate-600">
                  可搜尋網站頁面、最新消息，以及歷屆畢業論文的題目、研究生與指導教授。
                </p>
              </StateMessage>
            ) : options.length === 0 ? (
              <StateMessage>
                <p className="font-medium text-brand-950">找不到符合「{searchText.trim()}」的結果</p>
                <p className="mt-1 text-slate-600">
                  請改用較短或不同的關鍵字，或瀏覽
                  <Link
                    href="/sitemap"
                    prefetch={false}
                    onClick={handleLinkClick}
                    className="mx-0.5 font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-700"
                  >
                    網站導覽
                  </Link>
                  。
                </p>
              </StateMessage>
            ) : null}

            <div id={listboxId} role="listbox" aria-label="搜尋結果" hidden={options.length === 0}>
              {groups.map((group) => {
                const groupId = `${baseId}-group-${group.type}`;
                return (
                  <ul
                    key={group.type}
                    role="group"
                    aria-labelledby={groupId}
                    className="py-1.5 not-first:mt-1 not-first:border-t not-first:border-stroke not-first:pt-2.5"
                  >
                    <li
                      role="presentation"
                      id={groupId}
                      className="px-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-champagne-700"
                    >
                      {group.label}
                    </li>
                    {group.hits.map((hit) => {
                      const position = optionIndex.get(hit) ?? 0;
                      return (
                        <li key={docHref(hit.doc)} role="presentation">
                          <ResultOption
                            id={optionId(position)}
                            hit={hit}
                            terms={terms}
                            active={position === activeIndex}
                            onClick={handleLinkClick}
                            onPointerMove={() => {
                              if (position !== activeIndex) setCursor({ list: options, index: position });
                            }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                );
              })}
            </div>
          </div>

          {showAllHref ? (
            <div className="flex shrink-0 items-center justify-between gap-4 border-t border-stroke bg-surface px-4 py-1">
              <KeyHints />
              <Link
                href={showAllHref}
                prefetch={false}
                onClick={handleLinkClick}
                className="group ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline"
              >
                查看全部結果
                <span className="font-normal text-slate-600 tabular-nums">（{hits.length}）</span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          ) : (
            <div className="hidden shrink-0 border-t border-stroke bg-surface px-4 py-3 sm:flex">
              <KeyHints />
            </div>
          )}

          <div role="status" className="sr-only">
            {announcement}
          </div>
        </>
      ) : null}
    </dialog>
  );
}

function StateMessage({ children }: { children: ReactNode }) {
  return <div className="px-3 py-5 text-sm text-slate-700">{children}</div>;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-white px-1 font-sans text-[0.6875rem] font-medium text-slate-700 ring-1 ring-stroke">
      {children}
    </kbd>
  );
}

/** 鍵盤操作提示（視覺用；螢幕閱讀器由輸入框的 aria-describedby 取得同樣說明） */
function KeyHints() {
  return (
    <p aria-hidden="true" className="hidden items-center gap-4 text-xs text-slate-600 sm:flex">
      <span className="inline-flex items-center gap-1">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        選擇
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Enter</Kbd>
        開啟
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Esc</Kbd>
        關閉
      </span>
    </p>
  );
}

type ResultOptionProps = {
  id: string;
  hit: SearchHit;
  terms: readonly SearchTerm[];
  active: boolean;
  onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
  onPointerMove: () => void;
};

function ResultOption({ id, hit, terms, active, onClick, onPointerMove }: ResultOptionProps) {
  const { doc } = hit;
  const Icon = typeIcons[doc.type];
  const display = hitDisplay(doc, terms);

  // 名稱取自全部內容（標題、說明、摘要），與畫面文字一致（WCAG 2.5.3 Label in Name）
  return (
    <Link
      id={id}
      href={docHref(doc)}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      prefetch={false}
      onClick={onClick}
      onPointerMove={onPointerMove}
      className={cn(
        "flex items-start gap-3 rounded-sm px-3 py-2.5 transition-colors duration-150",
        active
          ? "bg-brand-50 shadow-[inset_2px_0_0_var(--color-brand-600)] forced-colors:outline-2 forced-colors:outline-offset-[-2px] forced-colors:outline-[Highlight]"
          : "hover:bg-surface",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-white ring-1 transition-colors duration-150",
          active ? "text-brand-700 ring-brand-200" : "text-brand-600 ring-stroke",
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[0.9375rem] leading-snug font-medium text-brand-950">
          <Highlight text={doc.title} terms={terms} />
        </span>
        <span className="block">
          {display.titleEn ? (
            <span lang="en" className="mt-0.5 block truncate text-sm text-slate-600">
              <Highlight text={display.titleEn} terms={terms} />
            </span>
          ) : null}
          {display.meta ? (
            <span className="mt-0.5 block truncate text-xs text-slate-600">
              <Highlight text={display.meta} terms={terms} />
            </span>
          ) : null}
          {display.excerpt ? (
            <span className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">
              <Highlight text={display.excerpt} terms={terms} />
            </span>
          ) : null}
        </span>
      </span>
      <CornerDownLeft
        aria-hidden="true"
        className={cn(
          "mt-1 size-4 shrink-0 text-brand-600 transition-opacity duration-150",
          active ? "opacity-100" : "opacity-0",
        )}
      />
    </Link>
  );
}
