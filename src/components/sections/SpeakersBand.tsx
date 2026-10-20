import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Mic, Quote } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { bento, speakers, type Talk } from "@/content/home";
import { photos } from "@/content/photos";
import { site } from "@/lib/site";

/** 全為 ASCII 的講題視為英文，交由螢幕閱讀器以英文發音 */
const isEnglish = (text: string) => /^[\x20-\x7E]+$/.test(text);

/**
 * 技術長講座深藍影像帶（參考 UniMelb 生態圈／媒體區塊）：
 * 左欄講題清單，右欄講座現場照片與業界推薦語，底列為歷屆講座嘉賓企業。
 */
export function SpeakersBand() {
  const photo = photos[speakers.photo];
  const { quote } = speakers;

  return (
    <Section id="lectures" tone="navy" aria-labelledby="speakers-title">
      <Container>
        {/* 1024–1279px 文字欄放寬為 6/12，避免標題在詞中斷行 */}
        <div className="grid items-start gap-10 lg:grid-cols-12 lg:gap-x-12">
          <div className="lg:col-span-6 xl:col-span-5">
            <SectionHeading
              id="speakers-title"
              inverted
              eyebrow={speakers.eyebrow}
              title={<PhraseBreaks text={speakers.title} />}
              description={speakers.description}
            />

            <ul
              aria-label="講題選錄"
              className="mt-10 divide-y divide-white/10 border-y border-white/10"
            >
              {speakers.talks.map((talk) => (
                <TalkItem key={talk.topic} talk={talk} />
              ))}
            </ul>

            <Link
              href={site.routes[speakers.link.routeKey]}
              className="group mt-6 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-champagne-200 underline-offset-4 transition-colors duration-200 hover:text-champagne-100 hover:underline focus-visible:outline-champagne-200"
            >
              {speakers.link.label}
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </div>

          <div className="flex flex-col gap-8 lg:col-span-6 lg:gap-10 xl:col-span-7">
            {/* 講座現場照片：不標註講者姓名，亦不疊放推薦語，避免誤認為照片人物所述 */}
            <figure className="relative aspect-[3/2] overflow-hidden rounded-md bg-brand-900">
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                sizes="(min-width: 1280px) 690px, (min-width: 1024px) 46vw, 100vw"
                placeholder="blur"
                className="object-cover"
                style={{ objectPosition: photo.position }}
              />
              <figcaption className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-sm bg-brand-900 px-2.5 py-1 text-xs font-medium text-white sm:bottom-4 sm:left-4">
                <Mic aria-hidden="true" className="size-3.5 text-brand-300" />
                技術長講座現場
              </figcaption>
            </figure>

            <figure className="grid gap-4 rounded-md bg-white p-6 text-brand-950 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6 lg:p-8">
              <Quote
                aria-hidden="true"
                className="size-9 fill-champagne-300 text-champagne-500 lg:size-10"
                strokeWidth={1.25}
              />
              <div>
                <blockquote>
                  <p className="text-lg leading-relaxed text-pretty">
                    {quote.text}
                  </p>
                </blockquote>
                <figcaption className="mt-5 text-sm leading-relaxed text-slate-600">
                  —{" "}
                  <span className="font-semibold text-brand-950">
                    {quote.name}
                  </span>
                  ，<span className="whitespace-nowrap">{quote.title}</span>
                </figcaption>
              </div>
            </figure>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-8 lg:mt-16 lg:flex-row lg:items-center lg:gap-8">
          <p
            id="speaker-companies-label"
            className="shrink-0 text-sm text-brand-100/70"
          >
            歷屆講座嘉賓企業
          </p>
          <ul
            aria-labelledby="speaker-companies-label"
            className="flex flex-wrap gap-2"
          >
            {bento.speakerCompanies.map((company) => (
              <li key={company}>
                <Tag tone="inverted">{company}</Tag>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}

/** 以全形冒號為詞組邊界，各詞組為 inline-block，讓標題優先在冒號後換行 */
function PhraseBreaks({ text }: { text: string }) {
  const phrases = text.split("：");
  return phrases.map((phrase, index) => (
    <span key={phrase} className="inline-block">
      {index < phrases.length - 1 ? `${phrase}：` : phrase}
    </span>
  ));
}

function TalkItem({ talk }: { talk: Talk }) {
  return (
    <li className="py-5">
      <p
        lang={isEnglish(talk.topic) ? "en" : undefined}
        className="text-base leading-snug font-medium text-balance text-white lg:text-lg"
      >
        {talk.topic}
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-brand-100/70 tabular-nums">
        <span className="whitespace-nowrap">{talk.speaker}</span>
        <span aria-hidden="true">·</span>
        <span className="whitespace-nowrap">{talk.organization}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={String(talk.year)}>{talk.year}</time>
      </p>
    </li>
  );
}
