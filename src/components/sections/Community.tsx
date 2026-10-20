import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { community, type CommunityItem } from "@/content/home";
import { photos, type PhotoKey } from "@/content/photos";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

type Tier = "feature" | "prominent" | "base";

type TierStyle = {
  /** 格線位置：手機 2 欄、md 6 欄、lg 6 欄（左半大圖跨兩列） */
  cell: string;
  media: string;
  caption: string;
  /** 依 Container 內距與格線間距換算的實際顯示寬度 */
  sizes: string;
};

const tierStyles: Record<Tier, TierStyle> = {
  feature: {
    cell: "col-span-2 md:col-span-3 lg:row-span-2",
    // lg 以上撐滿右欄高度，左右兩側底緣對齊
    media: "aspect-[4/3] lg:aspect-auto lg:min-h-80 lg:flex-1",
    caption: "mt-3 text-base lg:text-lg",
    sizes:
      "(min-width: 1280px) 596px, (min-width: 1024px) calc(50vw - 44px), (min-width: 768px) calc(50vw - 32px), (min-width: 640px) calc(100vw - 48px), calc(100vw - 32px)",
  },
  prominent: {
    cell: "md:col-span-3",
    media: "aspect-[4/3] lg:aspect-video",
    caption: "mt-2.5 text-sm md:mt-3 md:text-base lg:text-lg",
    sizes:
      "(min-width: 1280px) 596px, (min-width: 1024px) calc(50vw - 44px), (min-width: 640px) calc(50vw - 32px), calc(50vw - 24px)",
  },
  base: {
    cell: "md:col-span-2 lg:col-span-1",
    media: "aspect-[4/3]",
    caption: "mt-2.5 text-sm",
    sizes:
      "(min-width: 1280px) 183px, (min-width: 1024px) calc(16.67vw - 31px), (min-width: 768px) calc(33.33vw - 27px), (min-width: 640px) calc(50vw - 32px), calc(50vw - 24px)",
  },
};

/**
 * 右上 16:9 卡片使用的照片（2048px 高解析度）；其餘排入下方小卡，
 * 1280px 的家庭日照片因此維持小尺寸顯示。
 */
const PROMINENT_PHOTO: PhotoKey = "orientationCamp";

const [featureItem, ...otherItems] = community.items;
const prominentItem =
  otherItems.find((item) => item.photo === PROMINENT_PHOTO) ?? otherItems[0];

/** DOM 順序即閱讀順序，也讓 CSS Grid 自動排版落在正確位置 */
const mosaic: ReadonlyArray<{ item: CommunityItem; tier: Tier }> = [
  { item: featureItem, tier: "feature" },
  { item: prominentItem, tier: "prominent" },
  ...otherItems
    .filter((item) => item !== prominentItem)
    .map((item) => ({ item, tier: "base" as const })),
];

export function Community() {
  return (
    <Section id="community" tone="subtle" aria-labelledby="community-title">
      <Container>
        <SectionHeading
          id="community-title"
          eyebrow={community.eyebrow}
          title={community.title}
          description={community.description}
        />

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-6 lg:mt-16 lg:gap-6">
          {mosaic.map(({ item, tier }) => (
            <MosaicCard key={item.photo} item={item} tier={tier} />
          ))}
        </div>

        <ul
          aria-label="更多社群與校友資訊"
          className="mt-8 flex flex-wrap gap-x-8 gap-y-1 lg:mt-10"
        >
          {community.links.map((link) => (
            <li key={link.routeKey}>
              <Link
                href={site.routes[link.routeKey]}
                className="group inline-flex min-h-11 items-center gap-2 rounded-sm text-base font-semibold text-brand-700 transition-colors duration-200 hover:text-brand-800"
              >
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                />
                <span className="underline-offset-4 group-hover:underline">
                  {link.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}

function MosaicCard({ item, tier }: { item: CommunityItem; tier: Tier }) {
  const photo = photos[item.photo];
  const style = tierStyles[tier];

  return (
    <figure className={cn("group flex min-w-0 flex-col", style.cell)}>
      <div
        className={cn(
          "relative overflow-hidden rounded-md bg-brand-100",
          style.media,
        )}
      >
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          sizes={style.sizes}
          placeholder="blur"
          className="object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.02]"
          style={{ objectPosition: photo.position }}
        />
        {/* 內容類型標籤僅供視覺掃讀，文字另併入 figcaption 供輔助科技讀取 */}
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 rounded-br-md bg-brand-900 px-2.5 py-1 text-xs font-medium text-white"
        >
          {item.chip}
        </span>
      </div>
      <figcaption
        className={cn(
          "leading-snug font-semibold tracking-[0.01em] text-balance text-brand-950",
          style.caption,
        )}
      >
        <span className="sr-only">{item.chip}：</span>
        {item.title}
      </figcaption>
    </figure>
  );
}
