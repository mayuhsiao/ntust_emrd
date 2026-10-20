import Image from "next/image";
import type { ReactNode } from "react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Download,
  GraduationCap,
} from "lucide-react";
import emrdSeal from "@/assets/emrd-seal.png";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/ui/Logo";
import { footerStatement, hero } from "@/content/home";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

type FooterLinkItem = {
  label: string;
  href: string;
  /** 外部網站：另開新視窗並以 ↗ 標示；站內頁面以 → 標示 */
  external?: boolean;
};

const mapLinks: readonly FooterLinkItem[] = [
  { label: "Google 地圖導航", href: site.links.googleMaps, external: true },
  { label: "臺科大校址圖", href: site.links.campusMap, external: true },
  { label: "校內配置圖", href: site.links.campusLayout, external: true },
];

const quickLinks: readonly FooterLinkItem[] = [
  { label: "最新公告", href: site.routes.news },
  { label: "招生資訊", href: site.routes.admissionsInfo },
  { label: "表單下載", href: site.routes.forms },
  { label: "法規", href: site.routes.rules },
  { label: "EMRD 校友薈萃堂", href: site.routes.alumniHall },
  { label: "聯絡資訊", href: site.routes.contact },
  { label: "網站導覽", href: site.routes.sitemap },
];

/** 快速連結下方、以細線分隔的校外網站 */
const relatedLinks: readonly FooterLinkItem[] = [
  { label: "研教組招生資訊", href: site.links.admissionsPortal, external: true },
  { label: "臺科大首頁", href: site.links.ntust, external: true },
];

const brochureTitle = `${site.links.brochureLabel}（PDF）`;
const consultationTitle = `以 E-mail 預約諮詢：${site.contact.email}`;

const headingClass = "text-sm font-semibold tracking-wide text-white";

const FOOTER_LABEL = "網站資訊與聯絡方式";
const QUICK_LINKS_LABEL = "快速連結";

/** 深藍底焦點框一律改用香檳金，維持足夠對比 */
const focusClass = "focus-visible:outline-champagne-200";

/** 以 ::after 向上下延伸點擊區至 44px 以上，不影響行距 */
const contactLinkClass = cn(
  "relative inline-block text-white underline decoration-white/35 underline-offset-4 transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-3 hover:decoration-white",
  focusClass,
);

const legalLinkClass = cn(
  "inline-flex min-h-11 items-center underline decoration-brand-100/35 underline-offset-4 transition-colors duration-200 hover:text-white hover:decoration-white",
  focusClass,
);

type FooterProps = {
  /**
   * 宣言帶是否顯示行動按鈕。首頁最後一個區塊（AdmissionsCta）已提供相同按鈕，
   * 為避免上下重複，首頁傳入 false。
   */
  showCta?: boolean;
};

/**
 * 全站頁尾。Cache Components 以 <Activity> 保留離開的路由（display: none 但仍在文件中），
 * 每個保留的路由各有一份頁尾，因此頁尾內不使用固定 id：地標名稱改用 aria-label，
 * 地圖格線直接以路徑繪製而非 <pattern id>（url(#id) 會解析到文件中第一個、可能是隱藏的那份）。
 */
export function Footer({ showCta = true }: FooterProps) {
  return (
    <footer aria-label={FOOTER_LABEL} className="text-brand-100">
      <h2 className="sr-only">{FOOTER_LABEL}</h2>

      {/* 第一層：宣言帶 */}
      <div className="relative isolate overflow-hidden bg-brand-800">
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 -z-10 hidden w-[40%] bg-brand-700/60 [clip-path:polygon(24%_0,100%_0,100%_100%,0_100%)] lg:block"
        />
        <span
          aria-hidden="true"
          className="absolute top-0 right-0 -z-10 hidden size-10 bg-champagne-300 [clip-path:polygon(0_0,100%_0,100%_100%)] lg:block"
        />
        <Container className="flex flex-col gap-8 py-10 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:py-12">
          <div className="max-w-2xl">
            <p className="text-2xl leading-snug font-semibold tracking-[0.01em] text-balance break-keep text-white lg:text-3xl">
              {footerStatement.slogan}
            </p>
            <p className="mt-3 text-base leading-relaxed text-pretty break-keep text-brand-100/85">
              {footerStatement.description}
            </p>
          </div>
          {showCta ? (
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row">
            <ButtonLink
              href={site.links.consultation}
              variant="accent"
              size="lg"
              title={consultationTitle}
              className="w-full sm:w-auto"
            >
              <CalendarCheck aria-hidden="true" className="size-4.5" />
              線上預約諮詢
            </ButtonLink>
            <ButtonLink
              href={site.links.brochurePdf}
              variant="outline-light"
              size="lg"
              external
              title={brochureTitle}
              className="w-full sm:w-auto"
            >
              <Download aria-hidden="true" className="size-4.5" />
              報考簡章下載 (PDF)
            </ButtonLink>
          </div>
          ) : null}
        </Container>
      </div>

      {/* 第二層：品牌、聯絡、地圖與快速連結 */}
      <div className="bg-brand-900">
        <Container className="grid gap-10 py-14 md:grid-cols-2 md:gap-y-12 lg:grid-cols-12 lg:gap-x-8 lg:py-16 xl:gap-x-12">
          <div className="lg:col-span-4">
            <Logo layout="stacked" />
            <div className="mt-6 flex items-center gap-3">
              {/* EMRD 學程徽章（註冊商標審定號 01962663），白色圓形襯底以維持辨識度 */}
              <span className="shrink-0 rounded-full bg-white p-0.5 ring-1 ring-white/30">
                <Image src={emrdSeal} alt="" width={40} height={40} className="size-10" />
              </span>
              <div>
                <p className="text-sm font-medium text-white">{site.officialName}</p>
                <p lang="en" className="mt-0.5 text-sm text-brand-200">
                  {site.englishName}
                </p>
              </div>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-pretty text-brand-100/80">
              {hero.subtitle}
            </p>
            <ul aria-label="社群與校友連結" className="mt-8 flex flex-wrap gap-2">
              <li>
                <SocialLink
                  href={site.links.facebook}
                  external
                  icon={<FacebookGlyph />}
                  lang="en"
                >
                  Facebook
                </SocialLink>
              </li>
              <li>
                <SocialLink
                  href={site.links.youtube}
                  external
                  icon={<YouTubeGlyph />}
                  lang="en"
                >
                  YouTube
                </SocialLink>
              </li>
              <li>
                <SocialLink
                  href={site.routes.alumni}
                  icon={<GraduationCap aria-hidden="true" className="size-4 shrink-0" />}
                >
                  校友專區
                </SocialLink>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-3">
            <h3 className={headingClass}>學程辦公室</h3>
            <address className="mt-6 not-italic">
              <dl className="space-y-5">
                <ContactItem label="電話">
                  <a
                    href={site.contact.phoneHref}
                    className={cn(contactLinkClass, "tabular-nums")}
                  >
                    {site.contact.phone}
                  </a>
                </ContactItem>
                <ContactItem label="E-mail" labelLang="en">
                  <a
                    href={site.contact.emailHref}
                    className={cn(contactLinkClass, "wrap-anywhere")}
                  >
                    {site.contact.email}
                  </a>
                </ContactItem>
                <ContactItem label="地址">
                  {site.contact.addressLines.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                  <span className="mt-0.5 block text-brand-100/80">
                    {site.contact.office}
                  </span>
                </ContactItem>
                <ContactItem label="服務時間">
                  <span className="block">{site.contact.officeDays}</span>
                  <span className="block whitespace-nowrap tabular-nums">
                    {site.contact.officeTime}
                  </span>
                </ContactItem>
              </dl>
            </address>
          </div>

          <div className="lg:col-span-3">
            <h3 className={headingClass}>校園地圖指引</h3>
            <div className="mt-6 max-w-sm rounded-md bg-white/5 p-5 ring-1 ring-white/10 ring-inset md:max-w-none">
              <CampusMapIllustration />
              <p className="mt-4 text-sm font-medium text-white">{site.contact.office}</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-100/80">
                {site.contact.addressLines.map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
              <ul className="mt-4 border-t border-white/10 pt-2">
                {mapLinks.map((link) => (
                  <li key={link.href}>
                    <FooterLink {...link} />
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <nav aria-label={QUICK_LINKS_LABEL} className="lg:col-span-2">
            <h3 className={headingClass}>{QUICK_LINKS_LABEL}</h3>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 lg:grid-cols-1">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <FooterLink {...link} />
                </li>
              ))}
            </ul>
            <ul
              aria-label="校外相關網站"
              className="mt-2 grid grid-cols-2 gap-x-6 border-t border-white/10 pt-2 lg:grid-cols-1"
            >
              {relatedLinks.map((link) => (
                <li key={link.href}>
                  <FooterLink {...link} />
                </li>
              ))}
            </ul>
          </nav>
        </Container>
      </div>

      {/* 第三層：版權與學制宣告 */}
      <div className="bg-brand-950">
        <Container className="flex flex-col gap-4 py-6 text-xs leading-relaxed text-brand-100/70 md:flex-row md:items-center md:justify-between md:gap-8">
          <div className="space-y-1">
            <p>
              <span className="whitespace-nowrap">
                © <CopyrightYear /> {site.college}
              </span>{" "}
              <span className="whitespace-nowrap">{site.officialName}版權所有</span>
            </p>
            <p>
              學制：<span className="whitespace-nowrap">碩士在職專班</span>｜
              <span className="whitespace-nowrap">授予碩士學位</span>｜
              <span className="whitespace-nowrap">
                <span className="tabular-nums">{site.foundedAcademicYear}</span> 學年度創立
              </span>
            </p>
          </div>
          <ul className="flex shrink-0 flex-wrap items-center gap-x-6">
            <li>
              <Link href={site.routes.privacy} className={legalLinkClass}>
                隱私權政策
              </Link>
            </li>
            <li>
              <Link href={site.routes.sitemap} className={legalLinkClass}>
                網站導覽
              </Link>
            </li>
          </ul>
        </Container>
      </div>
    </footer>
  );
}

/**
 * cacheComponents 開啟時，render 期間直接呼叫 new Date() 會中斷預先渲染；
 * 以 "use cache" 快取年份並每日重新驗證，跨年後自動更新。
 */
async function CopyrightYear() {
  "use cache";
  cacheLife("days");

  return <span className="tabular-nums">{new Date().getFullYear()}</span>;
}

function ContactItem({
  label,
  labelLang,
  children,
}: {
  label: string;
  labelLang?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt lang={labelLang} className="text-xs font-medium tracking-[0.12em] text-brand-200">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm leading-relaxed text-white">{children}</dd>
    </div>
  );
}

const footerLinkClass = cn(
  "group inline-flex min-h-11 items-center gap-2 text-sm text-brand-100 transition-colors duration-200 hover:text-white",
  focusClass,
);

/** 箭頭前導的連結：站內頁面 →（同頁開啟），外部網站 ↗（另開新視窗） */
function FooterLink({ label, href, external = false }: FooterLinkItem) {
  // break-keep：中文詞不從中間斷開（如「EMRD 校友薈萃堂」不會剩下「堂」單獨一行）；
  // wrap-anywhere 為保險，欄寬窄於整個詞時仍可換行而不溢出
  const text = (
    <span className="break-keep wrap-anywhere underline-offset-4 group-hover:underline">{label}</span>
  );

  if (!external) {
    return (
      <Link href={href} className={footerLinkClass}>
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 text-brand-300 transition-transform duration-200 group-hover:translate-x-0.5"
        />
        {text}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={footerLinkClass}>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-brand-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
      />
      {text}
      <span className="sr-only">（另開新視窗）</span>
    </a>
  );
}

const socialLinkClass = cn(
  "inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm text-brand-100 ring-1 ring-white/20 transition-colors duration-200 ring-inset hover:bg-white/10 hover:text-white hover:ring-white/40",
  focusClass,
);

function SocialLink({
  href,
  external = false,
  icon,
  lang,
  children,
}: {
  href: string;
  /** 社群平台另開新視窗；站內的校友專區同頁開啟 */
  external?: boolean;
  icon: ReactNode;
  lang?: string;
  children: ReactNode;
}) {
  const content = (
    <>
      {icon}
      <span lang={lang}>{children}</span>
    </>
  );

  if (!external) {
    return (
      <Link href={href} className={socialLinkClass}>
        {content}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={socialLinkClass}>
      {content}
      <span className="sr-only">（另開新視窗）</span>
    </a>
  );
}

/* lucide-react 1.x 已移除品牌圖示，以下為同筆觸風格的線條字形 */

const glyphProps = {
  "aria-hidden": true,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  className: "size-4 shrink-0",
} as const;

function FacebookGlyph() {
  return (
    <svg {...glyphProps}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function YouTubeGlyph() {
  return (
    <svg {...glyphProps}>
      <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
      <path d="m10 15 5-3-5-3z" />
    </svg>
  );
}

/** 地圖底紋：每 16px 一條的格線（240×96 畫布） */
const MAP_GRID_PATH = [
  ...Array.from({ length: 240 / 16 }, (_, i) => `M${i * 16} 0V96`),
  ...Array.from({ length: 96 / 16 }, (_, i) => `M0 ${i * 16}H240`),
].join("");

/** 抽象化街廓與定位針，僅作裝飾（靜態，無循環動畫） */
function CampusMapIllustration() {
  return (
    <div className="overflow-hidden rounded-sm bg-brand-950/50 ring-1 ring-white/5">
      <svg
        aria-hidden="true"
        viewBox="0 0 240 96"
        preserveAspectRatio="xMidYMid slice"
        className="block aspect-[5/2] w-full"
      >
        <path d={MAP_GRID_PATH} fill="none" strokeWidth="1" className="stroke-white/8" />

        <rect x="18" y="14" width="40" height="24" rx="2" className="fill-white/5" />
        <rect x="104" y="66" width="52" height="20" rx="2" className="fill-white/5" />
        <rect x="186" y="56" width="40" height="28" rx="2" className="fill-white/5" />

        <path
          d="M78 -8 96 104M168 -8 176 104"
          fill="none"
          strokeWidth="3"
          className="stroke-brand-300/20"
        />
        <path
          d="M-8 66C60 58 150 50 248 30"
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          className="stroke-brand-300/25"
        />

        <rect
          x="108"
          y="12"
          width="52"
          height="32"
          rx="2"
          strokeWidth="1"
          className="fill-champagne-300/10 stroke-champagne-300/40"
        />
        <circle cx="134" cy="23" r="12" className="fill-champagne-300/15" />
        <path
          d="M134 36s-7-7.2-7-13a7 7 0 0 1 14 0c0 5.8-7 13-7 13z"
          className="fill-champagne-300"
        />
        <circle cx="134" cy="23" r="2.5" className="fill-brand-900" />
      </svg>
    </div>
  );
}
