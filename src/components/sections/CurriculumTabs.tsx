import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Compass,
  Factory,
  Microscope,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import {
  curriculum,
  requirements,
  type Course,
  type CurriculumModule,
} from "@/content/home";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";
import { CurriculumTabsClient } from "./CurriculumTabsClient";

/** 課程主軸橫幅的裝飾圖示（鍵為 curriculum.modules 的 id） */
const moduleIcons: Partial<Record<string, LucideIcon>> = {
  "engineering-rd": Microscope,
  "smart-manufacturing": Factory,
  "strategy-leadership": Compass,
};

/** 修業規定區塊底部的延伸閱讀，依上方規定項目的順序排列 */
const requirementLinks: ReadonlyArray<{
  label: string;
  href: string;
  external?: boolean;
}> = [
  { label: "學生修業規定", href: site.links.studyRules, external: true },
  { label: "論文．學位考試．畢業流程", href: site.routes.graduation },
  { label: "歷屆畢業論文", href: site.routes.theses },
  { label: "學分費調整專區", href: site.routes.tuition },
];

/** 前瞻課綱（三大課程主軸 Tabs）＋修業規定，共用同一區塊。 */
export function CurriculumTabs() {
  const tabs = curriculum.modules.map((courseModule) => ({
    id: courseModule.id,
    label: courseModule.label,
    englishLabel: courseModule.englishLabel,
    panel: <ModulePanel courseModule={courseModule} />,
  }));

  return (
    <Section id="curriculum" aria-labelledby="curriculum-title">
      <Container>
        <SectionHeading
          id="curriculum-title"
          eyebrow={curriculum.eyebrow}
          title={curriculum.title}
          description={curriculum.description}
        />

        <CurriculumTabsClient
          tabs={tabs}
          label="課程主軸"
          className="mt-12 lg:mt-16"
        />

        <div className="mt-10 flex flex-col gap-2 border-t border-stroke pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
          <p className="max-w-3xl text-sm leading-relaxed text-pretty text-slate-600">
            {curriculum.footnote}
          </p>
          <TextLink href={site.routes.courses} className="shrink-0">
            查看課程地圖
          </TextLink>
        </div>

        <Requirements />
      </Container>
    </Section>
  );
}

function ModulePanel({ courseModule }: { courseModule: CurriculumModule }) {
  const Icon = moduleIcons[courseModule.id];
  const requiredCount = courseModule.courses.filter(
    (course) => course.type === "必修",
  ).length;
  const electiveCount = courseModule.courses.length - requiredCount;
  const composition = [
    requiredCount > 0 ? `必修 ${requiredCount} 門` : null,
    electiveCount > 0 ? `選修 ${electiveCount} 門` : null,
  ]
    .filter(Boolean)
    .join("・");

  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:gap-8">
      {/* 課程主軸橫幅：深藍底＋香檳金左側色條 */}
      <div className="flex flex-col rounded-md border-l-4 border-champagne-300 bg-brand-900 p-7 text-white lg:col-span-4 lg:p-8">
        {Icon ? (
          <Icon
            aria-hidden="true"
            strokeWidth={1.5}
            className="size-9 text-champagne-300"
          />
        ) : null}
        <p
          lang="en"
          className={cn(
            "text-xs leading-relaxed font-semibold tracking-[0.2em] text-balance text-champagne-300 uppercase",
            Icon && "mt-6",
          )}
        >
          {courseModule.englishLabel}
        </p>
        <h3 className="mt-3 text-2xl leading-snug font-semibold tracking-[0.01em] text-balance">
          {courseModule.label}
        </h3>
        <p className="mt-4 text-base leading-relaxed text-pretty text-brand-100/85">
          {courseModule.summary}
        </p>

        <div className="mt-auto pt-8">
          <div className="border-t border-white/15 pt-6">
            <p className="flex items-baseline gap-2">
              <span className="text-5xl leading-none font-light tabular-nums">
                {courseModule.courses.length}
              </span>
              <span className="text-base text-brand-100">門代表課程</span>
            </p>
            <p className="mt-3 text-sm text-brand-100/80 tabular-nums">
              {composition}
            </p>
          </div>
        </div>
      </div>

      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
        {courseModule.courses.map((course) => (
          <CourseCard key={course.name} course={course} />
        ))}
      </ul>
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  return (
    <li className="flex flex-col rounded-md border border-stroke bg-white p-6 transition-colors duration-200 hover:border-brand-300">
      <h4 className="text-lg leading-snug font-semibold tracking-[0.01em] text-balance text-brand-950">
        {/* 長課名（如「專利（一）／科技法規總論（一）」）只在「／」後換行 */}
        <Segmented text={course.name} at={/(?<=／)/} />
      </h4>
      {/* 視覺上置於標題之上；DOM 順序保留標題優先，利於標題導覽 */}
      <p className="order-first mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Tag tone={course.type === "必修" ? "brand" : "titanium"}>
          {course.type}
        </Tag>
        {course.credits ? (
          <span className="text-sm text-slate-600 tabular-nums">
            {course.credits} 學分
          </span>
        ) : null}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-pretty text-slate-700">
        {course.description}
      </p>
      <div className="mt-auto pt-6">
        <span className="sr-only">關鍵技術領域：</span>
        <ul role="list" className="flex flex-wrap gap-2">
          {course.tags.map((tag) => (
            <li key={tag}>
              <Tag tone="champagne">{tag}</Tag>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function Requirements() {
  return (
    <div
      id="requirements"
      role="region"
      aria-labelledby="requirements-title"
      className="mt-16 scroll-mt-12 overflow-hidden rounded-md border border-stroke lg:mt-20"
    >
      <div className="bg-brand-900 px-6 py-4 text-white sm:px-8 sm:py-5">
        <p
          lang="en"
          className="text-xs font-semibold tracking-[0.2em] text-champagne-300 uppercase"
        >
          {requirements.eyebrow}
        </p>
        <h3
          id="requirements-title"
          className="mt-1.5 text-xl leading-snug font-semibold tracking-[0.01em] sm:text-2xl"
        >
          {requirements.title}
        </h3>
      </div>

      {/* gap-px 透出底色，形成細線分隔（單欄、雙欄、四欄皆適用） */}
      <dl className="grid gap-px bg-stroke sm:grid-cols-2 lg:grid-cols-4">
        {requirements.items.map((item) => (
          <div key={item.label} className="flex flex-col bg-white p-6 sm:p-7">
            <dt className="text-sm text-slate-600">{item.label}</dt>
            <dd className="mt-2 text-2xl leading-tight font-semibold tracking-[0.01em] text-brand-950 tabular-nums lg:text-xl xl:text-2xl">
              <Segmented text={item.value} at={/(?=（)/} />
            </dd>
            <dd className="mt-3 text-sm leading-relaxed text-pretty text-slate-600">
              {item.detail}
            </dd>
          </div>
        ))}
      </dl>

      <ul
        role="list"
        className="flex flex-wrap gap-x-8 border-t border-stroke bg-surface px-6 py-1 sm:px-8"
      >
        {requirementLinks.map((link) => (
          <li key={link.href}>
            <TextLink href={link.href} external={link.external}>
              {link.label}
            </TextLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * 將字串依語意斷點切成 inline-block 片段：換行只發生在片段之間，
 * 避免中文長字串被拆出單字孤行；片段過長時仍會在內部自然換行，不致溢出。
 */
function Segmented({ text, at }: { text: string; at: RegExp }) {
  return text.split(at).map((part, index) => (
    <span key={`${index}-${part}`} className="inline-block">
      {part}
    </span>
  ));
}

type TextLinkProps = {
  href: string;
  /** 外部網站或檔案：另開新視窗並以 ↗ 標示 */
  external?: boolean;
  className?: string;
  children: ReactNode;
};

const textLinkClass =
  "group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline";

/** 箭頭連結：站內頁面以 next/link 同頁開啟（→），外部連結另開新視窗（↗） */
function TextLink({ href, external = false, className, children }: TextLinkProps) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(textLinkClass, className)}
      >
        {children}
        <ArrowUpRight
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        />
        <span className="sr-only">（另開新視窗）</span>
      </a>
    );
  }

  return (
    <Link href={href} className={cn(textLinkClass, className)}>
      {children}
      <ArrowRight
        aria-hidden="true"
        className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}
