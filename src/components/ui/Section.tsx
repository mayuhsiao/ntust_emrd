import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type SectionProps = ComponentPropsWithoutRef<"section"> & {
  /** white：白底；subtle：偏藍冷灰底；navy：臺科大深藍（文字反白） */
  tone?: "white" | "subtle" | "navy";
};

const tones = {
  white: "bg-white",
  subtle: "bg-surface",
  navy: "bg-brand-950 text-white",
} as const;

/** 統一的區塊外框：py-16 至 py-24 的垂直留白。 */
export function Section({ tone = "white", className, ...props }: SectionProps) {
  return (
    <section
      className={cn("relative py-16 sm:py-20 lg:py-24", tones[tone], className)}
      {...props}
    />
  );
}
