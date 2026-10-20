import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type SectionHeadingProps = {
  /** 供 <section aria-labelledby> 使用 */
  id: string;
  /** 英文小標（預設以 lang="en" 標記，讓螢幕閱讀器以英文發音） */
  eyebrow: string;
  eyebrowLang?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  /** 深藍底使用 */
  inverted?: boolean;
  /** 標題層級，預設 h2 */
  as?: "h2" | "h3";
  className?: string;
};

export function SectionHeading({
  id,
  eyebrow,
  eyebrowLang = "en",
  title,
  description,
  align = "left",
  inverted = false,
  as: Heading = "h2",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      <p
        lang={eyebrowLang}
        className={cn(
          "flex items-center gap-3 text-xs font-semibold tracking-[0.2em] uppercase",
          align === "center" && "justify-center",
          inverted ? "text-champagne-300" : "text-champagne-700",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("h-px w-8", inverted ? "bg-champagne-300/70" : "bg-champagne-500/70")}
        />
        {eyebrow}
      </p>
      <Heading
        id={id}
        className={cn(
          "mt-4 text-3xl leading-tight font-semibold tracking-[0.01em] text-balance sm:text-4xl lg:text-[2.625rem]",
          inverted ? "text-white" : "text-brand-950",
        )}
      >
        {title}
      </Heading>
      {description ? (
        <p
          className={cn(
            "mt-5 text-base leading-relaxed text-pretty sm:text-lg",
            inverted ? "text-brand-100/85" : "text-slate-600",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
