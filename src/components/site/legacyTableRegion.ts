/**
 * 資料表捲動外框的資料屬性（值為 region 的名稱）。legacyHtml.ts 於伺服器端寫入，
 * LegacyTableRegions（Client Component）依表格是否真的需要左右捲動切換 role／aria-label／tabindex。
 * 獨立成檔，避免 Client Component 匯入伺服器端的 HTML 改寫模組。
 */
export const TABLE_REGION_ATTR = "data-scroll-region";
