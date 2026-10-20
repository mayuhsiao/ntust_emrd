import Link from "next/link";
import { ChevronDown, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/cn";
import { groupHref, hrefFor, type IaGroup } from "@/lib/ia";

type SideNavProps = {
  group: IaGroup;
  /** 目前頁面的 slug；群組總覽頁傳入 group.key */
  activeSlug?: string;
  /**
   * 目前項目的 aria-current 值：清單頁本身為 "page"（預設）；
   * 文章頁標示其所屬列表時用 "true"，避免螢幕閱讀器把列表頁報讀為「目前頁面」
   */
  currentType?: "page" | "true";
};

type NavLink = { href: string; label: string; active: boolean; overview?: boolean };

function navLinks(group: IaGroup, activeSlug?: string): NavLink[] {
  const links: NavLink[] = [];
  const overviewHref = groupHref(group);
  const hasOverviewPage = !group.pages.some((page) => page.slug === group.key);
  if (hasOverviewPage) {
    links.push({
      href: overviewHref,
      label: `${group.label}總覽`,
      active: activeSlug === group.key,
      overview: true,
    });
  }
  for (const page of group.pages) {
    links.push({ href: hrefFor(page.slug), label: page.label, active: page.slug === activeSlug });
  }
  return links;
}

function LinkList({
  links,
  compact = false,
  currentType,
}: {
  links: NavLink[];
  compact?: boolean;
  currentType: "page" | "true";
}) {
  return (
    <ul className={cn("grid", compact ? "gap-0.5 p-2" : "gap-0.5")}>
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            // 單元頁面數量少且皆為靜態頁：完整預先載入，點擊後不必再等伺服器回應
            prefetch={true}
            aria-current={link.active ? currentType : undefined}
            className={cn(
              "group relative flex min-h-11 items-center gap-2 rounded-sm py-2 pr-3 pl-4 text-[0.9375rem] leading-snug transition-colors duration-200",
              link.active
                ? "bg-brand-50 font-semibold text-brand-900"
                : "text-slate-700 hover:bg-surface hover:text-brand-900",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute inset-y-2 left-0 w-0.5 rounded-full",
                link.active ? "bg-brand-600" : "bg-transparent group-hover:bg-stroke",
              )}
            />
            {link.overview ? (
              <LayoutGrid aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
            ) : null}
            <span className="min-w-0 flex-1">{link.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * 單元側欄：桌機為黏貼於頁首下方的頁面清單；行動版收合為內容上方的「本單元頁面」。
 * 以原生 <details> 實作收合，不需 JavaScript，鍵盤與螢幕閱讀器皆可操作。
 */
export function SideNav({ group, activeSlug, currentType = "page" }: SideNavProps) {
  const links = navLinks(group, activeSlug);
  const current = links.find((link) => link.active);

  return (
    <nav aria-label={`${group.label}單元頁面`} className="lg:sticky lg:top-28">
      <details className="group/details rounded-md border border-stroke bg-white lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-md px-4 py-2 text-[0.9375rem] font-medium text-brand-950 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <span>本單元頁面</span>
            <span className="truncate text-sm font-normal text-slate-600">
              {group.label}
              {current ? `／${current.label}` : null}
            </span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="size-5 shrink-0 text-brand-600 transition-transform duration-200 group-open/details:rotate-180"
          />
        </summary>
        <div className="border-t border-stroke">
          <LinkList links={links} compact currentType={currentType} />
        </div>
      </details>

      <div className="hidden lg:block">
        <p className="flex items-center gap-3 border-b border-stroke pb-4 text-base font-semibold tracking-[0.02em] text-brand-950">
          <span aria-hidden="true" className="h-4 w-0.5 bg-champagne-500" />
          {group.label}
        </p>
        <div className="mt-3">
          <LinkList links={links} currentType={currentType} />
        </div>
      </div>
    </nav>
  );
}
