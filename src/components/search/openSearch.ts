"use client";

/**
 * 開啟全站搜尋視窗的全域事件。頁首的搜尋鈕與行動版選單項目都只送出事件，
 * 由同一份頁首內的 <SearchDialog> 接收；Activity 保留的隱藏路由已移除監聽，不會一起開啟。
 */
export const OPEN_SEARCH_EVENT = "emrd:open-search";

export type OpenSearchDetail = {
  /** 關閉後要歸還焦點的元素；省略時為開啟當下的焦點元素 */
  trigger: HTMLElement | null;
};

export function openSearch(trigger: HTMLElement | null = null) {
  window.dispatchEvent(
    new CustomEvent<OpenSearchDetail>(OPEN_SEARCH_EVENT, { detail: { trigger } }),
  );
}

/**
 * 頁首搜尋鈕的標記（SearchButton 輸出 data-search-trigger）：歸還焦點的元素已隱藏時
 * （例如行動版選單已收合），改聚焦顯示中的搜尋鈕。
 */
export const SEARCH_TRIGGER_SELECTOR = "[data-search-trigger]";
