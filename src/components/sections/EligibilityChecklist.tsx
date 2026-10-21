"use client";

import { useId, useRef, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  ListChecks,
  Mail,
  Phone,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/cn";

export type EligibilityItem = {
  id: string;
  label: string;
  detail: string;
};

export type EligibilityContact = {
  phone: string;
  phoneHref: string;
  email: string;
  emailHref: string;
};

type EligibilityChecklistProps = {
  title: string;
  description: string;
  items: readonly EligibilityItem[];
  successMessage: string;
  pendingMessage: string;
  disclaimer: string;
  contact: EligibilityContact;
  /** 收合按鈕外層的標題層級：首頁位於 h2 區塊之下為 h3（預設）；「招生資訊」頁直接列為 h2 */
  headingLevel?: 2 | 3;
  className?: string;
};

const contactLinkClass =
  "inline-flex min-h-11 items-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-brand-700 ring-1 ring-stroke transition-colors duration-200 ring-inset hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-200";

/**
 * 報名資格自我檢視：APG Accordion 樣式的收合面板＋原生核取方塊。
 * 收合時以 inert 移出 Tab 順序與無障礙樹，展開動畫採 grid-rows 0fr → 1fr。
 */
export function EligibilityChecklist({
  title,
  description,
  items,
  successMessage,
  pendingMessage,
  disclaimer,
  contact,
  headingLevel = 3,
  className,
}: EligibilityChecklistProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const firstInputRef = useRef<HTMLInputElement>(null);

  const baseId = useId();
  const triggerId = `${baseId}-trigger`;
  const panelId = `${baseId}-panel`;

  const total = items.length;
  const count = checked.size;
  const allChecked = total > 0 && count === total;
  const progress = total > 0 ? Math.round((count / total) * 100) : 0;

  function toggle(id: string, isChecked: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (isChecked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function reset() {
    setChecked(new Set());
    // 重設按鈕會隨之消失，將焦點移回第一個條件避免焦點遺失
    firstInputRef.current?.focus();
  }

  return (
    <div
      className={cn("rounded-md border border-stroke bg-surface", className)}
    >
      <Heading>
        <button
          type="button"
          id={triggerId}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
          className="group flex min-h-11 w-full items-center gap-4 rounded-md p-5 text-left sm:gap-5 sm:p-6 lg:px-8"
        >
          <span
            aria-hidden="true"
            className="hidden size-11 shrink-0 place-items-center rounded-md bg-white text-brand-700 ring-1 ring-stroke sm:grid"
          >
            <ListChecks className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span
              aria-hidden="true"
              lang="en"
              className="block text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase"
            >
              Eligibility Check
            </span>
            <span className="mt-1 block text-lg font-semibold tracking-[0.01em] text-balance text-brand-950 sm:text-xl">
              {title}
            </span>
          </span>
          <span
            aria-hidden="true"
            className="hidden text-sm font-medium text-slate-600 transition-colors duration-200 group-hover:text-brand-700 sm:inline"
          >
            {open ? "收合" : "展開檢視"}
          </span>
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-md bg-white text-brand-700 ring-1 ring-stroke transition-[box-shadow,background-color] duration-200 group-hover:bg-brand-50 group-hover:ring-brand-200"
          >
            <ChevronDown
              className={cn(
                "size-5 transition-transform duration-300",
                open && "rotate-180",
              )}
            />
          </span>
        </button>
      </Heading>

      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        inert={!open}
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-stroke px-5 pt-6 pb-6 sm:px-6 lg:px-8 lg:pt-8 lg:pb-8">
            <p className="max-w-3xl text-sm leading-relaxed text-pretty text-slate-700 sm:text-base">
              {description}
            </p>

            <fieldset className="mt-6">
              <legend className="sr-only">{title}</legend>
              <ul className="grid gap-3 lg:grid-cols-2">
                {items.map((item, index) => {
                  const isChecked = checked.has(item.id);
                  const inputId = `${baseId}-${item.id}`;
                  const detailId = `${inputId}-detail`;
                  return (
                    <li
                      key={item.id}
                      className={cn(
                        "relative flex min-h-11 items-start gap-4 rounded-md p-4 ring-1 transition-[background-color,box-shadow] duration-200",
                        isChecked
                          ? "bg-brand-50/60 ring-brand-300"
                          : "bg-white ring-stroke hover:ring-brand-200",
                      )}
                    >
                      <input
                        ref={index === 0 ? firstInputRef : undefined}
                        id={inputId}
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) =>
                          toggle(item.id, event.target.checked)
                        }
                        aria-describedby={detailId}
                        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-sm accent-brand-700"
                      />
                      <div className="min-w-0">
                        {/* after: 偽元素讓整列皆可點擊，名稱與說明仍分開供輔助科技讀取 */}
                        <label
                          htmlFor={inputId}
                          className="block cursor-pointer font-medium text-balance text-brand-950 after:absolute after:inset-0 after:rounded-md"
                        >
                          {item.label}
                        </label>
                        <p
                          id={detailId}
                          className="mt-1 text-sm leading-relaxed text-pretty text-slate-600"
                        >
                          {item.detail}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="mt-6 rounded-md bg-white p-5 ring-1 ring-stroke sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div role="status" aria-live="polite" aria-atomic="true">
                    {allChecked ? (
                      <p className="flex items-start gap-3 text-sm leading-relaxed font-medium text-brand-900 sm:text-base">
                        <CircleCheck
                          aria-hidden="true"
                          className="mt-0.5 size-5 shrink-0 text-brand-700"
                        />
                        {successMessage}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-brand-950">
                        已確認{" "}
                        <span className="tabular-nums">
                          {count}/{total}
                        </span>{" "}
                        項
                      </p>
                    )}
                  </div>
                  {allChecked ? null : (
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">
                      {pendingMessage}
                    </p>
                  )}
                </div>

                {count > 0 ? (
                  <button
                    type="button"
                    onClick={reset}
                    className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-md px-4 text-sm font-medium text-brand-800 ring-1 ring-stroke transition-colors duration-200 ring-inset hover:bg-brand-50 hover:ring-brand-200"
                  >
                    <RotateCcw aria-hidden="true" className="size-4" />
                    重新檢視
                  </button>
                ) : null}
              </div>

              <div aria-hidden="true" className="mt-5 h-1 overflow-hidden bg-stroke">
                <div
                  className="h-full bg-brand-600 transition-[width] duration-500 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <p className="text-xs leading-relaxed text-slate-600">
                {disclaimer}
              </p>
              <ul
                aria-label="學程辦公室聯絡方式"
                className="flex flex-wrap gap-2"
              >
                <li>
                  <a href={contact.phoneHref} className={contactLinkClass}>
                    <Phone aria-hidden="true" className="size-4 shrink-0" />
                    <span className="sr-only">來電：</span>
                    <span className="tabular-nums">{contact.phone}</span>
                  </a>
                </li>
                <li className="min-w-0">
                  <a
                    href={contact.emailHref}
                    className={cn(contactLinkClass, "max-w-full")}
                  >
                    <Mail aria-hidden="true" className="size-4 shrink-0" />
                    <span className="sr-only">來信：</span>
                    <span className="min-w-0 break-all">{contact.email}</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
