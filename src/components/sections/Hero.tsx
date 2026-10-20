import { existsSync } from "node:fs";
import path from "node:path";
import { ArrowRight, BadgeCheck, CalendarDays, Layers } from "lucide-react";
import Image from "next/image";
import { Fragment } from "react";
import { HeroBackdrop } from "@/components/sections/HeroBackdrop";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { hero } from "@/content/home";
import { photos } from "@/content/photos";

/*
 * Next.js 只提供 public/ 內的靜態檔，影片請放在 public/videos/hero-bg.mp4。
 * 於模組載入（建置）時檢查；檔案不存在就改用幾何點陣動態，避免多一次 404 請求。
 */
const videoSrc = existsSync(
  path.join(process.cwd(), "public", "videos", "hero-bg.mp4"),
)
  ? "/videos/hero-bg.mp4"
  : undefined;

const INTAKE_TITLE_ID = "hero-intake-title";

/*
 * 桌機版分割版面：文字欄寬 --hero-text，媒體區自文字欄右側（加 2.5rem 間距）延伸至視窗右緣。
 * 媒體區左緣以 Container 的左內距（max(2rem, (100% − 80rem) / 2 + 2rem)）推算，
 * 大螢幕置中時文字欄不會被媒體區壓縮。
 */
const MEDIA_PANE_DESKTOP =
  "lg:absolute lg:inset-y-0 lg:right-0 lg:left-[calc(max(2rem,(100%_-_80rem)/2_+_2rem)_+_var(--hero-text)_+_2.5rem)] lg:aspect-auto lg:w-auto";

export function Hero() {
  const { heroStill } = photos;

  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate overflow-hidden bg-brand-950 text-white lg:flex lg:min-h-[min(calc(100dvh_-_7.5rem),46rem)] lg:items-center lg:[--hero-text:min(31rem,40vw)]"
    >
      <Container className="relative">
        <div className="py-16 sm:py-20 lg:w-(--hero-text) lg:py-14">
          <p className="inline-flex items-center gap-2 rounded-sm bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-champagne-200 ring-1 ring-white/15 sm:text-sm">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-champagne-300"
            />
            {hero.badge.map((item, index) => (
              <Fragment key={item}>
                {index > 0 ? (
                  <>
                    <span aria-hidden="true" className="text-champagne-300/70">
                      ·
                    </span>
                    <span className="sr-only">、</span>
                  </>
                ) : null}
                <span>{item}</span>
              </Fragment>
            ))}
          </p>

          {/* 字級依欄寬計算：第二行 9 字在 360px 與桌機文字欄內皆不換行 */}
          <h1
            id="hero-title"
            className="mt-6 text-[2rem] leading-[1.15] font-semibold tracking-[0.01em] text-balance min-[25rem]:text-4xl sm:text-5xl lg:text-[2.5rem] xl:text-[3.25rem]"
          >
            <span className="block text-white">{hero.titleLines[0]}</span>
            <span className="block text-brand-200">{hero.titleLines[1]}</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-pretty text-brand-100/85 sm:text-lg">
            {hero.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink
              href={hero.primaryCta.href}
              size="lg"
              variant="accent"
              className="w-full sm:w-auto"
            >
              {hero.primaryCta.label}
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5"
              />
            </ButtonLink>
            <ButtonLink
              href={hero.secondaryCta.href}
              size="lg"
              variant="outline-light"
              className="w-full sm:w-auto"
            >
              <Layers aria-hidden="true" className="size-4 text-brand-300" />
              {hero.secondaryCta.label}
            </ButtonLink>
          </div>

          <IntakeSummary />

          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-brand-100/80">
            {hero.credentials.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <BadgeCheck
                  aria-hidden="true"
                  className="size-4 shrink-0 text-champagne-300"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Container>

      {/* 媒體區：行動版位於文字下方滿版，桌機版貼齊右緣 */}
      <div
        className={`relative aspect-[4/3] w-full overflow-hidden bg-brand-950 sm:aspect-video ${MEDIA_PANE_DESKTOP}`}
      >
        <HeroBackdrop videoSrc={videoSrc} objectPosition={heroStill.position}>
          {/* 桌機版媒體區高約 46rem，16:9 畫面以 cover 裁切後實際寬約 1300–1500px */}
          <Image
            src={heroStill.src}
            alt=""
            fill
            loading="eager"
            sizes="(min-width: 1024px) 1400px, (min-width: 640px) 100vw, 134vw"
            placeholder="blur"
            className="object-cover"
            style={{ objectPosition: heroStill.position }}
          />
        </HeroBackdrop>
      </div>
    </section>
  );
}

/** 下一屆招生摘要：細框資訊列，取代舊版毛玻璃卡片 */
function IntakeSummary() {
  const { intake } = hero;

  return (
    <div
      role="group"
      aria-labelledby={INTAKE_TITLE_ID}
      className="mt-8 rounded-md border border-white/15 px-4 pt-2 pb-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6">
        <p
          id={INTAKE_TITLE_ID}
          className="flex min-h-11 items-center gap-2 text-sm font-semibold text-white"
        >
          <CalendarDays
            aria-hidden="true"
            className="size-4 shrink-0 text-champagne-300"
          />
          {intake.title}
        </p>
        <a
          href="#admissions"
          className="group inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-champagne-200 underline-offset-4 hover:underline focus-visible:outline-champagne-200"
        >
          查看完整時程
          <ArrowRight
            aria-hidden="true"
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </a>
      </div>

      <dl className="mt-1 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/10 pt-4">
        {intake.items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs text-brand-100/80">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium whitespace-nowrap text-white tabular-nums">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-xs text-brand-100/70">{intake.note}</p>
    </div>
  );
}
