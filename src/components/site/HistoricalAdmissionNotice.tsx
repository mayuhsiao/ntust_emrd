import Link from "next/link";
import { ArrowUpRight, ChevronRight, History } from "lucide-react";
import { brochureIsCurrent, brochureVersionNote } from "@/components/site/admissionsBrochure";
import type { LegacyPost } from "@/content/legacy/types";
import { currentIntakeYear } from "@/content/home";
import { isHistoricalAdmissionPost } from "@/lib/legacy";
import { site } from "@/lib/site";

const linkClass =
  "inline-flex min-h-6 items-center gap-0.5 rounded-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:decoration-brand-700";

/** 招生學年度早於目前招生年度（或無法判讀）的招生相關文章，判斷規則見 src/lib/legacy.ts */
export function isHistoricalAdmission(post: LegacyPost) {
  return isHistoricalAdmissionPost(post, currentIntakeYear);
}

const BROCHURE_NOTE_ID = "historical-admission-brochure-note";

/**
 * 歷史招生公告提示：置於文章頂端，原站內文不變，僅以版型提醒日期與連結可能失效，
 * 並導向最新的招生資訊與簡章。採香檳金淺底（非警示色），以圖示＋文字說明，不只靠顏色傳達。
 * 簡章連結尚未換成本學年度版本時，於下方註明目前版本（例：往年簡章公告文章會連到同一份簡章），
 * 並以 aria-describedby 讓連結本身帶出版本說明。
 */
export function HistoricalAdmissionNotice() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-md border border-champagne-200 bg-champagne-50 p-4 text-sm leading-relaxed text-slate-800 sm:p-5 sm:text-base"
    >
      <History aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-champagne-700 sm:mt-1" />
      <div className="min-w-0">
        <p className="text-pretty">
          <strong className="font-semibold text-brand-950">本則為歷史招生公告</strong>
          ，報名日期與連結可能已失效。最新招生時程請見{" "}
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <Link href={site.routes.admissionsInfo} className={linkClass}>
              招生資訊
              <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
            <span aria-hidden="true" className="text-champagne-600">
              ｜
            </span>
            <span className="sr-only">或</span>
            <a
              href={site.links.brochurePdf}
              target="_blank"
              rel="noopener noreferrer"
              aria-describedby={brochureIsCurrent ? undefined : BROCHURE_NOTE_ID}
              className={linkClass}
            >
              報考簡章下載
              <ArrowUpRight aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only">（PDF，另開新視窗）</span>
            </a>
          </span>
        </p>
        {brochureIsCurrent ? null : (
          <p id={BROCHURE_NOTE_ID} className="mt-1.5 text-xs leading-relaxed text-pretty text-slate-700 sm:text-sm">
            {brochureVersionNote}
          </p>
        )}
      </div>
    </div>
  );
}
