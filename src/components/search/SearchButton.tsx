"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { openSearch } from "./openSearch";

/** 頁首的搜尋鈕（44×44）：開啟全站搜尋視窗，亦可用 Ctrl／⌘＋K */
export function SearchButton({ onLight, className }: { onLight: boolean; className?: string }) {
  return (
    <button
      type="button"
      data-search-trigger=""
      aria-label="搜尋"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      title="搜尋（Ctrl＋K）"
      onClick={(event) => openSearch(event.currentTarget)}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md transition-colors duration-300",
        onLight
          ? "text-brand-950 hover:bg-brand-50"
          : "text-white hover:bg-white/10 focus-visible:outline-champagne-200",
        className,
      )}
    >
      <Search aria-hidden="true" className="size-5" strokeWidth={1.9} />
    </button>
  );
}
