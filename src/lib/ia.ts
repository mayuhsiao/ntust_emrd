/**
 * 全站資訊架構（取代 emrd.ntust.edu.tw）：選單群組、頁面查詢與麵包屑。
 * 資料來源為 src/content/legacy/ia.json，與搬遷腳本共用同一份對照表。
 */
import ia from "@/content/legacy/ia.json";

export type IaPage = {
  /** 不含開頭斜線，例如 "faculty/speakers" */
  slug: string;
  label: string;
  /** 原站頁面代碼，例如 "412-1039-11665" */
  legacy?: string;
  /** 最新消息類的文章列表單元 */
  collection?: boolean;
  /** 頁面的 meta description（ia.json 撰寫） */
  description?: string;
};

export type IaGroup = {
  key: string;
  label: string;
  englishLabel: string;
  /** 單元簡介（一至兩句）：大選單左欄、群組總覽頁導言與 meta description 共用 */
  description: string;
  legacy?: string;
  /** 首頁對應區塊（例如 /#features） */
  overview?: { label: string; href: string };
  pages: IaPage[];
};

export type Crumb = { label: string; href: string };

export const groups: readonly IaGroup[] = ia.groups;
export const standalonePages: readonly IaPage[] = ia.standalone;

export function hrefFor(slug: string) {
  return `/${slug}`;
}

/** 群組的入口網址：最新消息以公告欄為入口，其餘為 /{group.key} 總覽頁 */
export function groupHref(group: IaGroup) {
  return group.pages.some((page) => page.slug === group.key)
    ? hrefFor(group.key)
    : `/${group.key}`;
}

export function findGroup(key: string) {
  return groups.find((group) => group.key === key);
}

/** 依 slug 找出頁面與所屬群組（獨立頁沒有群組） */
export function findPage(slug: string): { page: IaPage; group?: IaGroup } | undefined {
  for (const group of groups) {
    const page = group.pages.find((item) => item.slug === slug);
    if (page) return { page, group };
  }
  const page = standalonePages.find((item) => item.slug === slug);
  return page ? { page } : undefined;
}

export function breadcrumbs(slug: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "首頁", href: "/" }];
  const group = findGroup(slug);
  if (group) {
    crumbs.push({ label: group.label, href: groupHref(group) });
    return crumbs;
  }
  const found = findPage(slug);
  if (!found) return crumbs;
  if (found.group && found.page.slug !== found.group.key) {
    crumbs.push({ label: found.group.label, href: groupHref(found.group) });
  }
  crumbs.push({ label: found.page.label, href: hrefFor(found.page.slug) });
  return crumbs;
}
