import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { faculty, type FacultyHighlight, type Leader } from "@/content/home";
import { site } from "@/lib/site";

const rosterLinks = [
  { label: "執行長與副執行長", href: site.routes.executives },
  { label: "校內師資", href: site.routes.facultyInternal },
  { label: "外校與業界師資", href: site.routes.facultyIndustry },
  { label: "歷年演講嘉賓", href: site.routes.speakers },
] as const;

/** 將「30+」拆為數字與後綴，後綴以香檳金點綴 */
function splitMetric(value: string) {
  const match = /^([\d.,]+)(.*)$/.exec(value);
  return match
    ? { number: match[1], suffix: match[2] }
    : { number: value, suffix: "" };
}

export function Faculty() {
  return (
    <Section id="faculty" tone="white" aria-labelledby="faculty-title">
      <Container>
        <SectionHeading
          id="faculty-title"
          eyebrow={faculty.eyebrow}
          title={faculty.title}
          description={faculty.description}
        />

        <div className="mt-12 grid gap-6 lg:mt-16 lg:grid-cols-12">
          {/* lg 以上兩張主管卡改為上下堆疊的橫式卡，與右側數據面板等高 */}
          <ul className="grid gap-6 sm:grid-cols-2 lg:col-span-7 lg:grid-cols-1">
            {faculty.leaders.map((leader) => (
              <LeaderCard key={leader.name} leader={leader} />
            ))}
          </ul>
          <FacultyMetrics />
        </div>

        <div className="mt-16 lg:mt-20">
          <h3 className="text-xl font-semibold tracking-[0.01em] text-balance text-brand-950 sm:text-2xl">
            業界與跨域師資精選
          </h3>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:mt-8 lg:grid-cols-3 lg:gap-6">
            {faculty.highlights.map((person) => (
              <HighlightCard key={person.name} person={person} />
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-stroke pt-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs leading-relaxed text-slate-600">
            {faculty.footnote}
          </p>
          <ul aria-label="完整師資名單" className="flex flex-wrap gap-x-6">
            {rosterLinks.map((link) => (
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

function LeaderCard({ leader }: { leader: Leader }) {
  return (
    <li className="flex flex-col rounded-md border border-stroke bg-white p-7 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-center lg:gap-8">
      <div className="mb-6 flex items-center gap-4 lg:mb-0">
        <span
          aria-hidden="true"
          className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-50 text-xl font-semibold text-brand-800 ring-1 ring-brand-100"
        >
          {leader.name.charAt(0)}
        </span>
        <div className="min-w-0">
          <h3>
            <span className="block text-xs font-semibold tracking-[0.2em] text-champagne-700">
              {leader.role}
            </span>{" "}
            <span className="mt-1.5 block text-xl font-semibold tracking-[0.01em] text-brand-950">
              {leader.name}
            </span>
          </h3>
          <p lang="en" className="mt-0.5 text-sm text-slate-600">
            {leader.englishName}
          </p>
        </div>
      </div>

      {/* 學經歷以空白為斷點（break-keep），避免校名、學位被拆成單字孤行 */}
      <dl className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2.5 border-t border-stroke pt-5 text-sm leading-relaxed lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
        <dt className="text-slate-600">現職</dt>
        <dd className="break-keep wrap-break-word text-slate-700">
          {leader.title}
        </dd>
        <dt className="text-slate-600">學歷</dt>
        <dd className="break-keep wrap-break-word text-slate-700">
          {leader.education}
        </dd>
      </dl>
    </li>
  );
}

function FacultyMetrics() {
  return (
    <div className="relative overflow-hidden rounded-md bg-brand-900 p-8 text-white lg:col-span-5">
      {/* 右上角香檳金角三角，呼應品牌相框 */}
      <span
        aria-hidden="true"
        className="absolute top-0 right-0 size-10 bg-champagne-300 [clip-path:polygon(0_0,100%_0,100%_100%)]"
      />

      <p
        lang="en"
        className="text-xs font-semibold tracking-[0.2em] text-champagne-300 uppercase"
      >
        Faculty at a Glance
      </p>

      <dl className="mt-6 grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y">
        {faculty.metrics.map((metric) => {
          const { number, suffix } = splitMetric(metric.value);
          return (
            <div
              key={metric.label}
              className="flex items-center gap-5 py-5 first:pt-0 last:pb-0 sm:flex-col sm:items-start sm:gap-2 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0 lg:flex-row lg:items-center lg:gap-6 lg:px-0 lg:py-5"
            >
              <dt className="text-sm leading-relaxed text-balance text-brand-100/85 lg:text-base">
                {metric.label}
              </dt>
              <dd className="order-first w-24 shrink-0 text-5xl leading-none font-light tracking-tight text-white tabular-nums sm:w-auto lg:w-28">
                {number}
                {suffix ? (
                  <span className="text-champagne-300">{suffix}</span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function HighlightCard({ person }: { person: FacultyHighlight }) {
  return (
    <li className="flex flex-col rounded-md border border-stroke bg-white p-6 transition-colors duration-200 hover:border-brand-300">
      <h4 className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-lg font-semibold text-brand-950">
          {person.name}
        </span>{" "}
        <span className="text-sm font-medium text-slate-700">
          {person.position}
        </span>
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
        {person.organization}
      </p>
      <p className="mt-auto pt-5">
        <Tag tone="brand">
          <span className="sr-only">授課：</span>
          {person.course}
        </Tag>
      </p>
    </li>
  );
}
