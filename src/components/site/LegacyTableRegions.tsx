"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { TABLE_REGION_ATTR } from "./legacyTableRegion";

/**
 * 資料表的捲動外框只在「真的需要左右捲動」時才是可聚焦的具名 region（WCAG 2.1.1）：
 * 伺服器輸出的 HTML 一律帶 role="region"、aria-label 與 tabindex="0"（未執行 JavaScript 時仍可用鍵盤捲動），
 * 掛載後依 scrollWidth 與 clientWidth 比較，不需捲動的表格移除這三個屬性，視窗寬度改變時重新判斷。
 *
 * 只修改 dangerouslySetInnerHTML 內容的屬性，且在水合完成後的 effect 中進行，不會造成水合不一致；
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
      if (scrollable) {
        region.setAttribute("role", "region");
        region.setAttribute("aria-label", region.getAttribute(TABLE_REGION_ATTR) || "表格");
        region.tabIndex = 0;
      } else if (document.activeElement !== region) {
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
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
