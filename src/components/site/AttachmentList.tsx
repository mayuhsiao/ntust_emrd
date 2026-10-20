import { Download, FileText } from "lucide-react";
import type { LegacyAttachment } from "@/content/legacy/types";

type AttachmentListProps = {
  attachments: readonly LegacyAttachment[];
  className?: string;
};

/** 附件下載清單（原站「附件」區），檔案類型與大小以 meta 顯示 */
export function AttachmentList({ attachments, className }: AttachmentListProps) {
  if (attachments.length === 0) return null;

  return (
    <section className={className}>
      <h2
        className="flex items-center gap-3 text-xl font-semibold tracking-[0.01em] text-brand-950"
      >
        附件下載
        <span className="text-sm font-normal text-slate-600 tabular-nums">
          {attachments.length} 個檔案
        </span>
      </h2>
      <ul className="mt-4 grid gap-3">
        {attachments.map((file) => (
          <li key={file.href}>
            <a
              href={file.href}
              className="group flex min-h-16 items-center gap-4 rounded-md border border-stroke bg-white px-4 py-3 transition-colors duration-200 hover:border-brand-200 hover:bg-brand-50/60"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-brand-50 text-brand-700 ring-1 ring-brand-100 ring-inset"
              >
                <FileText className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base leading-snug font-medium break-words text-brand-950 decoration-brand-300 underline-offset-4 group-hover:underline">
                  {file.label}
                </span>
                {file.meta ? (
                  <span className="mt-0.5 block text-sm text-slate-600">{file.meta}</span>
                ) : null}
              </span>
              <Download
                aria-hidden="true"
                className="size-5 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-y-0.5"
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
