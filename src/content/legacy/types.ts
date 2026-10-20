/**
 * 原 EMRD 網站搬遷內容的資料格式（由 scripts/migrate_legacy.py 產生於 src/content/legacy/data/）。
 * html 欄位皆已在搬遷時清洗（白名單標籤／屬性），站內連結與圖片已改寫為新網址。
 */

export type LegacyAttachment = {
  label: string;
  href: string;
  /** 例如 "PDF · 1.2 MB" */
  meta?: string;
};

/** 頁面中的條目清單（例：法規、表單下載、隨班附讀公告） */
export type LegacyListItem = {
  title: string;
  href: string;
  external: boolean;
  /** YYYY-MM-DD */
  date?: string;
};

export type LegacyPage = {
  slug: string;
  title: string;
  legacyUrl: string;
  html: string;
  items: LegacyListItem[];
  attachments: LegacyAttachment[];
};

export type LegacyPost = {
  id: string;
  title: string;
  legacyUrl: string;
  /** YYYY-MM-DD；原站未提供時省略 */
  date?: string;
  /** 所屬單元 slug，例如 ["news", "news/events"] */
  collections: string[];
  html: string;
  attachments: LegacyAttachment[];
  /** 文章內第一張圖片（列表縮圖用） */
  cover?: string;
};

export type LegacyCollection = {
  slug: string;
  title: string;
  legacyUrl: string;
  /** 依原站排序（新到舊） */
  postIds: string[];
};
