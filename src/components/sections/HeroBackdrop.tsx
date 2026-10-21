"use client";

import { Pause, Play } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { withBasePath } from "@/lib/basePath";
import { cn } from "@/lib/cn";

type HeroBackdropProps = {
  /** public/ 內的影片網址（不含 basePath，於此加上）；檔案不存在時為 undefined，改顯示幾何點陣動態 */
  videoSrc?: string;
  /** 影片的 object-position，需與靜態畫面一致，淡入時校徽才不會跳位 */
  objectPosition: string;
  /** 由伺服器端渲染的靜態畫面（校徽成形的影格），作為影片載入前與不播放時的品牌畫面 */
  children: ReactNode;
};

/* ------------------------------------------------------------------ */
/* 環境偵測（SSR 一律回傳 false，確保 hydration 標記一致）                 */
/* ------------------------------------------------------------------ */

/** 僅桌機版（64rem＝Tailwind lg）且未要求減少動態時自動播放 */
const AUTOPLAY_QUERY =
  "(min-width: 64rem) and (prefers-reduced-motion: no-preference)";

type NetworkInformationLike = Partial<EventTarget> & { saveData?: boolean };

function getConnection(): NetworkInformationLike | undefined {
  return "connection" in navigator
    ? (navigator.connection as NetworkInformationLike)
    : undefined;
}

function subscribeAutoplay(onChange: () => void) {
  const mediaQuery = window.matchMedia(AUTOPLAY_QUERY);
  const connection = getConnection();
  mediaQuery.addEventListener("change", onChange);
  connection?.addEventListener?.("change", onChange);
  return () => {
    mediaQuery.removeEventListener("change", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

function getAutoplay() {
  return (
    window.matchMedia(AUTOPLAY_QUERY).matches &&
    getConnection()?.saveData !== true
  );
}

function getServerFalse() {
  return false;
}

const subscribeNothing = () => () => {};
const getClientTrue = () => true;

/** 以靜音方式播放影片；被瀏覽器自動播放政策拒絕時呼叫 onBlocked */
function playMuted(video: HTMLVideoElement, onBlocked: () => void) {
  // React 不會輸出 muted 屬性，需於 play() 前直接設定，否則可能被視為有聲影片而遭拒
  video.muted = true;
  video.play().catch((error: unknown) => {
    // AbortError 代表播放被 pause() 中斷，屬正常流程
    if (error instanceof DOMException && error.name === "NotAllowedError") {
      onBlocked();
    }
  });
}

/* ------------------------------------------------------------------ */
/* 播放／暫停控制鈕                                                       */
/* ------------------------------------------------------------------ */

type MediaControlProps = {
  label: string;
  /** 目前動作為「播放」時顯示播放圖示 */
  action: "play" | "pause";
  /** 展開為含文字的按鈕（影片尚未播放過時，讓使用者明確看見可播放） */
  expanded?: boolean;
  onClick: () => void;
  className?: string;
};

function MediaControl({
  label,
  action,
  expanded = false,
  onClick,
  className,
}: MediaControlProps) {
  const Icon = action === "play" ? Play : Pause;

  return (
    <button
      type="button"
      onClick={onClick}
      title={expanded ? undefined : label}
      className={cn(
        "absolute right-4 bottom-4 z-10 inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-brand-950/60 text-white ring-1 ring-white/25 backdrop-blur transition-colors duration-200 hover:bg-brand-950/80 hover:ring-white/50 focus-visible:outline-champagne-200 sm:right-6 sm:bottom-6",
        expanded && "px-4 text-sm font-semibold",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn("size-4 shrink-0", action === "play" && "translate-x-px")}
      />
      <span className={expanded ? undefined : "sr-only"}>{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 接縫漸層：讓媒體區與左側（行動版為上方）深藍文字區融為一體               */
/* ------------------------------------------------------------------ */

function BlendSeams() {
  return (
    <>
      <div className="absolute inset-x-0 top-0 h-16 bg-linear-to-b from-brand-950 to-transparent lg:hidden" />
      <div className="absolute inset-y-0 left-0 hidden w-28 bg-linear-to-r from-brand-950 to-transparent lg:block" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-brand-950/60 to-transparent" />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 臺科大校徽影片                                                         */
/* ------------------------------------------------------------------ */

/** 使用者意圖：auto 依環境自動播放；play／pause 為使用者手動選擇 */
type PlaybackChoice = "auto" | "play" | "pause";

function HeroVideo({
  src,
  objectPosition,
  still,
}: {
  src: string;
  objectPosition: string;
  still: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [choice, setChoice] = useState<PlaybackChoice>("auto");
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);
  const autoplay = useSyncExternalStore(
    subscribeAutoplay,
    getAutoplay,
    getServerFalse,
  );
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    getClientTrue,
    getServerFalse,
  );

  const active = choice === "play" || (choice === "auto" && autoplay);

  // 自動播放：環境改變（視窗縮放、切換減少動態、省流量）時同步播放或暫停
  useEffect(() => {
    const video = videoRef.current;
    if (!video || choice !== "auto") return;
    if (autoplay) {
      playMuted(video, () => setChoice("pause"));
    } else {
      video.pause();
    }
  }, [autoplay, choice]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      setChoice("pause");
      video.pause();
    } else {
      // 使用者主動播放：即使偏好減少動態也允許（於點擊事件中同步呼叫 play）
      setChoice("play");
      playMuted(video, () => setChoice("pause"));
    }
  };

  const markFailed = () => setFailed(true);

  return (
    <>
      <div aria-hidden="true" className="absolute inset-0">
        {still}
        {failed ? null : (
          <video
            ref={videoRef}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
            tabIndex={-1}
            disablePictureInPicture
            disableRemotePlayback
            onPlaying={() => setVisible(true)}
            onError={markFailed}
            className={cn(
              "absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out",
              visible ? "opacity-100" : "opacity-0",
            )}
            style={{ objectPosition }}
          >
            {/* 原生 <source> 不會自動加上 basePath（子路徑部署時為 /ntust_emrd） */}
            <source src={withBasePath(src)} type="video/mp4" onError={markFailed} />
          </video>
        )}
        <BlendSeams />
      </div>

      {/* 控制鈕需 JavaScript 才能運作，hydration 後才顯示，也避免桌機版先閃現「播放影片」 */}
      {hydrated && !failed ? (
        <MediaControl
          label={active ? "暫停影片" : "播放影片"}
          action={active ? "pause" : "play"}
          expanded={!active && !visible}
          onClick={togglePlayback}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 無影片時的備援：科技幾何點陣微動態背景                                   */
/* ------------------------------------------------------------------ */

type NetworkNode = { x: number; y: number; accent?: boolean };

/** 節點網絡（viewBox 720 × 640），環繞中央晶圓 */
const nodes: readonly NetworkNode[] = [
  { x: 130, y: 210 },
  { x: 250, y: 70 },
  { x: 450, y: 50, accent: true },
  { x: 630, y: 130 },
  { x: 690, y: 300 },
  { x: 650, y: 480 },
  { x: 500, y: 600 },
  { x: 290, y: 580, accent: true },
  { x: 140, y: 440 },
  { x: 330, y: 230 },
  { x: 480, y: 260, accent: true },
  { x: 420, y: 400 },
  { x: 300, y: 380 },
];

const links: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8],
  [1, 9], [2, 10], [4, 10], [5, 11], [7, 12], [0, 9], [6, 11],
  [9, 10], [10, 11], [11, 12], [12, 9],
];

const linksPath = links
  .map(
    ([from, to]) =>
      `M${nodes[from].x} ${nodes[from].y}L${nodes[to].x} ${nodes[to].y}`,
  )
  .join("");

function HeroFallback() {
  const [paused, setPaused] = useState(false);
  const label = paused ? "播放背景動態" : "暫停背景動態";

  return (
    <>
      <div
        aria-hidden="true"
        data-paused={paused ? "" : undefined}
        className="absolute inset-0 overflow-hidden [&[data-paused]_*]:[animation-play-state:paused]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle,rgb(255_255_255/0.15)_1px,transparent_1.5px)] bg-size-[24px_24px] [mask-image:radial-gradient(ellipse_75%_70%_at_60%_45%,#000_20%,transparent_75%)] motion-safe:animate-grid-drift" />
        <svg
          viewBox="0 0 720 640"
          fill="none"
          className="absolute top-1/2 left-1/2 h-auto w-[min(46rem,120%)] -translate-x-1/2 -translate-y-1/2 [mask-image:radial-gradient(closest-side,#000_70%,transparent)]"
        >
          <circle
            cx={400}
            cy={320}
            r={190}
            className="fill-brand-900/60 stroke-brand-300/30"
            vectorEffect="non-scaling-stroke"
          />
          <circle
            cx={400}
            cy={320}
            r={176}
            className="stroke-brand-300/15"
            strokeDasharray="2 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={linksPath}
            className="stroke-brand-300/30"
            vectorEffect="non-scaling-stroke"
          />
          {nodes.map((node, index) => (
            <g key={`${node.x}-${node.y}`}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.accent ? 10 : 7}
                className={cn(
                  "motion-safe:animate-node-pulse",
                  node.accent ? "fill-champagne-300/30" : "fill-brand-300/20",
                )}
                style={{ animationDelay: `-${((index * 0.7) % 4.8).toFixed(1)}s` }}
              />
              <circle
                cx={node.x}
                cy={node.y}
                r={node.accent ? 3.5 : 3}
                className={node.accent ? "fill-champagne-300" : "fill-brand-300"}
              />
            </g>
          ))}
        </svg>
        <BlendSeams />
      </div>

      {/* 偏好減少動態時背景不會動，無需暫停鈕 */}
      <MediaControl
        label={label}
        action={paused ? "play" : "pause"}
        onClick={() => setPaused((value) => !value)}
        className="motion-reduce:hidden"
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Hero 媒體區                                                           */
/* ------------------------------------------------------------------ */

/**
 * Hero 右側（行動版為下方）媒體區：
 * 有影片時以校徽靜態畫面墊底，桌機且環境允許時自動淡入影片，其他情況提供「播放影片」鈕；
 * 無影片時改顯示幾何點陣微動態。皆附暫停控制以符合 WCAG 2.2.2。
 */
export function HeroBackdrop({
  videoSrc,
  objectPosition,
  children,
}: HeroBackdropProps) {
  return videoSrc ? (
    <HeroVideo src={videoSrc} objectPosition={objectPosition} still={children} />
  ) : (
    <HeroFallback />
  );
}
