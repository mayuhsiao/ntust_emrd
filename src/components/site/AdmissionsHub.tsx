import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck, CalendarDays, Download, Info } from "lucide-react";
import { EligibilityChecklist } from "@/components/sections/EligibilityChecklist";
import { brochureVersionNote } from "@/components/site/admissionsBrochure";
import { StepPeriod, eligibilityContact } from "@/components/sections/Timeline";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { admissions, admissionsCta, currentIntakeYear, hero } from "@/content/home";
import { site } from "@/lib/site";
import { keepDateTogether } from "@/lib/text";

const SCHEDULE_TITLE_ID = "admissions-hub-schedule-title";
const BROCHURE_NOTE_ID = "admissions-hub-brochure-note";
const STEPS_TITLE_ID = "admissions-hub-steps-title";
const LEGACY_TITLE_ID = "admissions-hub-legacy-title";

/** 入學學年度的西元年（116 學年度 → 2027 年 9 月入學） */
const intakeCalendarYear = currentIntakeYear + 1911;

/**
 * 招生日程：以首頁招生行動帶的日程為主，補上 Hero 招生卡中日程未涵蓋的項目（招生名額）。
 * 兩處皆取自 src/content/home.ts，年度更新時只需修改該檔。
 */
const scheduleItems = [
  ...admissionsCta.dates,
  ...hero.intake.items.filter(
    (item) => !admissionsCta.dates.some((date) => date.label === item.label),
  ),
];

/** 「招生資訊」頁頁首導言 */
export const admissionsHubLead = `${currentIntakeYear} 學年度招生日程、入學流程與報考資格自我檢視；原網站的歷年招生資訊收錄於頁面下方。`;

const sectionTitleClass = "text-xl font-semibold tracking-[0.01em] text-brand-950 sm:text-2xl";

/**
 * 「招生資訊」頁（/admissions/info）的版型區塊：本學年度招生日程、入學流程摘要與報考資格自我檢視，
 * 原網站條目（含已過期的往年公告）收在「歷年招生資訊（原網站）」標題之下，內容不變。
 * 完整的入學流程說明位於首頁 Roadmap（/#admissions），本頁僅列各階段名稱與時程。
 * @param legacy 原網站「招生資訊」頁的內容（條目清單）
 */
export function AdmissionsHub({ legacy }: { legacy: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-14">
      <ScheduleCard />
      <StepList />
      <EligibilityChecklist
        {...admissions.eligibility}
        contact={eligibilityContact}
        headingLevel={2}
      />
      <section aria-labelledby={LEGACY_TITLE_ID} className="border-t border-stroke pt-10">
        <h2 id={LEGACY_TITLE_ID} className={sectionTitleClass}>
          歷年招生資訊（原網站）
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-pretty text-slate-600">
          以下為原網站「招生資訊」頁的條目，內容為往年資料；報名日期與連結請以最新招生簡章為準。
        </p>
        <div className="mt-5">{legacy}</div>
      </section>
    </div>
  );
}

function ScheduleCard() {
  return (
    <section
      aria-labelledby={SCHEDULE_TITLE_ID}
      className="rounded-md border border-stroke bg-surface p-5 sm:p-8"
    >
      <p
        lang="en"
        className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase tabular-nums"
      >
        <span aria-hidden="true" className="h-px w-8 bg-champagne-400" />
        Admissions {intakeCalendarYear}
      </p>
      <h2
        id={SCHEDULE_TITLE_ID}
        className="mt-3 text-2xl leading-snug font-semibold tracking-[0.01em] text-balance text-brand-950 sm:text-[1.75rem]"
      >
        {currentIntakeYear} 學年度招生日程
      </h2>

      <dl className="mt-6 grid border-b border-stroke sm:grid-cols-2 sm:gap-x-8">
        {scheduleItems.map((item) => (
          <div key={item.label} className="border-t border-stroke py-4">
            <dt className="text-sm text-slate-600">{item.label}</dt>
            <dd className="mt-1 text-base font-semibold text-balance text-brand-950 tabular-nums">
              {keepDateTogether(item.value)}
            </dd>
          </div>
        ))}
      </dl>

      {/* 日期尚未經正式簡章確認，提示須維持可見 */}
      <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed font-medium text-slate-700">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand-600" />
        {hero.intake.note}
      </p>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <ButtonLink
          href={site.links.brochurePdf}
          external
          size="lg"
          aria-describedby={BROCHURE_NOTE_ID}
          className="w-full sm:w-auto"
        >
          <Download aria-hidden="true" className="size-4.5" />
          報考簡章下載 (PDF)
        </ButtonLink>
        <ButtonLink
          href={site.links.consultation}
          variant="secondary"
          size="lg"
          className="w-full sm:w-auto"
        >
          <CalendarCheck aria-hidden="true" className="size-4.5" />
          線上預約諮詢
        </ButtonLink>
      </div>
      {/* 版本說明：簡章尚未換成本學年度版本時補充「僅供參考」（與歷史招生公告提示共用） */}
      <p id={BROCHURE_NOTE_ID} className="mt-3 text-xs leading-relaxed text-slate-600">
        {brochureVersionNote}
      </p>
    </section>
  );
}

function StepList() {
  return (
    <section aria-labelledby={STEPS_TITLE_ID}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <h2 id={STEPS_TITLE_ID} className={sectionTitleClass}>
          入學流程
        </h2>
        <Link
          href={`${site.routes.home}#admissions`}
          className="group inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline"
        >
          各階段說明（首頁）
          <ArrowRight
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-pretty text-slate-600">{admissions.notice}</p>

      <ol role="list" aria-label="入學流程" className="mt-5 border-y border-stroke">
        {admissions.steps.map((step) => (
          <li
            key={step.step}
            className="flex gap-4 border-t border-stroke py-4 first:border-t-0 sm:items-center sm:gap-5 sm:px-1"
          >
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-sm font-semibold text-brand-800 tabular-nums ring-1 ring-brand-200"
            >
              {step.step}
            </span>
            <div className="min-w-0 flex-1 sm:flex sm:items-center sm:justify-between sm:gap-8">
              <h3 className="pt-1.5 text-base leading-snug font-semibold text-balance text-brand-950 sm:pt-0">
                {step.title}
              </h3>
              {/* 桌機版時程固定欄寬並靠左，各列的日曆圖示對齊成一欄 */}
              <p className="mt-1.5 flex items-start gap-2 text-sm leading-relaxed font-medium text-brand-700 sm:mt-0 sm:w-64 sm:shrink-0">
                <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <StepPeriod period={step.period} />
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
