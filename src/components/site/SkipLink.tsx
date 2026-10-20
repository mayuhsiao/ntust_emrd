"use client";

import type { MouseEvent, ReactNode } from "react";

/** 各頁 <main> 的 id（首頁、內頁外框、404、隱私權政策與網站導覽皆相同） */
const MAIN_ID = "main";

/** 元素是否實際顯示：Activity 保留的隱藏路由以 display: none 留在文件中 */
function isRendered(element: HTMLElement) {
  return typeof element.checkVisibility === "function"
    ? element.checkVisibility()
    : element.getClientRects().length > 0;
}

/**
 * 「跳到主要內容」連結（置於根版面，不隨路由隱藏）。
 *
 * Cache Components 以 <Activity> 保留最多 3 個離開的路由（DOM 仍在文件中、display: none），
 * 因此文件內可能同時有數個 <main id="main">；原生 #main 會跳到文件順序第一個、可能是隱藏的那個。
 * 點擊時改為聚焦「目前顯示中」的 <main>（tabIndex=-1），不改變網址；
 * 尚未 hydrate 或找不到時退回原生的錨點跳轉（首次載入時文件中只有一個 <main>）。
 */
export function SkipLink({ className, children }: { className?: string; children: ReactNode }) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = Array.from(
      document.querySelectorAll<HTMLElement>(`[id="${MAIN_ID}"]`),
    ).find(isRendered);
    if (!target) return;
    event.preventDefault();
    // 與原生錨點相同：捲到 <main> 頂端（遵循 scroll-padding-top）並把焦點移入
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  };

  return (
    <a href={`#${MAIN_ID}`} onClick={handleClick} className={className}>
      {children}
    </a>
  );
}
