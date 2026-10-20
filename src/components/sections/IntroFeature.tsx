import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Container } from "@/components/ui/Container";
import { FramedPhoto } from "@/components/ui/FramedPhoto";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { intro } from "@/content/home";
import { photos } from "@/content/photos";
import { site } from "@/lib/site";

const TITLE_ID = "intro-title";

/**
 * 於「的、與」之後提供斷行點；搭配 break-keep，
 * 標題在窄欄換行時落在語意邊界，不會把「技術長」等詞拆開。
 */
function withPhraseBreaks(text: string): ReactNode {
  return text.split(/(?<=[的與])/u).map((phrase, index) => (
    <Fragment key={index}>
      {index > 0 ? <wbr /> : null}
      {phrase}
    </Fragment>
  ));
}

/** 專班簡介：Berkeley 式圖文區塊，左側品牌相框照片、右側特色敘述。 */
export function IntroFeature() {
  return (
    <Section id="about" aria-labelledby={TITLE_ID}>
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-x-12">
          <FramedPhoto
            photo={photos[intro.photo]}
            sizes="(min-width: 1280px) 544px, (min-width: 1024px) 42vw, 100vw"
            aspect="aspect-[4/3] md:aspect-video lg:aspect-[4/3]"
            className="lg:col-span-6"
          />

          <div className="lg:col-span-5 lg:col-start-8">
            <SectionHeading
              id={TITLE_ID}
              eyebrow={intro.eyebrow}
              title={
                <span className="break-keep wrap-break-word">
                  {withPhraseBreaks(intro.title)}
                </span>
              }
            />

            <div className="mt-6 space-y-4 text-base leading-relaxed text-pretty text-slate-700 sm:text-lg">
              {intro.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <ul className="mt-8 space-y-3 border-t border-stroke pt-6">
              {intro.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-base leading-relaxed text-slate-700"
                >
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-1 size-5 shrink-0 text-brand-600"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 text-pretty">{point}</span>
                </li>
              ))}
            </ul>

            <Link
              href={site.routes[intro.link.routeKey]}
              className="group mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-base font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline"
            >
              {intro.link.label}
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>
        </div>
      </Container>
    </Section>
  );
}
