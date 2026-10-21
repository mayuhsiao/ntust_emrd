"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { currentIntakeYear } from "@/content/home";
import { cn } from "@/lib/cn";
import { isScrollLocked, subscribeScrollLock } from "@/lib/scrollLock";
import { site } from "@/lib/site";

/**
 * 可顯示的視窗：寬度未達 lg（64rem，與 MegaMenu 的 DESKTOP_QUERY 相同；頁首改為漢堡選單）且高度至少 500px。
 * 高度不足（手機橫向、放大 200%）時固定列會占去過多可視區，依 WCAG 1.4.10 不顯示。
 */
const ELIGIBLE_QUERY = "(width < 64rem) and (height >= 500px)";

/** 首頁主視覺（Hero）的 id：捲過主視覺後才顯示；內頁改為捲過一個視窗高度 */
const HERO_ID = "top";
/** 首頁「招生時程」區塊的 id（Timeline），亦為首頁招生連結的錨點 */
const ADMISSIONS_ID = "admissions";
/** 首頁招生行動帶（AdmissionsCta）標題的 id，以其所屬的 <section> 判斷是否在視窗內 */
const ADMISSIONS_CTA_TITLE_ID = "admissions-cta-title";

/** scroll-padding-bottom 在列高之外多留的距離，讓焦點框（外距 3px＋框線 2px）完整露出 */
const FOCUS_CLEARANCE = 8;

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia(ELIGIBLE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getIsEligible = () => window.matchMedia(ELIGIBLE_QUERY).matches;
const getServerSnapshot = () => false;

/**
 * 沿同層節點找最近的 <main>／<footer>（頁面結構為 <main>、本列、<footer> 並列）。
 * 不以 id 或 document 查詢：Activity 保留的隱藏路由也各有一份，可能對到 display: none 的那份。
 */
function findSibling(element: Element, tagName: "MAIN" | "FOOTER", direction: "previous" | "next") {
  const step = (node: Element) =>
    direction === "previous" ? node.previousElementSibling : node.nextElementSibling;
  let node = step(element);
  while (node && node.tagName !== tagName) node = step(node);
  return node;
}

/**
 * 目前占用 <html> scroll-padding-bottom 的列。換頁時新頁面的列可能先於舊頁面解除前設定，
 * 以擁有者判斷，舊頁面解除時不會清掉新頁面剛設定的值。
 */
let paddingOwner: object | null = null;
let savedPadding = "";

/** 顯示期間保留列高的 scroll-padding-bottom，焦點移到的元素不會被列遮住（WCAG 2.4.11）；回傳還原函式 */
function reserveScrollPadding(bar: HTMLElement) {
  const root = document.documentElement;
  const token = {};
  if (paddingOwner === null) savedPadding = root.style.scrollPaddingBottom;
  paddingOwner = token;

  const apply = () => {
    if (paddingOwner === token) {
      root.style.scrollPaddingBottom = `${bar.offsetHeight + FOCUS_CLEARANCE}px`;
    }
  };
  apply();
  // 文字縮放或安全區域改變時列高跟著變
  const observer = new ResizeObserver(apply);
  observer.observe(bar);

  return () => {
    observer.disconnect();
    if (paddingOwner !== token) return;
    paddingOwner = null;
    root.style.scrollPaddingBottom = savedPadding;
  };
}

type MobileActionBarProps = {
  /**
   * 目前頁面的路徑：首頁捲過主視覺後顯示、招生按鈕改為同頁錨點；
   * 招生資訊頁本身不顯示（按鈕只會連回目前頁面）。404 頁傳入 null。
   */
  pathname: string | null;
};

/**
 * 行動版底部行動列（lg 以下）：頁首只剩標準字、搜尋與選單鈕，首頁的報名、諮詢按鈕在 375px 寬時
 * 約位於 20 個畫面之後，因此捲過第一屏後固定於視窗底部提供「招生資訊」按鈕（依學程要求只放招生）。
 *
 * - 隱藏時機：尚未捲過主視覺／第一屏；招生時程、招生行動帶或頁尾（含宣言帶與版權列）進入視窗
 *   （該處已有同類按鈕，也不遮住頁尾）；行動版選單或搜尋視窗開啟中；視窗高度不足 500px。
 * - 顯示期間設定 scroll-padding-bottom，鍵盤移動焦點時頁面會捲到列的上方。
 * - 置於 <main> 之後：Tab 順序在主要內容之後，不搶在內容前面。
 * - 隱藏時為 visibility: hidden，不可聚焦、也不在無障礙樹中；減少動態效果時不滑入。
 */
export function MobileActionBar({ pathname }: MobileActionBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const isEligible = useSyncExternalStore(subscribeToViewport, getIsEligible, getServerSnapshot);
  const isLocked = useSyncExternalStore(subscribeScrollLock, isScrollLocked, getServerSnapshot);
  const [pastStart, setPastStart] = useState(false);
  const [inHideZone, setInHideZone] = useState(false);
  const isHome = pathname === "/";
  const onAdmissionsPage = pathname === site.routes.admissionsInfo;
  const visible = isEligible && !isLocked && pastStart && !inHideZone && !onAdmissionsPage;

  // Cache Components 以 <Activity> 保留離開的路由；隱藏時重設為「尚未捲過」。
  // 否則以連結返回（捲動位置回到頂端）時，下一個影格量測前會以舊值完整顯示，再滑出
  useLayoutEffect(() => () => setPastStart(false), []);

  // 是否已捲過第一屏：首頁以主視覺底緣、內頁以一個視窗高度為準
  useEffect(() => {
    const bar = barRef.current;
    if (!isEligible || !bar) return;
    const hero = isHome
      ? findSibling(bar, "MAIN", "previous")?.querySelector<HTMLElement>(`#${HERO_ID}`)
      : null;

    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!hero) {
        setPastStart(window.scrollY >= window.innerHeight);
        return;
      }
      // 主視覺底緣退到固定頁首之後即視為捲過（scroll-padding-top 即固定導覽列的高度）
      const headerOffset =
        Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      setPastStart(hero.getBoundingClientRect().bottom <= headerOffset);
    };
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };

    // 首次量測同樣排入下一個影格（返回保留的路由時捲動位置可能不在頂端）
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [isEligible, isHome]);

  // 讓位區域：任一進入視窗即隱藏
  useEffect(() => {
    const bar = barRef.current;
    if (!isEligible || !bar) return;
    const main = findSibling(bar, "MAIN", "previous");
    const zones = [
      main?.querySelector(`#${ADMISSIONS_ID}`),
      main?.querySelector(`#${ADMISSIONS_CTA_TITLE_ID}`)?.closest("section"),
      findSibling(bar, "FOOTER", "next"),
    ].filter((zone): zone is Element => zone != null);
    if (zones.length === 0) return;

    const inView = new Set<Element>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      setInHideZone(inView.size > 0);
    });
    for (const zone of zones) observer.observe(zone);
    return () => observer.disconnect();
  }, [isEligible]);

  useEffect(() => {
    const bar = barRef.current;
    if (!visible || !bar) return;
    return reserveScrollPadding(bar);
  }, [visible]);

  if (onAdmissionsPage) return null;

  return (
    <aside
      ref={barRef}
      aria-label="招生快速連結"
      className={cn(
        // 高度：上下 6px＋按鈕 44px＋上框線，約 57px；底部另加 iPhone 主畫面指示條的安全區域
        "fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(0_26_54/0.3)] backdrop-blur-md transition-[translate,visibility] duration-300 ease-out motion-reduce:transition-none lg:hidden print:hidden",
        visible ? "visible translate-y-0" : "invisible translate-y-full",
      )}
    >
      <Container className="py-1.5">
        <ButtonLink
          href={isHome ? `#${ADMISSIONS_ID}` : site.routes.admissionsInfo}
          variant="primary"
          className="w-full"
        >
          <CalendarDays aria-hidden="true" className="size-4" />
          {currentIntakeYear} 學年度招生資訊
          <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      </Container>
    </aside>
  );
}
