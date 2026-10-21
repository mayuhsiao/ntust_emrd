import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { DeferredPosterVideo } from "@/components/site/DeferredPosterVideo";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { community, type CommunityItem } from "@/content/home";
import { photos, type PhotoKey } from "@/content/photos";
import { withBasePath } from "@/lib/basePath";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/**
 * 校友與同儕網絡短片（15 秒，無音軌）：由 scripts/render_alumni_film.py 輸出至 public/videos/。
 * 子路徑部署（GitHub Pages 預覽）時 <video> 的原始字串網址不會自動加上 basePath，須經 withBasePath()。
 */
const film = {
  src: withBasePath("/videos/emrd-alumni-15s.mp4"),
  poster: withBasePath("/videos/emrd-alumni-poster.jpg"),
  width: 1920,
  height: 1080,
  size: "6.5 MB",
  titleId: "community-film-title",
  noteId: "community-film-note",
} as const;

/** 影片文字說明（WCAG 1.2.1 無聲預錄影片的文字替代）；畫面文字與 render_alumni_film.py 一致 */
const filmScenes: ReadonlyArray<{ time: string; label: string; body: ReactNode }> = [
  {
    time: "0–3 秒",
    label: "同窗",
    body: "一張戶外合照中，數十位身穿藍色上衣的校友在草地上同時跳起、高舉雙手。鏡頭緩緩推近，色調由暖色轉為臺科大藍，一道香檳金光痕沿著人群上方的樹梢線劃過。",
  },
  {
    time: "3–8 秒",
    label: "連結",
    body: "鏡頭拉遠，合照成為深藍星空中漂浮的相片卡之一；金色連線逐一點亮其他活動照片，照片由藍色單色轉為全彩，串成同儕網絡。八張相片卡的標籤為「戶外活動」「校友聚餐」「校友路跑」「臺科大 50 週年」「課堂學習」「家庭日」「EMRD 10 週年」「運動大會」。",
  },
  {
    time: "8–12 秒",
    label: "匯聚",
    body: (
      <>
        八張相片卡環繞成星座，中央光核凝聚為臺科大校徽，下方浮現標語「一屆同窗，一生夥伴」與英文副標「
        <span lang="en">ONE COHORT · PARTNERS FOR LIFE</span>」。
      </>
    ),
  },
  {
    time: "12–15 秒",
    label: "片尾",
    body: (
      <>
        光芒擴散為白底片尾卡：臺科大校徽與「國立臺灣科技大學」標準字（
        <span lang="en">NATIONAL TAIWAN UNIVERSITY OF SCIENCE AND TECHNOLOGY</span>
        ）、「<span lang="en">NTUST EMRD</span>」、一道香檳金細線、標語「研發之路，同行致遠」，以及「高階科技研發碩士在職專班　校友與同儕網絡」。
      </>
    ),
  },
];

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

        <CommunityFilm />

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-6 lg:mt-14 lg:gap-6">
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

/**
 * 精選短片：不自動播放（使用者按下播放才下載影片），preload="none"；
 * 封面（約 280 KB）由 DeferredPosterVideo 在捲近影片時才載入，不與首屏圖片搶頻寬；
 * 外框以 aspect-video 預留 16:9 空間，避免版面位移。影片無音軌，以下方 <details> 提供文字說明。
 */
function CommunityFilm() {
  return (
    <figure
      aria-labelledby={film.titleId}
      className="mt-12 grid items-start gap-6 lg:mt-16 lg:grid-cols-12 lg:gap-x-10"
    >
      <div className="relative aspect-video overflow-hidden rounded-md bg-brand-950 lg:col-span-7">
        <DeferredPosterVideo
          controls
          playsInline
          preload="none"
          width={film.width}
          height={film.height}
          poster={film.poster}
          src={film.src}
          aria-labelledby={film.titleId}
          aria-describedby={film.noteId}
          className="absolute inset-0 size-full object-cover"
        >
          <p className="p-4 text-sm text-white">
            您的瀏覽器無法播放此影片，請
            <a href={film.src} className="underline underline-offset-4">
              下載影片（MP4，{film.size}）
            </a>
            。
          </p>
        </DeferredPosterVideo>
      </div>

      <figcaption className="min-w-0 lg:col-span-5 lg:pt-1">
        <p
          lang="en"
          className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase"
        >
          <span aria-hidden="true" className="h-px w-8 bg-champagne-500/70" />
          Alumni Film
        </p>
        <h3
          id={film.titleId}
          className="mt-3 text-2xl leading-snug font-semibold tracking-[0.01em] text-balance text-brand-950 lg:text-[1.75rem]"
        >
          一屆同窗，一生夥伴
          <span className="sr-only">｜</span>
          <span className="mt-1.5 block text-base font-medium tracking-normal text-slate-600 lg:text-lg">
            EMRD 校友與同儕網絡（15 秒）
          </span>
        </h3>
        <p id={film.noteId} className="mt-4 text-base leading-relaxed text-pretty text-slate-600">
          從一張戶外合照出發，八場活動的照片彼此相連，匯聚成畢業後依然同行的校友網絡。影片無聲音與旁白，畫面內容請見下方「影片文字說明」。
        </p>

        <details className="group/details mt-6 rounded-md border border-stroke bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-4 py-2 text-[0.9375rem] font-medium text-brand-950 [&::-webkit-details-marker]:hidden">
            <span className="flex-1">影片文字說明</span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 shrink-0 text-brand-600 transition-transform duration-200 group-open/details:rotate-180"
            />
          </summary>
          <div className="border-t border-stroke px-4 py-4 text-sm leading-relaxed text-slate-700">
            <ol className="space-y-3">
              {filmScenes.map((scene) => (
                <li key={scene.time}>
                  <span className="font-semibold text-brand-950">
                    {scene.time}｜{scene.label}：
                  </span>
                  {scene.body}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-slate-600">全片無聲音、無旁白；畫面不出現任何個人姓名。</p>
          </div>
        </details>
      </figcaption>
    </figure>
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
