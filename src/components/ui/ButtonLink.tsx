import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { withBasePath } from "@/lib/basePath";
import { cn } from "@/lib/cn";

type Variant =
  /** 白底主要行動：臺科大藍實心 */
  | "primary"
  /** 白底次要行動：白底細框 */
  | "secondary"
  /** 深藍底主要行動：香檳金實心 */
  | "accent"
  /** 深藍底次要行動：白色細框 */
  | "outline-light"
  /** 深藍底：白底藍字 */
  | "inverted"
  | "ghost";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm shadow-brand-950/15 hover:bg-brand-800 active:bg-brand-900 focus-visible:ring-2 focus-visible:ring-white",
  secondary:
    "bg-white text-brand-900 ring-1 ring-stroke ring-inset hover:bg-brand-50 hover:ring-brand-200",
  accent:
    "bg-champagne-300 text-brand-950 hover:bg-champagne-200 active:bg-champagne-400 focus-visible:outline-champagne-200",
  "outline-light":
    "text-white ring-1 ring-white/45 ring-inset hover:bg-white/10 hover:ring-white/80 focus-visible:outline-champagne-200",
  inverted:
    "bg-white text-brand-900 hover:bg-brand-50 active:bg-brand-100 focus-visible:outline-champagne-200",
  ghost: "text-brand-800 hover:bg-brand-50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 gap-1.5 px-3.5 text-sm",
  md: "h-11 gap-2 px-5 text-sm",
  lg: "h-12 gap-2 px-6 text-base",
};

type ButtonLinkProps = Omit<ComponentPropsWithoutRef<"a">, "children"> & {
  href: string;
  variant?: Variant;
  size?: Size;
  /** 另開新視窗，並自動補上 rel 與螢幕閱讀器提示 */
  external?: boolean;
  children: ReactNode;
};

/** 檔案路徑（/legacy/files/x.pdf 等）：交由瀏覽器直接開啟，不走 client-side 導覽 */
const FILE_PATH = /\.[a-z\d]{2,5}$/i;

/**
 * 站內頁面：以單一「/」開頭（排除 protocol-relative 的「//」）且不是檔案。
 * 「/#features」等跨頁錨點同樣使用 next/link（Link 會在導覽後捲到該 id，見 link.md）；
 * 純錨點「#…」、mailto:、tel: 與外部網址維持原生 <a>。
 */
function isInternalRoute(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) return false;
  const pathname = href.split(/[?#]/, 1)[0];
  return !FILE_PATH.test(pathname);
}

/**
 * 按鈕樣式連結（小圓角矩形）。站內頁面自動使用 next/link（預先載入與 client-side 導覽），
 * 其餘（同頁錨點、mailto:、外部網址、檔案）使用原生 <a>；external 時另開新視窗。
 */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  external = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  const classes = cn(
    "group/button inline-flex shrink-0 items-center justify-center rounded-md font-semibold whitespace-nowrap transition-colors duration-200 focus-visible:outline-offset-2",
    variants[variant],
    sizes[size],
    className,
  );

  if (!external && !props.download && !props.target && isInternalRoute(href)) {
    return (
      <Link href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <a
      // 站內檔案（/legacy/files/…）不經 next/link，子路徑部署時需自行加上 basePath
      href={withBasePath(href)}
      className={classes}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
      {external ? <span className="sr-only">（另開新視窗）</span> : null}
    </a>
  );
}
