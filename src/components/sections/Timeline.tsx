import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, CalendarDays, Check, Info } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { admissions, type TimelineStep } from "@/content/home";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import { keepDateTogether } from "@/lib/text";
import { EligibilityChecklist } from "./EligibilityChecklist";

const lastIndex = admissions.steps.length - 1;

/** 區塊底部延伸至「招生專區」內頁 */
const admissionLinks = [
  { label: "招生資訊", href: site.routes.admissionsInfo },
  { label: "招生公告", href: site.routes.admissionsNews },
  { label: "隨班附讀", href: site.routes.audit },
] as const;

/** 報名資格自我檢視底部的學程辦公室聯絡方式（首頁與「招生資訊」頁共用；只傳入元件需要的欄位） */
export const eligibilityContact = {
  phone: site.contact.phone,
  phoneHref: site.contact.phoneHref,
  email: site.contact.email,
  emailHref: site.contact.emailHref,
};

export function Timeline() {
  return (
    <Section id="admissions" aria-labelledby="admissions-title">
      <Container>
        <SectionHeading
          id="admissions-title"
          eyebrow={admissions.eyebrow}
          title={admissions.title}
          description={admissions.description}
        />
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
          <Tag tone="brand" className="px-3 py-1">
            {admissions.quota}
          </Tag>
          <p className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
            <Info
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-brand-600"
            />
            {admissions.notice}
          </p>
        </div>

        <ol
          role="list"
          aria-label="入學流程"
          className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-4 lg:gap-8"
        >
          {admissions.steps.map((step, index) => (
            <RoadmapStep
              key={step.step}
              step={step}
              isLast={index === lastIndex}
            />
          ))}
        </ol>

        <EligibilityChecklist
          {...admissions.eligibility}
          contact={eligibilityContact}
          className="mt-14 lg:mt-20"
        />

        <div className="mt-10 flex flex-col gap-2 border-t border-stroke pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="text-sm leading-relaxed text-pretty text-slate-600">
            {admissions.moreInfo}
          </p>
          <ul aria-label="招生專區" className="flex shrink-0 flex-wrap gap-x-6">
            {admissionLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="group inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline"
                >
                  {link.label}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}

/**
 * 入學流程的預計時程（首頁 Roadmap 與「招生資訊」頁共用）。
 * 「公告｜報名」等複合時程拆成獨立行，寬度不足時不會從日期中間斷開；螢幕閱讀器以「，」分隔。
 */
export function StepPeriod({ period }: { period: string }) {
  const periods = period.split("｜");
  return (
    <span className="min-w-0">
      <span className="sr-only">預計時程：</span>
      {periods.map((part, index) => (
        <Fragment key={part}>
          {index > 0 ? <span className="sr-only">，</span> : null}
          <span className="block text-balance">{keepDateTogether(part)}</span>
        </Fragment>
      ))}
    </span>
  );
}

function RoadmapStep({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const label = String(step.step).padStart(2, "0");

  return (
    <li className="relative flex gap-5 lg:flex-col lg:gap-6">
      {isLast ? null : (
        <span
          aria-hidden="true"
          className="absolute top-14 -bottom-8 left-6 w-px bg-brand-200 lg:top-6 lg:-right-6 lg:bottom-auto lg:left-14 lg:h-px lg:w-auto"
        />
      )}

      <span
        aria-hidden="true"
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-full text-base font-semibold tabular-nums ring-1",
          isLast
            ? "bg-brand-700 text-white ring-brand-700"
            : "bg-white text-brand-800 ring-brand-200",
        )}
      >
        {step.step}
      </span>

      <div className="max-w-2xl min-w-0 flex-1 pt-1 lg:max-w-none lg:pt-0">
        <p
          lang="en"
          className="text-xs font-semibold tracking-[0.2em] text-champagne-700 tabular-nums"
        >
          STEP {label}
        </p>
        <h3 className="mt-2 text-lg leading-snug font-semibold tracking-[0.01em] text-balance text-brand-950">
          {step.title}
        </h3>
        <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed font-medium text-brand-700">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <StepPeriod period={step.period} />
        </p>
        <p className="mt-3 text-sm leading-relaxed text-pretty text-slate-700">
          {step.description}
        </p>
        <ul className="mt-4 space-y-2 border-t border-stroke pt-4">
          {step.details.map((detail) => (
            <li
              key={detail}
              className="flex items-start gap-2 text-sm leading-relaxed text-slate-600"
            >
              <Check
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-brand-600"
              />
              {detail}
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
