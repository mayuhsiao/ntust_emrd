import Link from "next/link";
import { ArrowLeft, ArrowRight, List } from "lucide-react";
import { titleTag, type PostSummary } from "@/lib/legacy";

type PostPagerProps = {
  prev?: PostSummary;
  next?: PostSummary;
  /** 列表名稱與網址，例如「公告欄」／news */
  listLabel: string;
  listHref: string;
};

function PagerLink({ post, direction }: { post: PostSummary; direction: "prev" | "next" }) {
  const { text } = titleTag(post.title);
  const isPrev = direction === "prev";
  const Icon = isPrev ? ArrowLeft : ArrowRight;
  return (
    <Link
      href={`/posts/${post.id}`}
      className="group flex h-full min-h-24 flex-col justify-center gap-1.5 rounded-md border border-stroke bg-white px-5 py-4 transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/60"
    >
      <span
        className={
          isPrev
            ? "flex items-center gap-1.5 text-sm font-medium text-brand-700"
            : "flex items-center justify-end gap-1.5 text-sm font-medium text-brand-700"
        }
      >
        {isPrev ? (
          <Icon aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
        ) : null}
        {isPrev ? "上一則" : "下一則"}
        {!isPrev ? (
          <Icon aria-hidden="true" className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        ) : null}
      </span>
      <span
        className={
          isPrev
            ? "line-clamp-2 text-base leading-snug font-medium text-balance text-brand-950 decoration-brand-300 underline-offset-4 group-hover:underline"
            : "line-clamp-2 text-right text-base leading-snug font-medium text-balance text-brand-950 decoration-brand-300 underline-offset-4 group-hover:underline"
        }
      >
        {text}
      </span>
    </Link>
  );
}

/** 文章頁底部：同一列表的上一則／下一則與「回到列表」 */
export function PostPager({ prev, next, listLabel, listHref }: PostPagerProps) {
  return (
    <nav aria-label="文章導覽" className="border-t border-stroke pt-8">
      {prev || next ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {prev ? (
            <li>
              <PagerLink post={prev} direction="prev" />
            </li>
          ) : null}
          {next ? (
            <li className="sm:col-start-2">
              <PagerLink post={next} direction="next" />
            </li>
          ) : null}
        </ul>
      ) : null}
      <Link
        href={listHref}
        className="group mt-6 inline-flex min-h-11 items-center gap-2 text-base font-semibold text-brand-700 underline-offset-4 hover:underline"
      >
        <List aria-hidden="true" className="size-4.5 shrink-0" />
        回到{listLabel}列表
      </Link>
    </nav>
  );
}
