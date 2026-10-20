import { cn } from "@/lib/cn";
import { transformLegacyHtml } from "./legacyHtml";
import { TABLE_REGION_ATTR } from "./legacyTableRegion";
import { LegacyTableRegions } from "./LegacyTableRegions";

type LegacyContentProps = {
  /** 搬遷腳本已清洗（白名單標籤／屬性）的 HTML */
  html: string;
  className?: string;
};

/** 內容的簡短雜湊（FNV-1a），內容不同時讓 LegacyTableRegions 重新掛載並重新檢查表格 */
function contentKey(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * 原站內容區塊（Server Component）。HTML 於伺服器端改寫一次後直接輸出，
 * 排版由 globals.css 的 .legacy-prose 區塊負責。含資料表時另由 LegacyTableRegions
 * 依表格是否需要左右捲動調整其 region／tabindex。
 */
export function LegacyContent({ html, className }: LegacyContentProps) {
  if (!html.trim()) return null;
  const output = transformLegacyHtml(html);
  const content = (
    <div
      className={cn("legacy-prose", className)}
      // 內容來源為搬遷腳本白名單清洗後的站內資料，非使用者輸入
      dangerouslySetInnerHTML={{ __html: output }}
    />
  );
  if (!output.includes(TABLE_REGION_ATTR)) return content;
  return <LegacyTableRegions key={contentKey(output)}>{content}</LegacyTableRegions>;
}
