import { FileText, GraduationCap, LayoutGrid, Newspaper, type LucideIcon } from "lucide-react";
import {
  excerptAround,
  hitExcerpt,
  type SearchDoc,
  type SearchTerm,
  type SearchType,
} from "@/lib/search";

export const typeIcons: Record<SearchType, LucideIcon> = {
  page: FileText,
  section: LayoutGrid,
  news: Newspaper,
  thesis: GraduationCap,
};

export type HitDisplay = {
  /**
   * 英文標題（論文）。alwaysShowTitleEn 為 false 時只在有命中時顯示，且自命中處前約 20 字開始，
   * 單行截斷（搜尋視窗）時命中的字才看得到
   */
  titleEn?: string;
  meta?: string;
  excerpt?: string;
};

/** 結果列要顯示的補充文字：命中的英文標題、補充說明與內文摘要 */
export function hitDisplay(
  doc: SearchDoc,
  terms: readonly SearchTerm[],
  options: { excerptLength?: number; alwaysShowTitleEn?: boolean } = {},
): HitDisplay {
  const { excerptLength = 96, alwaysShowTitleEn = false } = options;
  return {
    titleEn: alwaysShowTitleEn ? doc.titleEn : excerptAround(doc.titleEn, terms, 160, 20),
    meta: doc.meta,
    excerpt: hitExcerpt(doc, terms, excerptLength),
  };
}
