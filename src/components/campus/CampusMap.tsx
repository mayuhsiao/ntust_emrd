"use client";

import Image from "next/image";
import { MapPin, Maximize2 } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from "react";
import campusMap from "@/assets/campus/ntust-campus-layout.jpg";
import {
  campusCategories,
  campusSpots,
  defaultSpotId,
  emrdQuickSpots,
  spotTitle,
  type CampusSpot,
} from "@/content/campus";
import { cn } from "@/lib/cn";

/** 地圖寬高比（聚光需換算為正圓）；與桌機版地圖最大寬度 lg:max-w-[calc((100dvh-10rem)*1.232)] 一致 */
const MAP_RATIO = campusMap.width / campusMap.height;
/** 聚光區半徑（佔圖寬的百分比） */
const SPOTLIGHT_RADIUS = 9;
/** 名牌與地圖邊緣的最小距離 */
const TAG_EDGE_GAP = 6;
/** 桌機版（lg）：地圖固定於左欄、說明顯示在清單中被點選的項目下方 */
const DESKTOP_QUERY = "(min-width: 64rem)";

const spotsById = new Map(campusSpots.map((spot) => [spot.id, spot]));

type Source = "quick" | "list" | "map";

function spotLabel(spot: CampusSpot) {
  return spot.number ? `${spot.number} ${spotTitle(spot)}` : spotTitle(spot);
}

/** 指標位置最近的建物（距離超過約 3% 圖寬則視為未點到任何建物） */
function nearestSpot(event: MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  let best: CampusSpot | undefined;
  let bestDistance = Infinity;
  for (const spot of campusSpots) {
    const distance = Math.hypot((spot.x / 100) * rect.width - px, (spot.y / 100) * rect.height - py);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = spot;
    }
  }
  return bestDistance <= Math.max(16, rect.width * 0.03) ? best : undefined;
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * 互動校園地圖：點選清單（或地圖上的編號）即以聚光、標示圈與名牌指出建物位置，並顯示進駐單位。
 * 鍵盤與螢幕報讀器以清單操作（aria-pressed 表示目前選取，說明緊接在按鈕之後）；地圖點擊層僅供滑鼠／觸控，
 * 以最近距離判定建物，鄰近建物的點擊範圍不會互相遮蓋。選取結果另以 aria-live 簡短播報。
 * 版面：行動版地圖在上、說明緊接地圖、清單在下；桌機版地圖固定於左欄（高度不超過視窗），說明展開於點選的清單項目下方。
 */
export function CampusMap() {
  const [selection, setSelection] = useState<{ id: string; source: Source }>({
    id: defaultSpotId,
    source: "quick",
  });
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLSpanElement>(null);
  /** 桌機版點選清單時記錄按鈕位置：上方項目收合說明後，捲動補回位移，被點的按鈕不會跳動 */
  const anchorRef = useRef<{ element: HTMLElement; top: number } | null>(null);
  const baseId = useId();
  const selected = spotsById.get(selection.id) ?? campusSpots[0];
  const hovered = hoverId && hoverId !== selection.id ? spotsById.get(hoverId) : undefined;
  const itemId = (id: string) => `${baseId}-spot-${id}`;

  const select = (id: string, source: Source, trigger?: HTMLElement) => {
    const spot = spotsById.get(id);
    if (!spot) return;
    anchorRef.current = trigger ? { element: trigger, top: trigger.getBoundingClientRect().top } : null;
    setSelection({ id, source });
    setAnnouncement(`已在地圖標示：${spotLabel(spot)}`);

    const desktop = window.matchMedia(DESKTOP_QUERY).matches;
    if (desktop) {
      // 桌機版由地圖點選：捲動右欄清單，讓展開說明的項目出現在畫面中
      if (source === "map") {
        document.getElementById(itemId(id))?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
      }
      return;
    }
    // 行動版清單在地圖下方：由清單點選且地圖不在畫面內時，捲回地圖
    const map = mapRef.current;
    if (source === "map" || !map) return;
    const rect = map.getBoundingClientRect();
    if (rect.top >= 0 && rect.bottom <= window.innerHeight) return;
    map.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  };

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    anchorRef.current = null;
    if (!anchor || !window.matchMedia(DESKTOP_QUERY).matches) return;
    const delta = anchor.element.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) window.scrollBy({ top: delta, behavior: "instant" });
  }, [selection]);

  // 名牌置中於標示點；超出地圖左右緣時依實際寬度向內推（直接寫入 CSS 變數，不多一次渲染）
  useLayoutEffect(() => {
    const map = mapRef.current;
    const tag = tagRef.current;
    if (!map || !tag) return;
    const clamp = () => {
      tag.style.setProperty("--tag-shift", "0px");
      const mapRect = map.getBoundingClientRect();
      const tagRect = tag.getBoundingClientRect();
      let shift = 0;
      if (tagRect.right > mapRect.right - TAG_EDGE_GAP) shift = mapRect.right - TAG_EDGE_GAP - tagRect.right;
      if (tagRect.left + shift < mapRect.left + TAG_EDGE_GAP) shift = mapRect.left + TAG_EDGE_GAP - tagRect.left;
      tag.style.setProperty("--tag-shift", `${shift}px`);
    };
    clamp();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(clamp);
    observer.observe(map);
    return () => observer.disconnect();
  }, [selection.id]);

  const tagBelow = selected.y < 14;

  const spotlight: CSSProperties = {
    background: `radial-gradient(ellipse ${SPOTLIGHT_RADIUS}% ${(SPOTLIGHT_RADIUS * MAP_RATIO).toFixed(2)}% at ${selected.x}% ${selected.y}%, transparent 55%, rgb(5 21 46 / 0.34) 100%)`,
  };

  const onMapPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    const id = nearestSpot(event)?.id ?? null;
    if (id !== hoverId) setHoverId(id);
  };

  const onMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const spot = nearestSpot(event);
    if (spot) select(spot.id, "map");
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="min-w-0 lg:col-span-8">
        <div className="lg:sticky lg:top-24">
          <div
            ref={mapRef}
            className="relative scroll-mt-24 overflow-hidden rounded-md bg-[#ebebeb] ring-1 ring-stroke lg:mx-auto lg:max-w-[calc((100dvh-10rem)*1.232)]"
          >
            <Image
              src={campusMap}
              alt="國立臺灣科技大學公館校區平面配置圖：地圖下緣為基隆路四段（設有大門），上緣為基隆路四段 41 巷 68 弄；33 棟建物與設施依編號標示，各建物名稱與位置請見地圖旁的清單。"
              sizes="(min-width: 1280px) 816px, (min-width: 1024px) calc(66.67vw - 40px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)"
              placeholder="blur"
              preload
              className="block h-auto w-full"
            />

            {/* 聚光：選取處以外略為壓暗 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 transition-[background] duration-300"
              style={spotlight}
            />

            {/* 點擊層（滑鼠／觸控用，不可聚焦；鍵盤與報讀器以清單操作） */}
            <div
              aria-hidden="true"
              onClick={onMapClick}
              onPointerMove={onMapPointerMove}
              onPointerLeave={() => setHoverId(null)}
              className={cn("absolute inset-0", hovered ? "cursor-pointer" : "cursor-default")}
            />

            {hovered ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute aspect-square w-[3.4%] min-w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-champagne-500"
                style={{ left: `${hovered.x}%`, top: `${hovered.y}%` }}
              />
            ) : null}

            {/* 標示圈與名牌 */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute"
              style={{ left: `${selected.x}%`, top: `${selected.y}%` }}
            >
              {/* 擴散動畫只播 3 次（WCAG 2.2.2：自動動態需於 5 秒內停止），切換建物時以 key 重新播放 */}
              <span
                key={selected.id}
                className="absolute size-[clamp(2.25rem,6vw,3.75rem)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-champagne-400/35 motion-safe:animate-ping"
                style={{ animationIterationCount: 3 }}
              />
              <span className="absolute size-[clamp(2.25rem,6vw,3.75rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-champagne-500 bg-champagne-300/20 shadow-[0_0_0_3px_rgb(255_255_255/0.9)]" />
              <span
                ref={tagRef}
                className={cn(
                  "absolute flex items-center gap-1.5 rounded-md bg-brand-950 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-white shadow-lg sm:text-sm",
                  tagBelow ? "top-[clamp(1.4rem,3.4vw,2.2rem)]" : "bottom-[clamp(1.4rem,3.4vw,2.2rem)]",
                )}
                style={{ transform: "translateX(calc(-50% + var(--tag-shift, 0px)))" }}
              >
                <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-champagne-300" />
                {spotLabel(selected)}
              </span>
            </div>
          </div>

          {/* 窄螢幕地圖文字過小：另開原圖（2400px）供手勢縮放 */}
          <p className="mt-1 flex justify-end">
            <a
              href={campusMap.src}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline"
            >
              <Maximize2 aria-hidden="true" className="size-4 shrink-0" />
              開啟大圖（可放大檢視）
              <span className="sr-only">（另開新視窗）</span>
            </a>
          </p>

          {/* 行動版：說明緊接地圖（桌機版改顯示於清單中） */}
          <SpotDetail spot={selected} headingLevel="h2" className="mt-3 lg:hidden" />
        </div>
      </div>

      <div className="lg:col-span-4">
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <section aria-labelledby={`${baseId}-quick`}>
          <h2 id={`${baseId}-quick`} className="text-sm font-semibold tracking-[0.08em] text-champagne-700">
            EMRD 常用地點
          </h2>
          <ul className="mt-3 grid gap-2">
            {emrdQuickSpots.map((item) => {
              const spot = spotsById.get(item.spotId);
              if (!spot) return null;
              const pressed = selection.id === item.spotId;
              return (
                <li key={`${item.spotId}-${item.room}`}>
                  <button
                    type="button"
                    aria-pressed={pressed}
                    onClick={(event) => select(item.spotId, "quick", event.currentTarget)}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-3 rounded-md border px-3.5 py-2.5 text-left transition-colors duration-200",
                      pressed
                        ? "border-brand-700 bg-brand-900 text-white"
                        : "border-stroke bg-white text-brand-950 hover:border-brand-300",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.9375rem] font-semibold">{item.label}</span>
                      <span className={cn("block text-sm", pressed ? "text-brand-100" : "text-slate-600")}>
                        {spotTitle(spot)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-sm px-2 py-0.5 text-sm font-semibold tabular-nums",
                        pressed ? "bg-champagne-300 text-brand-950" : "bg-champagne-100 text-champagne-800",
                      )}
                    >
                      {item.room}
                    </span>
                  </button>
                  {pressed && selection.source === "quick" ? (
                    <SpotDetail spot={spot} headingLevel="h3" className="mt-2 hidden lg:block" />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <div className="mt-10 space-y-8">
          {campusCategories.map((category) => {
            const spots = campusSpots.filter((spot) => spot.category === category.key);
            const headingId = `${baseId}-${category.key}`;
            return (
              <section key={category.key} aria-labelledby={headingId}>
                <h2 id={headingId} className="flex items-baseline gap-2 border-b border-stroke pb-2">
                  <span className="text-base font-semibold text-brand-950">{category.label}</span>
                  <span lang="en" className="text-xs font-medium tracking-[0.12em] text-slate-600 uppercase">
                    {category.englishLabel}
                  </span>
                </h2>
                <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-1">
                  {spots.map((spot) => {
                    const pressed = selection.id === spot.id;
                    return (
                      <li key={spot.id} id={itemId(spot.id)} className="scroll-mt-24">
                        <button
                          type="button"
                          aria-pressed={pressed}
                          onClick={(event) => select(spot.id, "list", event.currentTarget)}
                          className={cn(
                            "flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-[0.9375rem] transition-colors duration-200",
                            pressed
                              ? "bg-brand-50 font-semibold text-brand-950 ring-1 ring-brand-200"
                              : "text-slate-700 hover:bg-slate-100",
                          )}
                        >
                          <span
                            aria-hidden={spot.number ? undefined : true}
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                              pressed ? "bg-brand-800 text-white" : "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
                            )}
                          >
                            {spot.number ?? <MapPin className="size-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            {spotTitle(spot)}
                            {spot.emrd ? (
                              <span className="ml-2 inline-block rounded-sm bg-champagne-100 px-1.5 text-xs font-semibold text-champagne-800">
                                EMRD
                              </span>
                            ) : null}
                          </span>
                        </button>
                        {pressed && selection.source !== "quick" ? (
                          <SpotDetail spot={spot} headingLevel="h3" compact className="mt-1 mb-2 hidden lg:block" />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SpotDetail({
  spot,
  headingLevel,
  compact = false,
  className,
}: {
  spot: CampusSpot;
  headingLevel: "h2" | "h3";
  /** 清單內展開：標題已在按鈕上，不再重複大標 */
  compact?: boolean;
  className?: string;
}) {
  const Heading = headingLevel;
  const subHeading = headingLevel === "h2" ? "h3" : "h4";
  const SubHeading = subHeading;
  const hasContent = Boolean(spot.emrd?.length || spot.units?.length);
  if (compact && !hasContent) return null;

  return (
    <div className={cn("rounded-md border border-stroke bg-white", compact ? "p-4" : "p-5", className)}>
      {compact ? (
        <Heading className="sr-only">{spotTitle(spot)}說明</Heading>
      ) : (
        <Heading className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {spot.number ? (
            <span className="text-sm font-semibold text-champagne-700 tabular-nums">No. {spot.number}</span>
          ) : null}
          <span className="text-lg font-semibold text-brand-950">{spotTitle(spot)}</span>
        </Heading>
      )}
      {spot.emrd ? (
        <ul className={cn("flex flex-wrap gap-2", !compact && "mt-3")}>
          {spot.emrd.map((note) => (
            <li
              key={note.room}
              className="inline-flex items-center gap-2 rounded-md bg-brand-900 px-3 py-1.5 text-sm font-semibold text-white"
            >
              {note.label}
              <span className="text-champagne-300 tabular-nums">{note.room}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {spot.units?.length ? (
        <>
          <SubHeading className={cn("text-sm font-semibold text-slate-600", (spot.emrd || !compact) && "mt-4")}>
            進駐單位
          </SubHeading>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm leading-relaxed text-slate-700">
            {spot.units.map((unit) => (
              <li key={unit}>{unit}</li>
            ))}
          </ul>
        </>
      ) : !compact ? (
        <p className="mt-2 text-sm text-slate-600">位置已標示於地圖。</p>
      ) : null}
    </div>
  );
}
