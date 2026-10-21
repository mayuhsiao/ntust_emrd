"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/** 距離視窗上下約 800px 時開始載入封面，捲到影片前多半已下載完成 */
const POSTER_ROOT_MARGIN = "800px 0px";
/** 影片露出 40% 以上才自動播放，低於即暫停 */
const AUTOPLAY_THRESHOLD = 0.4;
const AUTOPLAY_QUERY = "(prefers-reduced-motion: no-preference)";

type DeferredPosterVideoProps = Omit<ComponentPropsWithoutRef<"video">, "poster" | "autoPlay"> & {
  /** 封面圖片網址（原始字串網址，請先經過 withBasePath()） */
  poster: string;
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

/**
 * 封面延後載入的 <video>：瀏覽器在頁面載入時即下載 poster（preload="none" 只延後影片本身，
 * poster 也沒有 loading="lazy"），位於頁面深處的影片因此以 IntersectionObserver 在接近視窗時才設定 poster。
 * 直接設定 DOM 屬性而非 React state，避免多一次渲染；未載入 JavaScript 時只顯示外框底色與播放控制列。
 */
export function DeferredPosterVideo({
  poster,
  autoPlayInView = false,
  children,
  ...props
}: DeferredPosterVideoProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const show = () => {
      video.poster = poster;
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
  }, [poster]);

  useEffect(() => {
    const video = ref.current;
    if (!video || !autoPlayInView || typeof IntersectionObserver === "undefined") return;

    let userPaused = false;
    /** 程式自行暫停（離開畫面、環境不允許）時設定，讓 pause 事件不被記為使用者暫停 */
    let pausingProgrammatically = false;
    let inView = false;
    const onPause = () => {
      if (pausingProgrammatically) {
        pausingProgrammatically = false;
        return;
      }
      userPaused = true;
    };
    const onPlay = () => {
      userPaused = false;
    };
    video.addEventListener("pause", onPause);
    video.addEventListener("play", onPlay);

    const autoPause = () => {
      if (video.paused) return;
      pausingProgrammatically = true;
      video.pause();
    };
    const autoPlay = () => {
      if (userPaused || !video.paused || !autoplayAllowed()) return;
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
  }, [autoPlayInView]);

  return (
    <video ref={ref} {...props}>
      {children}
    </video>
  );
}
