import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type TagTone =
  | "champagne"
  | "titanium"
  | "brand"
  | "champagne-inverted"
  | "inverted";

const tones: Record<TagTone, string> = {
  champagne: "bg-champagne-50 text-champagne-800 ring-champagne-200",
  titanium: "bg-titanium-50 text-titanium-700 ring-titanium-200",
  brand: "bg-brand-50 text-brand-800 ring-brand-100",
  /** 深藍底使用 */
  "champagne-inverted": "bg-champagne-300/10 text-champagne-200 ring-champagne-300/30",
  inverted: "bg-white/5 text-brand-100 ring-white/15",
};

/** 低調的香檳金／鈦金屬／臺科大藍標籤（小圓角，與按鈕一致）。 */
export function Tag({
  tone = "titanium",
  className,
  children,
}: {
  tone?: TagTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
