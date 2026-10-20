import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import type { Crumb } from "@/lib/ia";

type PageHeaderProps = {
  crumbs: readonly Crumb[];
  title: ReactNode;
  /** 英文小標（以 lang="en" 標記） */
  eyebrow?: string;
  lead?: ReactNode;
  /** 標題上方的附加內容（例如文章標籤） */
  meta?: ReactNode;
};

/** 深藍底焦點框改用香檳金，維持 3:1 以上對比 */
const crumbLinkClass =
  "inline-flex min-h-8 items-center rounded-sm underline-offset-4 transition-colors duration-200 hover:text-white hover:underline focus-visible:outline-champagne-200";

/**
 * 內頁頁首：臺科大深藍帶狀區（參考 UniMelb page header），
 * 依序為麵包屑、英文小標、h1 與導言；右側為靜態幾何點綴。
 */
export function PageHeader({ crumbs, title, eyebrow, lead, meta }: PageHeaderProps) {
  const last = crumbs.length - 1;

  return (
    <header className="relative isolate overflow-hidden bg-brand-950 text-white">
      {/* 靜態幾何點綴：斜切的藍色面板與香檳金角三角（與頁尾宣言帶同一語彙） */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 -z-10 hidden w-[34%] bg-brand-900 [clip-path:polygon(30%_0,100%_0,100%_100%,0_100%)] md:block"
      />
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 -z-10 hidden w-[18%] bg-brand-800/70 [clip-path:polygon(46%_0,100%_0,100%_100%,0_100%)] md:block"
      />
      <span
        aria-hidden="true"
        className="absolute top-0 right-0 -z-10 hidden size-10 bg-champagne-300 [clip-path:polygon(0_0,100%_0,100%_100%)] md:block"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 -z-10 h-px bg-white/10"
      />

      <Container className="py-12 lg:py-16">
        <nav aria-label="麵包屑">
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-brand-100/80">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.href}-${index}`} className="flex min-w-0 items-center gap-1.5">
                {index > 0 ? (
                  <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-brand-300" />
                ) : null}
                {index === last ? (
                  <span aria-current="page" className="inline-flex min-h-8 items-center font-medium text-white">
                    {crumb.label}
                  </span>
                ) : (
                  <Link href={crumb.href} className={crumbLinkClass}>
                    {crumb.label}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-6 max-w-4xl lg:mt-8">
          {eyebrow ? (
            <p
              lang="en"
              className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-300 uppercase"
            >
              <span aria-hidden="true" className="h-px w-8 bg-champagne-300/70" />
              {eyebrow}
            </p>
          ) : null}
          {meta ? <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div> : null}
          <h1
            className={
              eyebrow || meta
                ? "mt-3 text-3xl leading-tight font-semibold tracking-[0.01em] text-balance lg:text-[2.625rem]"
                : "text-3xl leading-tight font-semibold tracking-[0.01em] text-balance lg:text-[2.625rem]"
            }
          >
            {title}
          </h1>
          {lead ? (
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-pretty text-brand-100/85 lg:text-lg">
              {lead}
            </p>
          ) : null}
        </div>
      </Container>
    </header>
  );
}
