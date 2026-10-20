import { ArrowRight } from "lucide-react";
import { pathfinder } from "@/content/home";

/** 底色交錯：單欄與四欄時逐格交替，兩欄時呈棋盤格 */
const tileTones = [
  "bg-brand-900",
  "bg-brand-950",
  "bg-brand-900 sm:bg-brand-950 lg:bg-brand-900",
  "bg-brand-950 sm:bg-brand-900 lg:bg-brand-950",
] as const;

/** Hero 下方四格路徑導覽（參考 UniMelb pathfinder），與 Hero 連成一整塊臺科大藍 */
export function Pathfinder() {
  return (
    <section aria-labelledby="pathfinder-title" className="bg-brand-950">
      <h2 id="pathfinder-title" className="sr-only">
        快速導覽
      </h2>
      <ul className="grid gap-px border-t border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
        {pathfinder.map((item, index) => (
          <li key={item.href} className={tileTones[index % tileTones.length]}>
            <a
              href={item.href}
              className="group flex h-full min-h-44 flex-col px-6 py-8 transition-colors duration-200 hover:bg-brand-800 focus-visible:-outline-offset-4 focus-visible:outline-champagne-200 lg:min-h-56 lg:px-8 lg:py-10"
            >
              <span
                lang="en"
                className="text-xs font-semibold tracking-[0.2em] text-champagne-300 uppercase"
              >
                {item.englishLabel}
              </span>
              <div className="mt-4 flex items-center gap-2">
                <h3 className="text-xl font-semibold tracking-[0.01em] text-white decoration-brand-300 decoration-1 underline-offset-[6px] group-hover:underline lg:text-2xl">
                  {item.label}
                </h3>
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-brand-300 transition-transform duration-200 group-hover:translate-x-1 lg:size-6"
                />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-pretty text-brand-100/80 lg:text-base">
                {item.description}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
