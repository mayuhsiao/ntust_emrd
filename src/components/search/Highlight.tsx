import { Fragment } from "react";
import { highlight, type SearchTerm } from "@/lib/search";

/** 命中文字以 <mark> 標示；資料一律以文字節點輸出，不使用 innerHTML */
export function Highlight({ text, terms }: { text: string; terms: readonly SearchTerm[] }) {
  return (
    <>
      {highlight(text, terms).map((segment, index) =>
        segment.hit ? (
          <mark
            key={index}
            className="rounded-[2px] bg-champagne-200/80 px-px text-brand-950 [box-decoration-break:clone]"
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
