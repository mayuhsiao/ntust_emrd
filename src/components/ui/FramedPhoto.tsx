import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Photo } from "@/content/photos";

type FramedPhotoProps = {
  photo: Photo;
  /** next/image sizes，依版面實際寬度填寫 */
  sizes: string;
  /** 圖片比例（Tailwind aspect-* class） */
  aspect?: string;
  caption?: ReactNode;
  className?: string;
};

/**
 * 品牌相框：淺藍襯底＋香檳金角三角＋臺科大藍斜切，讓任何活動照片都具一致的品牌感。
 * （參考 Berkeley MAS-E 的 framed photo 手法）
 */
export function FramedPhoto({
  photo,
  sizes,
  aspect = "aspect-[3/2]",
  caption,
  className,
}: FramedPhotoProps) {
  return (
    <figure className={cn("relative isolate", className)}>
      <div className="relative overflow-hidden rounded-md bg-brand-50 p-3 shadow-[0_4px_25px_rgba(0,46,91,0.18)] sm:p-5">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-[44%] bg-champagne-300 [clip-path:polygon(0_0,100%_0,100%_100%,60%_90%)]"
        />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[39%] bg-brand-700 [clip-path:polygon(0_0,100%_60%,100%_100%,0_100%)]"
        />
        <div className={cn("relative overflow-hidden rounded-sm", aspect)}>
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes={sizes}
            placeholder="blur"
            className="object-cover"
            style={{ objectPosition: photo.position }}
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm text-slate-600">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
