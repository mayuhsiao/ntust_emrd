"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TABLE_REGION_ATTR } from "./legacyTableRegion";

/** 捲動提示的 class（樣式見 globals.css 的 .legacy-table-hint） */
const HINT_CLASS = "legacy-table-hint";
/** 左右箭頭（同 lucide 的 move-horizontal），純裝飾 */
const HINT_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/></svg>';

function hintOf(region: HTMLElement) {
  const previous = region.previousElementSibling;
  return previous instanceof HTMLElement && previous.classList.contains(HINT_CLASS) ? previous : null;
}

function createHint() {
  const hint = document.createElement("div");
  hint.className = HINT_CLASS;
  // 螢幕閱讀器由 region 名稱「…（可左右捲動）」得知，提示只給視覺使用者
  hint.setAttribute("aria-hidden", "true");
  hint.innerHTML = `${HINT_ICON}<span>可左右滑動查看</span>`;
  return hint;
}

/**
 * 資料表的捲動外框只在「真的需要左右捲動」時才是可聚焦的具名 region（WCAG 2.1.1）：
 * 伺服器輸出的 HTML 一律帶 role="region"、aria-label 與 tabindex="0"（未執行 JavaScript 時仍可用鍵盤捲動），
 * 掛載後依 scrollWidth 與 clientWidth 比較，不需捲動的表格移除這三個屬性，視窗寬度改變時重新判斷。
 * 需要捲動時另在外框上方插入「可左右滑動查看」提示（外框兩側的捲動陰影由 CSS 負責，不需 JavaScript）。
 *
 * 只修改 dangerouslySetInnerHTML 內容的屬性與提示節點，且在水合完成後的 effect 中進行，不會造成水合不一致；
 * 外層 display: contents，不影響版面。
 */
export function LegacyTableRegions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const regions = Array.from(root.querySelectorAll<HTMLElement>(`[${TABLE_REGION_ATTR}]`));
    if (regions.length === 0) return;

    const update = (region: HTMLElement) => {
      const scrollable = region.scrollWidth > region.clientWidth + 1;
      const hint = hintOf(region);
      if (scrollable) {
        region.setAttribute("role", "region");
        region.setAttribute("aria-label", region.getAttribute(TABLE_REGION_ATTR) || "表格");
        region.tabIndex = 0;
        if (!hint) region.before(createHint());
        return;
      }
      hint?.remove();
      if (document.activeElement !== region) {
        region.removeAttribute("role");
        region.removeAttribute("aria-label");
        region.removeAttribute("tabindex");
      }
    };

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const region = (entry.target as HTMLElement).closest<HTMLElement>(`[${TABLE_REGION_ATTR}]`);
        if (region) update(region);
      }
    });
    for (const region of regions) {
      update(region);
      observer.observe(region);
      const table = region.querySelector("table");
      if (table) observer.observe(table);
    }
    return () => {
      observer.disconnect();
      // 開發模式 StrictMode 會重跑 effect：先移除已插入的提示，重跑時才不會重複
      for (const region of regions) hintOf(region)?.remove();
    };
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
