"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";
import { groupHref, groups, hrefFor, type IaGroup } from "@/lib/ia";
import { site } from "@/lib/site";

/** 與 Tailwind `lg` 斷點（64rem）一致：以上為大選單，以下為行動版手風琴 */
export const DESKTOP_QUERY = "(min-width: 64rem)";

/** 有獨立總覽頁（/about 等）的群組；最新消息以頁面清單中的公告欄（/news）為入口 */
function hasOverviewPage(group: IaGroup) {
  return !group.pages.some((page) => page.slug === group.key);
}

/** 目前路徑所屬的群組 key（首頁、獨立頁與文章頁沒有群組） */
export function groupKeyForPath(pathname: string | null) {
  if (!pathname || pathname === "/") return null;
  for (const group of groups) {
    const base = groupHref(group);
    if (
      pathname === base ||
      pathname.startsWith(`/${group.key}/`) ||
      group.pages.some((page) => hrefFor(page.slug) === pathname)
    ) {
      return group.key;
    }
  }
  return null;
}

/** 首頁 scroll-spy：群組總覽錨點（/#features 等）→ 群組 key */
export const homeSectionGroups: ReadonlyMap<string, string> = new Map(
  groups.flatMap((group) =>
    group.overview?.href.startsWith("/#")
      ? [[group.overview.href.slice(2), group.key] as const]
      : [],
  ),
);

const triggerSelector = "[data-mega-trigger]";
const triggerIdFor = (baseId: string, key: string) => `${baseId}-trigger-${key}`;
const panelIdFor = (baseId: string, key: string) => `${baseId}-panel-${key}`;

type DesktopMegaNavProps = {
  pathname: string | null;
  /** 需標示的群組：內頁依路徑、首頁依 scroll-spy */
  activeKey: string | null;
  /** 主導覽列為白底（已捲動或行動選單展開） */
  onLight: boolean;
  /** 已捲過工具列：面板上緣緊貼視窗頂端的主導覽列 */
  isScrolled: boolean;
};

/**
 * 桌機大選單（WAI-ARIA APG「Disclosure Navigation Menu」）：
 * 頂層為 <button aria-expanded aria-controls>，一次僅展開一個面板；
 * 再次點擊、Esc、點擊選單外或焦點離開導覽時收合。左右方向鍵／Home／End 於頂層按鈕間移動。
 */
export function DesktopMegaNav({
  pathname,
  activeKey,
  onLight,
  isScrolled,
}: DesktopMegaNavProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const baseId = useId();

  const close = () => setOpenKey(null);

  // Cache Components 以 <Activity> 保留離開的路由；隱藏時收合，返回時不殘留展開的面板
  useLayoutEffect(() => () => setOpenKey(null), []);

  // 面板開啟期間：Esc 收合並歸還焦點、點擊導覽外收合、縮小至行動版斷點時收合
  useEffect(() => {
    if (!openKey) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenKey(null);
      document.getElementById(triggerIdFor(baseId, openKey))?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && navRef.current?.contains(event.target)) {
        return;
      }
      setOpenKey(null);
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const handleBreakpoint = (event: MediaQueryListEvent) => {
      if (!event.matches) setOpenKey(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    desktop.addEventListener("change", handleBreakpoint);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      desktop.removeEventListener("change", handleBreakpoint);
    };
  }, [openKey, baseId]);

  // 焦點移出整個導覽（Tab 至 CTA 或頁面內容）時收合
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (openKey && next instanceof Node && !event.currentTarget.contains(next)) {
      setOpenKey(null);
    }
  };

  const handleTriggerKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const triggers = Array.from(
      navRef.current?.querySelectorAll<HTMLButtonElement>(triggerSelector) ?? [],
    );
    const last = triggers.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = index === last ? 0 : index + 1;
        break;
      case "ArrowLeft":
        next = index === 0 ? last : index - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    triggers[next]?.focus();
  };

  return (
    <nav
      ref={navRef}
      aria-label="主要導覽"
      onBlur={handleBlur}
      className="hidden self-stretch lg:block"
    >
      <ul className="flex h-full">
        {groups.map((group, index) => {
          const isOpen = openKey === group.key;
          const isActive = activeKey === group.key;
          // 有面板展開時只標示展開中的項目，避免同時出現兩條底線
          const showMarker = openKey ? isOpen : isActive;
          const emphasized = isOpen || isActive;

          return (
            <li key={group.key}>
              <button
                id={triggerIdFor(baseId, group.key)}
                type="button"
                data-mega-trigger=""
                aria-expanded={isOpen}
                aria-controls={panelIdFor(baseId, group.key)}
                aria-current={isActive ? "true" : undefined}
                onClick={() =>
                  setOpenKey((current) => (current === group.key ? null : group.key))
                }
                onFocus={() => {
                  // 焦點移到其他頂層按鈕時收合原面板（點擊其他按鈕則隨即展開該面板）
                  if (openKey && openKey !== group.key) setOpenKey(null);
                }}
                onKeyDown={(event) => handleTriggerKeyDown(event, index)}
                className={cn(
                  "relative inline-flex h-full items-center gap-1 px-2.5 text-[0.9375rem] font-medium whitespace-nowrap transition-colors duration-300 focus-visible:-outline-offset-2 xl:px-3",
                  onLight
                    ? emphasized
                      ? "text-brand-900"
                      : "text-slate-600 hover:text-brand-900"
                    : cn(
                        "focus-visible:outline-champagne-200",
                        emphasized ? "text-white" : "text-white/85 hover:text-white",
                      ),
                )}
              >
                {group.label}
                <ChevronDown
                  aria-hidden="true"
                  strokeWidth={2}
                  className={cn(
                    "size-3.5 shrink-0 transition-[rotate,color] duration-200",
                    isOpen && "rotate-180",
                    onLight ? "text-slate-500" : "text-brand-200",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-2.5 bottom-0 h-0.5 transition-[scale,background-color] duration-300 xl:inset-x-3",
                    onLight ? "bg-brand-600" : "bg-champagne-300",
                    showMarker ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </button>

              <MegaPanel
                id={panelIdFor(baseId, group.key)}
                group={group}
                hidden={!isOpen}
                pathname={pathname}
                isScrolled={isScrolled}
                onNavigate={close}
              />
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

type MegaPanelProps = {
  id: string;
  group: IaGroup;
  hidden: boolean;
  pathname: string | null;
  isScrolled: boolean;
  onNavigate: () => void;
};

const leadLinkClass =
  "group/lead inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[0.9375rem] font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline";

/** 頁首下方的全寬白色面板：左欄單元介紹與總覽連結，右欄為該單元所有頁面 */
function MegaPanel({
  id,
  group,
  hidden,
  pathname,
  isScrolled,
  onNavigate,
}: MegaPanelProps) {
  const titleId = `${id}-title`;
  const overviewHref = groupHref(group);
  const showOverviewPage = hasOverviewPage(group);

  return (
    <div
      id={id}
      hidden={hidden}
      className={cn(
        // 以 sticky 頁首（捲動後為磨砂玻璃列）為定位基準，橫跨整個視窗寬度
        "absolute inset-x-0 top-full overflow-y-auto overscroll-contain border-b border-stroke bg-white text-left shadow-lg shadow-brand-950/5 transition-[opacity,translate] duration-150 ease-out starting:opacity-0 motion-safe:starting:-translate-y-1",
        // 尚未捲過工具列時，面板上緣多了工具列的高度
        isScrolled ? "max-h-[calc(100dvh-5rem)]" : "max-h-[calc(100dvh-7.5rem)]",
      )}
    >
      <Container className="grid gap-8 py-10 lg:grid-cols-12 xl:py-12">
        <div className="lg:col-span-4">
          <p
            lang="en"
            className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase"
          >
            <span aria-hidden="true" className="h-px w-8 bg-champagne-500/70" />
            {group.englishLabel}
          </p>
          <p
            id={titleId}
            className="mt-3 text-2xl leading-snug font-semibold tracking-[0.01em] text-brand-950"
          >
            {group.label}
          </p>
          {group.description ? (
            <p className="mt-3 max-w-sm text-[0.9375rem] leading-relaxed text-pretty text-slate-600">
              {group.description}
            </p>
          ) : null}

          {group.overview || showOverviewPage ? (
            <ul className="mt-5 flex flex-wrap items-center gap-x-6">
              {group.overview ? (
                <li>
                  <Link
                    href={group.overview.href}
                    onClick={onNavigate}
                    className={leadLinkClass}
                  >
                    {group.overview.label}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 transition-transform duration-200 group-hover/lead:translate-x-0.5"
                    />
                  </Link>
                </li>
              ) : null}
              {showOverviewPage ? (
                <li>
                  <Link
                    href={overviewHref}
                    onClick={onNavigate}
                    aria-current={pathname === overviewHref ? "page" : undefined}
                    className={leadLinkClass}
                  >
                    <span className="sr-only">{group.label}</span>
                    單元總覽
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 transition-transform duration-200 group-hover/lead:translate-x-0.5"
                    />
                  </Link>
                </li>
              ) : null}
            </ul>
          ) : null}

          {/* 主導覽列寬度只容得下一個 CTA，簡章下載於招生專區面板提供 */}
          {group.key === "admissions" ? (
            <ButtonLink
              href={site.links.brochurePdf}
              variant="secondary"
              external
              title={`${site.links.brochureLabel}（PDF）`}
              onClick={onNavigate}
              className="mt-5"
            >
              <Download aria-hidden="true" className="size-4" />
              報考簡章下載 (PDF)
            </ButtonLink>
          ) : null}
        </div>

        <div className="lg:col-span-8 lg:border-l lg:border-stroke lg:pl-8">
          <ul
            aria-labelledby={titleId}
            className={cn(
              "grid content-start gap-x-8 lg:grid-cols-2",
              group.pages.length > 4 && "xl:grid-cols-3",
            )}
          >
            {group.pages.map((page) => {
              const href = hrefFor(page.slug);
              const isCurrent = pathname === href;
              return (
                <li key={page.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "group/link flex min-h-14 items-center justify-between gap-4 border-b py-3 text-base transition-colors duration-200",
                      isCurrent
                        ? "border-brand-600 font-semibold text-brand-700"
                        : "border-stroke font-medium text-brand-900 hover:border-brand-200 hover:text-brand-700",
                    )}
                  >
                    <span className="min-w-0 text-pretty">{page.label}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-brand-600 transition-transform duration-200 group-hover/link:translate-x-1"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </Container>
    </div>
  );
}

type MobileNavGroupsProps = {
  pathname: string | null;
  onNavigate: () => void;
};

const mobileLinkClass =
  "group flex min-h-11 items-center gap-2 rounded-md px-3 text-[0.9375rem] transition-colors duration-200";

/**
 * 行動版主選單：每個單元為手風琴（<button aria-expanded>），一次展開一個；
 * 開啟時預設展開目前頁面所屬的單元。換頁時由父層以 key 重設。
 */
export function MobileNavGroups({ pathname, onNavigate }: MobileNavGroupsProps) {
  const currentKey = groupKeyForPath(pathname);
  const [expandedKey, setExpandedKey] = useState<string | null>(currentKey);
  const baseId = useId();

  return (
    <nav aria-label="主要導覽">
      <ul className="grid gap-1">
        {groups.map((group) => {
          const expanded = expandedKey === group.key;
          const isCurrent = currentKey === group.key;
          const panelId = `${baseId}-${group.key}`;
          const overviewHref = groupHref(group);

          return (
            <li key={group.key}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-current={isCurrent ? "true" : undefined}
                onClick={() =>
                  setExpandedKey((key) => (key === group.key ? null : group.key))
                }
                className={cn(
                  "flex min-h-12 w-full items-center gap-3 rounded-md px-4 text-left text-base font-medium transition-colors duration-200",
                  isCurrent || expanded
                    ? "text-brand-900"
                    : "text-slate-700 hover:text-brand-900",
                  expanded ? "bg-surface" : "hover:bg-surface",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-5 w-0.5 shrink-0",
                    isCurrent ? "bg-brand-600" : "bg-transparent",
                  )}
                />
                <span className="flex-1">{group.label}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 text-slate-500 transition-[rotate] duration-200",
                    expanded && "rotate-180",
                  )}
                />
              </button>

              <ul
                id={panelId}
                hidden={!expanded}
                className="mt-1 mb-2 ml-[1.0625rem] grid gap-0.5 border-l border-stroke"
              >
                {group.overview ? (
                  <li>
                    <Link
                      href={group.overview.href}
                      onClick={onNavigate}
                      className={cn(
                        mobileLinkClass,
                        "font-medium text-brand-700 hover:bg-surface hover:text-brand-800",
                      )}
                    >
                      {group.overview.label}
                      <ArrowRight
                        aria-hidden="true"
                        className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                      />
                    </Link>
                  </li>
                ) : null}
                {hasOverviewPage(group) ? (
                  <MobileLink
                    href={overviewHref}
                    label="單元總覽"
                    srPrefix={group.label}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ) : null}
                {group.pages.map((page) => (
                  <MobileLink
                    key={page.slug}
                    href={hrefFor(page.slug)}
                    label={page.label}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function MobileLink({
  href,
  label,
  srPrefix,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  srPrefix?: string;
  pathname: string | null;
  onNavigate: () => void;
}) {
  const isCurrent = pathname === href;
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={isCurrent ? "page" : undefined}
        className={cn(
          mobileLinkClass,
          isCurrent
            ? "bg-brand-50 font-semibold text-brand-900"
            : "text-slate-700 hover:bg-surface hover:text-brand-900",
        )}
      >
        {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
        <span className="min-w-0 text-pretty">{label}</span>
      </Link>
    </li>
  );
}
