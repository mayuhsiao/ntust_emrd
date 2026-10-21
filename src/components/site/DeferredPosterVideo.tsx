"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentPropsWithoutRef,
} from "react";

/** 距離視窗上下約 800px 時開始載入封面，捲到影片前多半已下載完成 */
const POSTER_ROOT_MARGIN = "800px 0px";
/** 影片露出 40% 以上才自動播放，低於即暫停 */
const AUTOPLAY_THRESHOLD = 0.4;
const AUTOPLAY_QUERY = "(prefers-reduced-motion: no-preference)";
/** Tailwind lg 斷點：以下改用 compact 的較小影片與封面 */
const WIDE_QUERY = "(min-width: 64rem)";

type VideoSource = {
  /** 影片網址（原始字串網址，請先經過 withBasePath()） */
  src: string;
  /** 封面圖片網址（同上） */
  poster: string;
};

type DeferredPosterVideoProps = Omit<
  ComponentPropsWithoutRef<"video">,
  "src" | "poster" | "autoPlay"
> &
  VideoSource & {
  /**
   * 視窗寬度低於 lg（64rem）時改用的較小影片與封面。伺服器端與未載入 JavaScript 時一律輸出 src，
   * hydration 後才依視窗寬度改設 src 屬性（請搭配 preload="none"，換檔前不會下載影片）。
   */
  compact?: VideoSource;
  /**
   * 捲入畫面時自動以靜音播放、離開畫面時暫停。偏好減少動態或開啟節省數據時不自動播放；
   * 使用者自行暫停後不再自動續播（直到再次手動播放）。請搭配 controls 提供暫停方式（WCAG 2.2.2）。
   */
  autoPlayInView?: boolean;
};

type NetworkInformationLike = { saveData?: boolean };

function autoplayAllowed() {
  const connection = (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
  return window.matchMedia(AUTOPLAY_QUERY).matches && connection?.saveData !== true;
}

function subscribeWide(onChange: () => void) {
  const mediaQuery = window.matchMedia(WIDE_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getWide() {
  return window.matchMedia(WIDE_QUERY).matches;
}

/** 伺服器端與 hydration 期間尚不知視窗寬度 */
function getServerNull() {
  return null;
}

/**
 * 封面延後載入的 <video>：瀏覽器在頁面載入時即下載 poster（preload="none" 只延後影片本身，
 * poster 也沒有 loading="lazy"），位於頁面深處的影片因此以 IntersectionObserver 在接近視窗時才設定 poster。
 * 直接設定 DOM 屬性而非 React state，避免多一次渲染；未載入 JavaScript 時只顯示外框底色與播放控制列。
 * 提供 compact 時，lg 以下改用較小的影片與封面。
 */
export function DeferredPosterVideo({
  src,
  poster,
  compact,
  autoPlayInView = false,
  children,
  ...props
}: DeferredPosterVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);
  /** 使用者自行暫停；保存在 ref，換檔（currentSrc 改變）重設自動播放時仍保留 */
  const userPausedRef = useRef(false);
  const wide = useSyncExternalStore(subscribeWide, getWide, getServerNull);
  // hydration 後才依視窗寬度選定檔案；在此之前（wide === null）輸出原檔 src，但不設定封面、不自動播放
  const ready = wide !== null;
  const source = compact && wide === false ? compact : { src, poster };
  const currentSrc = source.src;
  const currentPoster = source.poster;

  useEffect(() => {
    const video = ref.current;
    if (!video || !ready) return;
    const show = () => {
      video.poster = currentPoster;
    };
    if (typeof IntersectionObserver === "undefined") return show();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        show();
      },
      { rootMargin: POSTER_ROOT_MARGIN },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [ready, currentPoster]);

  // 換檔時 src 屬性改變會重跑資源選擇並停止播放（不觸發 pause 事件），因此依 currentSrc 重新觀察，仍在畫面中即續播
  useEffect(() => {
    const video = ref.current;
    if (!video || !ready || !autoPlayInView || typeof IntersectionObserver === "undefined") {
      return;
    }

    /** 程式自行暫停（離開畫面、環境不允許）時設定，讓 pause 事件不被記為使用者暫停 */
    let pausingProgrammatically = false;
    let inView = false;
    const onPause = () => {
      if (pausingProgrammatically) {
        pausingProgrammatically = false;
        return;
      }
      userPausedRef.current = true;
    };
    const onPlay = () => {
      userPausedRef.current = false;
    };
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);

    const autoPause = () => {
      if (video.paused) return;
      pausingProgrammatically = true;
      video.pause();
    };
    const autoPlay = () => {
      if (userPausedRef.current || !video.paused || !autoplayAllowed()) return;
      // React 不會輸出 muted 屬性，需於 play() 前直接設定，否則可能被視為有聲影片而遭拒
      video.muted = true;
      video.play().catch(() => {
        // 被瀏覽器自動播放政策拒絕（NotAllowedError）或被 pause() 中斷時，保留控制列由使用者播放
      });
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) autoPlay();
        else autoPause();
      },
      { threshold: AUTOPLAY_THRESHOLD },
    );
    observer.observe(video);

    // 瀏覽中切換「減少動態」或「節省數據」：不允許時暫停，恢復允許且仍在畫面中時續播
    const mediaQuery = window.matchMedia(AUTOPLAY_QUERY);
    const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
    const onEnvironmentChange = () => {
      if (!autoplayAllowed()) autoPause();
      else if (inView) autoPlay();
    };
    mediaQuery.addEventListener("change", onEnvironmentChange);
    connection?.addEventListener?.("change", onEnvironmentChange);

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", onEnvironmentChange);
      connection?.removeEventListener?.("change", onEnvironmentChange);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
    };
  }, [ready, autoPlayInView, currentSrc]);

  return (
    <video ref={ref} {...props} src={currentSrc}>
      {children}
    </video>
  );
}
