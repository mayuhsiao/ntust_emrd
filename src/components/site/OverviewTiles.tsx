import Link from "next/link";
import { ArrowRight } from "lucide-react";

export type OverviewTile = {
  href: string;
  label: string;
  /** 一至兩行摘要 */
  excerpt?: string;
  /** 例如「共 9 則」 */
  meta?: string;
};

/** 單元總覽的頁面格（參考 UniMelb pathfinder，白底版本）：整張卡片可點擊、箭頭引導 */
export function OverviewTiles({ tiles }: { tiles: readonly OverviewTile[] }) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {tiles.map((tile, index) => (
        <li key={tile.href}>
          <Link
            href={tile.href}
            // 單元內頁面數量少且皆為靜態頁：完整預先載入，點擊後不必再等伺服器回應
            prefetch={true}
            className="group relative flex h-full min-h-44 flex-col rounded-md border border-stroke bg-white p-6 transition-[border-color,background-color,box-shadow] duration-200 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-[0_4px_20px_rgba(0,46,91,0.08)] lg:p-7"
          >
            <span
              aria-hidden="true"
              className="absolute top-0 left-6 h-0.5 w-10 bg-champagne-400 transition-[width] duration-300 group-hover:w-16 lg:left-7"
            />
            <span aria-hidden="true" className="text-sm font-medium text-champagne-700 tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="mt-3 flex items-start gap-2">
              <span className="text-lg leading-snug font-semibold text-pretty text-brand-950 decoration-brand-300 underline-offset-[6px] group-hover:underline lg:text-xl">
                {tile.label}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="mt-1 size-5 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-1"
              />
            </span>
            {tile.excerpt ? (
              <span className="mt-3 line-clamp-2 text-sm leading-relaxed text-slate-600">
                {tile.excerpt}
              </span>
            ) : null}
            {tile.meta ? (
              <span className="mt-auto pt-4 text-sm font-medium text-brand-700 tabular-nums">
                {tile.meta}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
