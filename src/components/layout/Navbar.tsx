"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
} from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarCheck, Download, Menu, Search, X } from "lucide-react";
import {
  DESKTOP_QUERY,
  DesktopMegaNav,
  MobileNavGroups,
  groupKeyForPath,
  homeSectionGroups,
} from "@/components/layout/MegaMenu";
import { openSearch } from "@/components/search/openSearch";
import { SearchButton } from "@/components/search/SearchButton";
import { SearchDialog } from "@/components/site/SearchDialog";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { utilityBar } from "@/content/home";
import { cn } from "@/lib/cn";
import { lockScroll } from "@/lib/scrollLock";
import { site } from "@/lib/site";

/** 工具列高度 h-10（2.5rem）；讀不到元素時的後備值 */
const UTILITY_BAR_FALLBACK_HEIGHT = 40;
/** Scroll-spy 判定帶：視窗高度 35%–40% 的水平帶 */
const SPY_ROOT_MARGIN = "-35% 0px -60% 0px";

const homeSectionIds: readonly string[] = [...homeSectionGroups.keys()];
const noSectionIds: readonly string[] = [];
const brochureTitle = `${site.links.brochureLabel}（PDF）`;
const consultationTitle = `以 E-mail 預約諮詢：${site.contact.email}`;

/** 上級單位（另開新視窗）：桌機列於工具列，md 以下改列於選單底部 */
const parentLinks = [
  { label: "臺科大首頁", href: site.links.ntust },
  { label: "工程學院", href: site.links.engineeringCollege },
] as const;

/** 站內工具連結 */
const siteLinks = [
  { label: "校園地圖", href: "/campus" },
  { label: "網站導覽", href: "/sitemap" },
  { label: "聯絡我們", href: "/contact" },
] as const;

const utilityItemClass =
  "flex items-center before:h-3 before:w-px before:bg-white/15 first:before:hidden";
const utilityLinkBaseClass =
  "group inline-flex h-10 items-center px-3 whitespace-nowrap transition-colors duration-200 hover:text-white focus-visible:-outline-offset-2 focus-visible:outline-champagne-200";
const utilityLinkClass = cn(utilityLinkBaseClass, "gap-1 text-brand-100/85");
const mobileUtilityLinkClass =
  "inline-flex min-h-11 items-center gap-1 rounded-sm px-2.5 font-medium text-slate-600 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline";

function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const getServerIsScrolled = () => false;

/** 回傳目前位於判定帶內的區塊 id；巢狀區塊時以較晚開始（較內層）者為準。 */
function useActiveSection(ids: readonly string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (targets.length === 0) return;

    const inBand = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target);
          else inBand.delete(entry.target);
        }

        let current: Element | null = null;
        let currentTop = Number.NEGATIVE_INFINITY;
        for (const element of inBand) {
          const { top } = element.getBoundingClientRect();
          if (top > currentTop) {
            current = element;
            currentTop = top;
          }
        }
        setActiveId(current ? current.id : null);
      },
      { rootMargin: SPY_ROOT_MARGIN },
    );

    for (const target of targets) observer.observe(target);
    return () => {
      observer.disconnect();
      setActiveId(null);
    };
  }, [ids]);

  return activeId;
}

/**
 * 全站頁首。目前位置由各頁面（Server Component）傳入，不使用 usePathname：
 * 後者在預先產生時需要 Suspense 後備內容，整份頁首會在 HTML 中重複輸出兩次。
 * @param pathname 目前頁面的路徑（例："/"、"/about/features"、"/posts/123"）；404 頁傳入 null，不標示目前位置
 */
export function Navbar({ pathname }: { pathname: string | null }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Activity 保留的隱藏路由也有一份頁首，故以 useId 產生唯一 id，不與其他頁首衝突
  const utilityBarId = useId();
  const getIsScrolled = useCallback(() => {
    // 捲過工具列（主導覽列已貼齊頂端）才切換為白色磨砂玻璃。以頁首的實際位置與工具列高度判斷：
    // 頁首上方另有內容（預覽版提示列）時捲動距離不等於工具列高度，文字縮放時亦準確
    const bar = document.getElementById(utilityBarId);
    const header = bar?.parentElement;
    if (!bar || !header || bar.offsetHeight === 0) {
      return window.scrollY >= UTILITY_BAR_FALLBACK_HEIGHT;
    }
    return header.getBoundingClientRect().top <= 0.5 - bar.offsetHeight;
  }, [utilityBarId]);
  const isScrolled = useSyncExternalStore(
    subscribeToScroll,
    getIsScrolled,
    getServerIsScrolled,
  );
  const isHome = pathname === "/";
  const activeSectionId = useActiveSection(isHome ? homeSectionIds : noSectionIds);
  const activeKey = isHome
    ? (activeSectionId && homeSectionGroups.get(activeSectionId)) || null
    : groupKeyForPath(pathname);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  /** 白底狀態：已捲動（磨砂玻璃）或行動選單展開（不透明白） */
  const onLight = menuOpen || isScrolled;

  const closeMenu = () => setMenuOpen(false);

  // Cache Components 以 <Activity> 保留離開的路由；隱藏時收合選單，避免返回後仍鎖定捲動
  useLayoutEffect(() => () => setMenuOpen(false), []);

  // 選單面板高度：自頁首底緣到視窗底部（開啟期間頁面不能捲動，最後一項須在視窗內）。
  // 以實際位置計算：尚未捲過工具列、或頁首上方另有預覽版提示列時，頁首底緣低於固定的 4rem／6.5rem
  useLayoutEffect(() => {
    const panel = menuRef.current;
    const header = panel?.parentElement;
    if (!menuOpen || !panel || !header) return;
    const fit = () => {
      const top = Math.max(0, header.getBoundingClientRect().bottom);
      panel.style.maxHeight = `calc(100dvh - ${top}px)`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [menuOpen]);

  // 選單開啟期間：鎖定頁面捲動、Esc 關閉並歸還焦點、放大至桌機斷點時自動收合
  useEffect(() => {
    if (!menuOpen) return;

    // 與搜尋視窗共用計數：在選單內開啟搜尋時，選單收合與視窗開啟發生在同一次更新
    const releaseScroll = lockScroll();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const handleBreakpoint = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    desktop.addEventListener("change", handleBreakpoint);

    return () => {
      releaseScroll();
      document.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", handleBreakpoint);
    };
  }, [menuOpen]);

  // 鍵盤使用者 Tab 離開頁首時收合選單，避免焦點落在被遮罩覆蓋的內容
  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget;
    if (menuOpen && next instanceof Node && !event.currentTarget.contains(next)) {
      setMenuOpen(false);
    }
  };

  return (
    <>
      {/*
        整個頁首（工具列＋主導覽列）為單一 banner 地標；以負 top 值黏貼，
        工具列隨頁面捲走，主導覽列則固定於視窗頂端。
      */}
      <header onBlur={handleBlur} className="sticky -top-10 z-50">
        <nav
          id={utilityBarId}
          aria-label="工具列"
          className="bg-brand-950 text-[13px] tracking-[0.04em]"
        >
          <Container className="flex h-10 items-center justify-between gap-6">
            <Link
              href={`/${utilityBar.notice.href}`}
              onClick={closeMenu}
              className="group -mx-2 inline-flex h-full min-w-0 items-center gap-2 px-2 text-brand-100 underline-offset-4 transition-colors duration-200 hover:text-white hover:underline focus-visible:-outline-offset-2 focus-visible:outline-champagne-200"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-champagne-300"
              />
              <span className="truncate">{utilityBar.notice.label}</span>
              <ArrowRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-champagne-300 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>

            <ul className="-mr-3 hidden shrink-0 items-center md:flex">
              {siteLinks.map((link) => (
                <li key={link.href} className={utilityItemClass}>
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className={cn(
                      utilityLinkClass,
                      "aria-[current=page]:text-white aria-[current=page]:underline aria-[current=page]:decoration-champagne-300 aria-[current=page]:underline-offset-4",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
              {parentLinks.map((link) => (
                <li key={link.href} className={utilityItemClass}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={utilityLinkClass}
                  >
                    {link.label}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-3 text-brand-300 transition-colors duration-200 group-hover:text-white"
                    />
                    <span className="sr-only">（另開新視窗）</span>
                  </a>
                </li>
              ))}
              {/* md–lg 由行動版選單提供簡章下載，工具列留給提示文字 */}
              <li className={cn(utilityItemClass, "max-lg:hidden")}>
                <a
                  href={site.links.brochurePdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={brochureTitle}
                  className={cn(utilityLinkBaseClass, "gap-1.5 text-champagne-200")}
                >
                  <Download
                    aria-hidden="true"
                    className="size-3.5 text-champagne-300 transition-colors duration-200 group-hover:text-white"
                  />
                  報考簡章下載 (PDF)
                  <span className="sr-only">（另開新視窗）</span>
                </a>
              </li>
            </ul>
          </Container>
        </nav>

        {/* 高度含底線恰為 4rem／5rem，與 html scroll-padding-top 對齊 */}
        <div
          className={cn(
            "h-16 border-b transition-[background-color,border-color,backdrop-filter] duration-300 lg:h-20",
            menuOpen
              ? "border-slate-200/80 bg-white"
              : isScrolled
                ? "border-slate-200/80 bg-white/80 backdrop-blur-md"
                : "border-white/10 bg-brand-900",
          )}
        >
          {/* lg–xl 之間寬度最緊（1024px 僅餘約 20px），間距略縮以容納搜尋鈕 */}
          <Container className="flex h-full items-center justify-between gap-4 lg:max-xl:gap-3">
            <Link
              href={isHome ? "/#top" : "/"}
              aria-label={`國立臺灣科技大學 ${site.programName}（${site.programAbbr}）（${isHome ? "回到頁首" : "回到首頁"}）`}
              onClick={closeMenu}
              className={cn(
                "grid min-w-0 rounded-sm lg:shrink-0",
                !onLight && "focus-visible:outline-champagne-200",
              )}
            >
              {/* 白色與彩色標準字疊放交叉淡入，避免切換時重新下載造成閃爍 */}
              <span
                aria-hidden="true"
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-300",
                  onLight && "opacity-0",
                )}
              >
                <Logo inverted eager />
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "col-start-1 row-start-1 transition-opacity duration-300",
                  !onLight && "opacity-0",
                )}
              >
                <Logo eager />
              </span>
            </Link>

            <DesktopMegaNav
              pathname={pathname}
              activeKey={activeKey}
              onLight={onLight}
              isScrolled={isScrolled}
            />

            {/*
              六個單元＋完整標準字已用滿 1280px 容器，主導覽列只留搜尋鈕與一個 CTA；
              簡章下載改列於工具列與「招生專區」面板（行動版選單底部亦有）。
              CTA 圖示於 82rem（1312px）以下隱藏、lg–xl 左右內距縮為 px-4，騰出搜尋鈕（44px）的寬度。
            */}
            <div className="flex shrink-0 items-center gap-1">
              <SearchButton onLight={onLight} />

              <div className="hidden shrink-0 lg:flex">
                <ButtonLink
                  href={site.links.consultation}
                  variant={onLight ? "primary" : "accent"}
                  title={consultationTitle}
                  className="lg:max-xl:px-4"
                >
                  <CalendarCheck aria-hidden="true" className="size-4 max-[82rem]:hidden" />
                  線上預約諮詢
                </ButtonLink>
              </div>

              <button
                ref={toggleRef}
                type="button"
                aria-expanded={menuOpen}
                aria-controls={menuId}
                aria-label={menuOpen ? "關閉主選單" : "開啟主選單"}
                onClick={() => setMenuOpen((open) => !open)}
                className={cn(
                  "-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-300 lg:hidden",
                  onLight
                    ? "text-brand-950 hover:bg-brand-50"
                    : "text-white hover:bg-white/10 focus-visible:outline-champagne-200",
                )}
              >
                {menuOpen ? (
                  <X aria-hidden="true" className="size-6" strokeWidth={1.75} />
                ) : (
                  <Menu aria-hidden="true" className="size-6" strokeWidth={1.75} />
                )}
              </button>
            </div>
          </Container>
        </div>

        {/* max-height 於開啟時依頁首實際位置設定（見上方 layout effect）；class 為量測前的後備值 */}
        <div
          ref={menuRef}
          id={menuId}
          hidden={!menuOpen}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-6.5rem)] overflow-y-auto overscroll-contain border-b border-stroke bg-white shadow-sm transition-[opacity,translate] duration-200 ease-out starting:-translate-y-2 starting:opacity-0 lg:hidden"
        >
          <Container className="py-4 sm:py-6">
            {/* 全站搜尋：先收合選單再開啟搜尋視窗，關閉後焦點回到頁首的搜尋鈕 */}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => {
                closeMenu();
                openSearch();
              }}
              className="mb-3 flex min-h-12 w-full items-center gap-3 rounded-md border border-stroke bg-surface px-4 text-left text-base text-slate-600 transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-900"
            >
              <Search aria-hidden="true" className="size-5 shrink-0 text-brand-700" strokeWidth={1.9} />
              搜尋網站
            </button>

            {/* 換頁時重設手風琴，改為展開新頁面所屬的單元 */}
            <MobileNavGroups
              key={pathname ?? ""}
              pathname={pathname}
              onNavigate={closeMenu}
            />

            <div className="mt-4 grid gap-3 border-t border-stroke pt-5 sm:grid-cols-2">
              <ButtonLink
                href={site.links.brochurePdf}
                variant="secondary"
                size="lg"
                external
                title={brochureTitle}
                onClick={closeMenu}
                className="w-full"
              >
                <Download aria-hidden="true" className="size-4" />
                報考簡章下載 (PDF)
              </ButtonLink>
              <ButtonLink
                href={site.links.consultation}
                variant="primary"
                size="lg"
                title={consultationTitle}
                onClick={closeMenu}
                className="w-full"
              >
                <CalendarCheck aria-hidden="true" className="size-4" />
                線上預約諮詢
              </ButtonLink>
            </div>

            <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 text-sm text-slate-600">
              {site.contact.office}
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <a
                href={site.contact.phoneHref}
                onClick={closeMenu}
                className="inline-flex min-h-11 items-center rounded-sm font-medium text-brand-900 tabular-nums underline-offset-4 hover:underline"
              >
                {site.contact.phone}
              </a>
            </p>

            <nav
              aria-label="其他連結"
              className="mt-2 border-t border-stroke pt-2"
            >
              <ul className="flex flex-wrap items-center justify-center gap-x-1 text-sm">
                {siteLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={closeMenu}
                      aria-current={pathname === link.href ? "page" : undefined}
                      className={cn(
                        mobileUtilityLinkClass,
                        "aria-[current=page]:text-brand-900 aria-[current=page]:underline",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                {parentLinks.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={closeMenu}
                      className={mobileUtilityLinkClass}
                    >
                      {link.label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3.5 text-brand-600"
                      />
                      <span className="sr-only">（另開新視窗）</span>
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </Container>
        </div>
      </header>

      {menuOpen ? (
        <div
          aria-hidden="true"
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-brand-950/30 transition-opacity duration-200 starting:opacity-0 lg:hidden"
        />
      ) : null}

      <SearchDialog />
    </>
  );
}
