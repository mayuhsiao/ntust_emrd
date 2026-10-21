"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";

/** 距離視窗上下約 800px 時開始載入封面，捲到影片前多半已下載完成 */
const POSTER_ROOT_MARGIN = "800px 0px";

type DeferredPosterVideoProps = Omit<ComponentPropsWithoutRef<"video">, "poster"> & {
  /** 封面圖片網址（原始字串網址，請先經過 withBasePath()） */
  poster: string;
};

/**
 * 封面延後載入的 <video>：瀏覽器在頁面載入時即下載 poster（preload="none" 只延後影片本身，
 * poster 也沒有 loading="lazy"），位於頁面深處的影片因此以 IntersectionObserver 在接近視窗時才設定 poster。
 * 直接設定 DOM 屬性而非 React state，避免多一次渲染；未載入 JavaScript 時只顯示外框底色與播放控制列。
 */
export function DeferredPosterVideo({ poster, children, ...props }: DeferredPosterVideoProps) {
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

  return (
    <video ref={ref} {...props}>
      {children}
    </video>
  );
}
