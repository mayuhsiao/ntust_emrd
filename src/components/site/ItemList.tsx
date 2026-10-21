import Link from "next/link";
import { ArrowRight, ArrowUpRight, FileText } from "lucide-react";
import type { LegacyListItem } from "@/content/legacy/types";
import { withBasePath } from "@/lib/basePath";
import { titleTag } from "@/lib/legacy";
import { PostTag } from "./PostTag";

type ItemListProps = {
  items: readonly LegacyListItem[];
  /** 清單標題（h2）；與內文並存時用以分段 */
  title?: string;
  className?: string;
};

const FILE_EXTENSION = /\.(pdf|docx?|odt|xlsx?|ods|pptx?|zip)$/i;

/** 頁面條目清單（法規、表單、公告連結等）：髮絲線分隔、箭頭引導 */
export function ItemList({ items, title, className }: ItemListProps) {
  if (items.length === 0) return null;
  return (
    <section className={className}>
      {title ? (
        <h2 className="text-xl font-semibold tracking-[0.01em] text-brand-950">
          {title}
        </h2>
      ) : null}
      <ul className={title ? "mt-4 border-y border-stroke" : "border-y border-stroke"}>
        {items.map((item, index) => {
          const { tag, text } = titleTag(item.title);
          const isFile = !item.external && FILE_EXTENSION.test(item.href);
          const rowClass =
            "group flex min-h-16 items-center gap-4 py-4 pr-1 transition-colors duration-200 hover:bg-surface sm:px-3";
          const body = (
            <>
              {isFile ? (
                <FileText aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
              ) : null}
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
                {tag ? <PostTag tag={tag} /> : null}
                <span className="text-base leading-snug font-medium text-pretty text-brand-950 decoration-brand-300 underline-offset-4 group-hover:text-brand-800 group-hover:underline">
                  {text}
                </span>
                {item.date ? (
                  <time dateTime={item.date} className="text-sm text-slate-600 tabular-nums">
                    {item.date}
                  </time>
                ) : null}
              </span>
              {item.external ? (
                <>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                  <span className="sr-only">（另開新視窗）</span>
                </>
              ) : (
                <ArrowRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5"
                />
              )}
            </>
          );

          return (
            <li key={`${item.href}-${index}`} className="border-t border-stroke first:border-t-0">
              {item.external ? (
                <a href={item.href} target="_blank" rel="noopener noreferrer" className={rowClass}>
                  {body}
                </a>
              ) : isFile || item.href.startsWith("/legacy/") ? (
                <a href={withBasePath(item.href)} className={rowClass}>
                  {body}
                </a>
              ) : (
                <Link href={item.href} className={rowClass}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
