import Image from "next/image";
import { ArrowUpRight, CalendarCheck, Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { admissionsCta } from "@/content/home";
import { photos } from "@/content/photos";
import { site } from "@/lib/site";
import { keepDateTogether } from "@/lib/text";

const TITLE_ID = "admissions-cta-title";
const BROCHURE_NOTE_ID = "admissions-cta-brochure-note";


/**
 * 招生行動帶：畢業典禮照片＋臺科大深藍遮罩，左側重要日程、右側簡章與諮詢行動。
 * （參考 Berkeley MAS-E 的 Apply CTA panel 與 UniMelb 深色色帶）
 */
export function AdmissionsCta() {
  const photo = photos[admissionsCta.photo];

  return (
    <section
      aria-labelledby={TITLE_ID}
      className="relative isolate overflow-hidden bg-brand-950 text-white"
    >
      {/* 背景照片寬度上限為原檔 2048px；更寬的螢幕左緣以遮罩淡入深藍底 */}
      <div className="absolute inset-y-0 right-0 -z-20 w-full max-w-[2048px] min-[2048px]:[mask-image:linear-gradient(to_right,transparent,black_16rem)]">
        <Image
          src={photo.src}
          alt=""
          fill
          sizes="(min-width: 2048px) 2048px, 100vw"
          placeholder="blur"
          className="object-cover"
          style={{ objectPosition: photo.position }}
        />
      </div>
      {/* 單欄版面文字橫跨整張照片，改用均勻遮罩確保對比 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-brand-950/90 lg:bg-transparent lg:bg-linear-to-r lg:from-brand-950/95 lg:via-brand-950/90 lg:to-brand-900/80"
      />
      {/* 左緣香檳金斜角：寬度不超過 Container 外側留白，不與文字重疊 */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 -z-10 hidden w-[clamp(1rem,calc((100vw-80rem)/2),6rem)] bg-champagne-300/80 [clip-path:polygon(0_0,100%_0,0_100%)] md:block"
      />

      <Container className="grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-12 lg:py-24">
        <div className="lg:col-span-7">
          <p
            lang="en"
            className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-300 uppercase"
          >
            <span aria-hidden="true" className="h-px w-8 bg-champagne-300/70" />
            {admissionsCta.eyebrow}
          </p>
          {/* 手機版略縮字級，讓標題在 360px 寬仍維持單行、不從詞中斷開 */}
          <h2
            id={TITLE_ID}
            className="mt-4 text-[1.75rem] leading-tight font-semibold tracking-[0.01em] text-balance sm:text-4xl"
          >
            {admissionsCta.title}
          </h2>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-pretty text-brand-100/90 sm:text-lg">
            {admissionsCta.description}
          </p>
          <dl className="mt-8 grid border-t border-white/15 sm:grid-cols-3 sm:border-b lg:mt-10">
            {admissionsCta.dates.map((date) => (
              <div
                key={date.label}
                className="border-b border-white/15 py-4 sm:border-b-0 sm:border-l sm:px-5 sm:first:border-l-0 sm:first:pl-0"
              >
                <dt className="text-xs font-medium text-brand-100/80">
                  {date.label}
                </dt>
                <dd className="mt-1 text-base font-semibold text-balance text-white">
                  {keepDateTogether(date.value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 sm:items-start lg:col-span-4 lg:col-start-9 lg:grid-cols-1 lg:border-l lg:border-white/15 lg:py-2 lg:pl-10">
          <div>
            <ButtonLink
              href={site.links.brochurePdf}
              external
              variant="accent"
              size="lg"
              aria-describedby={BROCHURE_NOTE_ID}
              className="w-full"
            >
              <Download aria-hidden="true" className="size-4.5" />
              報考簡章下載 (PDF)
            </ButtonLink>
            <p
              id={BROCHURE_NOTE_ID}
              className="mt-2 text-xs leading-relaxed text-brand-100/80"
            >
              目前版本：{site.links.brochureLabel}
            </p>
          </div>
          <ButtonLink
            href={site.links.consultation}
            variant="outline-light"
            size="lg"
            className="w-full"
          >
            <CalendarCheck aria-hidden="true" className="size-4.5" />
            線上預約諮詢
          </ButtonLink>
          <a
            href={site.links.admissionsPortal}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex min-h-11 items-center gap-2 self-start justify-self-start rounded-sm text-sm font-semibold text-brand-100 transition-colors duration-200 hover:text-white focus-visible:outline-champagne-200 sm:col-span-2 lg:col-span-1"
          >
            <ArrowUpRight
              aria-hidden="true"
              className="size-4 shrink-0 text-champagne-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            />
            <span className="underline-offset-4 group-hover:underline">
              研教組招生資訊
            </span>
            <span className="sr-only">（另開新視窗）</span>
          </a>
        </div>
      </Container>
    </section>
  );
}
