"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type CurriculumTabItem = {
  id: string;
  label: string;
  englishLabel: string;
  /** 由 Server Component 預先渲染的面板內容 */
  panel: ReactNode;
};

type CurriculumTabsClientProps = {
  tabs: readonly CurriculumTabItem[];
  /** 對應 role="tablist" 的 aria-label */
  label: string;
  className?: string;
};

const tabId = (id: string) => `curriculum-tab-${id}`;
const panelId = (id: string) => `curriculum-panel-${id}`;

/**
 * WAI-ARIA APG Tabs（自動啟用）：方向鍵左右循環、Home／End 跳至首尾，
 * 焦點移動即切換面板。面板全數輸出並以 hidden 切換，確保 aria-controls 皆有對應元素。
 */
export function CurriculumTabsClient({
  tabs,
  label,
  className,
}: CurriculumTabsClientProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = tabs.length - 1;
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = index === lastIndex ? 0 : index + 1;
        break;
      case "ArrowLeft":
        nextIndex = index === 0 ? lastIndex : index - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = lastIndex;
        break;
      default:
        return;
    }

    event.preventDefault();
    setSelectedIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={className}>
      {/* 手機版三個分頁直向堆疊，sm 起等寬三欄，不產生橫向捲動 */}
      <div
        role="tablist"
        aria-label={label}
        className="grid grid-cols-1 gap-1 rounded-md border border-stroke bg-surface p-1 sm:grid-cols-3"
      >
        {tabs.map((tab, index) => {
          const selected = index === selectedIndex;

          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              // 頂端對齊：英文副標換行數不同時，各分頁標題列仍在同一水平。
              // 強制色彩模式（Windows 高對比）會移除背景色，選取分頁改以系統 Highlight 邊框標示，
              // 與焦點外框（outline）區隔。
              className={cn(
                "flex min-h-14 min-w-0 items-baseline justify-start gap-3 rounded-sm px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-offset-2 sm:px-3.5 lg:px-5",
                selected
                  ? "bg-brand-900 text-white shadow-sm forced-colors:border-2 forced-colors:border-[color:Highlight]"
                  : "text-brand-900 hover:bg-white",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "text-xs font-medium tabular-nums sm:hidden lg:inline",
                  selected ? "text-champagne-300" : "text-slate-600",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[0.9375rem] leading-snug font-semibold text-balance">
                  {tab.label}
                </span>
                <span
                  lang="en"
                  className={cn(
                    "mt-1 text-xs leading-4 text-balance",
                    selected ? "text-brand-100" : "text-slate-600",
                  )}
                >
                  {tab.englishLabel}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={panelId(tab.id)}
          aria-labelledby={tabId(tab.id)}
          tabIndex={0}
          hidden={index !== selectedIndex}
          className="mt-8 rounded-md transition-[opacity,translate] duration-300 ease-out focus-visible:outline-offset-4 starting:translate-y-1 starting:opacity-0 lg:mt-10"
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
