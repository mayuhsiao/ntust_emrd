import type { LucideIcon } from "lucide-react";
import { CalendarClock, Check, Cpu, Network, Scale } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Tag } from "@/components/ui/Tag";
import { bento, type BentoCard, type BentoIcon } from "@/content/home";
import { photos } from "@/content/photos";
import { cn } from "@/lib/cn";

const TITLE_ID = "features-title";

const icons: Record<BentoIcon, LucideIcon> = {
  cpu: Cpu,
  scale: Scale,
  calendar: CalendarClock,
  network: Network,
};

/** 依卡片實際寬度（max-w-7xl 內容寬 1216px、三欄 gap-6）估算的 sizes */
const photoSizes: Record<BentoCard["span"], string> = {
  1: "(min-width: 1280px) 390px, (min-width: 1024px) 31vw, (min-width: 768px) 48vw, 100vw",
  2: "(min-width: 1280px) 800px, (min-width: 1024px) 64vw, 100vw",
};

/**
 * 卡片文字僅於空白與標點處換行（break-keep），避免詞語被拆開；wrap-break-word 防止意外溢出。
 * 重點條列的子句較長，手機欄寬不足以容納，故 sm 起才保留詞語完整。
 */
const phraseText = "text-balance break-keep wrap-break-word";
const pointText = "text-pretty wrap-break-word sm:text-balance sm:break-keep";

/* ------------------------------------------------------------------ */
/* 卡片內容區塊                                                         */
/* ------------------------------------------------------------------ */

function CardHeader({ icon, index }: { icon: BentoIcon; index: number }) {
  const Icon = icons[icon];
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-md bg-white/5 text-champagne-300 ring-1 ring-white/20 ring-inset">
        <Icon aria-hidden="true" className="size-5" strokeWidth={1.5} />
      </span>
      <span
        aria-hidden="true"
        className="pt-1 text-xs font-medium tracking-[0.2em] text-brand-200 tabular-nums"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
    </div>
  );
}

function CardIntro({
  card,
  titleId,
  className,
}: {
  card: BentoCard;
  titleId: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p
        lang="en"
        className="text-xs font-semibold tracking-[0.18em] text-champagne-300 uppercase"
      >
        {card.eyebrow}
      </p>
      <h3
        id={titleId}
        className={cn(
          "mt-3 text-xl leading-snug font-semibold tracking-[0.01em] text-white lg:text-2xl",
          phraseText,
        )}
      >
        {card.title}
      </h3>
      <p
        className={cn(
          "mt-3 text-base leading-relaxed text-brand-100/90",
          phraseText,
        )}
      >
        {card.description}
      </p>
    </div>
  );
}

function PointList({
  points,
  className,
}: {
  points: readonly string[];
  className?: string;
}) {
  return (
    <ul className={cn("space-y-3", className)}>
      {points.map((point) => (
        <li
          key={point}
          className="flex gap-3 text-sm leading-relaxed text-white/85"
        >
          <Check
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-champagne-300"
            strokeWidth={2}
          />
          <span className={cn("min-w-0", pointText)}>{point}</span>
        </li>
      ))}
    </ul>
  );
}

function TagList({
  tags,
  className,
}: {
  tags: readonly string[];
  className?: string;
}) {
  return (
    <ul aria-label="關鍵領域" className={cn("flex flex-wrap gap-2", className)}>
      {tags.map((tag, index) => (
        <li key={tag}>
          <Tag tone={index === 0 ? "champagne-inverted" : "inverted"}>{tag}</Tag>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* 照片紋理卡片                                                         */
/* ------------------------------------------------------------------ */

function FeatureCard({
  card,
  index,
  isLast,
}: {
  card: BentoCard;
  index: number;
  isLast: boolean;
}) {
  const photo = photos[card.photo];
  const titleId = `${card.id}-title`;
  const wide = card.span === 2;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "group relative isolate flex min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-md p-7 text-white sm:p-8 lg:min-h-[20rem] lg:p-10",
        wide && "md:col-span-2",
      )}
    >
      {/* 照片僅作為背景紋理，資訊由文字傳達，故 alt 留空 */}
      <Image
        src={photo.src}
        alt=""
        fill
        sizes={photoSizes[card.span]}
        placeholder="blur"
        className="-z-20 object-cover duration-500 ease-out motion-safe:transition-transform motion-safe:group-hover:scale-[1.03]"
        style={{ objectPosition: photo.position }}
      />
      {/* 85% 以上的臺科大藍遮罩確保白字對比；末張卡改用 brand-900 與前列區隔 */}
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-0 -z-10",
          isLast ? "bg-brand-900/90" : "bg-brand-950/85",
        )}
      />

      <CardHeader icon={card.icon} index={index} />

      {wide ? (
        // 寬卡：md 與 xl 左側標題敘述、右側重點與標籤；lg 寬卡僅約 620px，與手機同為直排，標籤貼齊卡底
        <div className="mt-8 flex flex-1 flex-col gap-6 md:grid md:grid-cols-2 md:gap-10 lg:flex lg:gap-6 xl:grid xl:gap-12">
          <CardIntro card={card} titleId={titleId} />
          <div className="flex min-w-0 flex-1 flex-col">
            <PointList points={card.points} />
            <TagList tags={card.tags} className="mt-auto pt-8" />
          </div>
        </div>
      ) : (
        <>
          <CardIntro card={card} titleId={titleId} className="mt-8" />
          <PointList points={card.points} className="mt-6" />
          <TagList tags={card.tags} className="mt-auto pt-8" />
        </>
      )}
    </article>
  );
}

/** 核心優勢：md 兩欄、lg 三欄的 Bento 排版（欄寬由內容資料 span 決定），卡片為照片紋理＋深藍遮罩。 */
export function BentoGrid() {
  const lastIndex = bento.cards.length - 1;

  return (
    <Section id="features" tone="subtle" aria-labelledby={TITLE_ID}>
      <Container>
        <SectionHeading
          id={TITLE_ID}
          eyebrow={bento.eyebrow}
          title={bento.title}
          description={bento.description}
        />
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
          {bento.cards.map((card, index) => (
            <FeatureCard
              key={card.id}
              card={card}
              index={index}
              isLast={index === lastIndex}
            />
          ))}
        </div>
      </Container>
    </Section>
  );
}
