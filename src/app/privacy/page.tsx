import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Info,
  Mail,
  MapPin,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { Footer } from "@/components/layout/Footer";
import { Navbar } from "@/components/layout/Navbar";
import { interiorOpenGraph } from "@/components/site/metadata";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

const description = `${site.name}網站隱私權政策：說明本網站對個人資料、Cookie 與存取紀錄、嵌入內容及外部連結之處理原則。`;

export const metadata: Metadata = {
  title: "隱私權政策",
  description,
  alternates: { canonical: site.routes.privacy },
  // 自訂 openGraph 會使根層分享圖不再自動帶入，interiorOpenGraph 補回預設分享圖
  openGraph: interiorOpenGraph({ title: "隱私權政策", description, url: site.routes.privacy }),
};

const paragraphClass = "mt-4 text-base leading-relaxed text-pretty text-slate-700";
const listClass =
  "mt-4 list-disc space-y-2 pl-5 text-base leading-relaxed text-slate-700 marker:text-brand-600";
/** 以 ::after 向上下延伸點擊區至 44px 以上，不影響行距 */
const inlineLinkClass =
  "relative inline-block font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-3 hover:text-brand-800 hover:decoration-brand-700";

type PolicySection = { id: string; title: string; content: ReactNode };

const sections: readonly PolicySection[] = [
  {
    id: "scope",
    title: "適用範圍",
    content: (
      <p className={paragraphClass}>
        本政策適用於「{site.name}」網站（以下稱「本網站」）。本網站為{site.college}{" "}
        {site.officialName}之官方網站，提供專班特色、課程、師資、修業規定、招生資訊與最新消息。
      </p>
    ),
  },
  {
    id: "collection",
    title: "個人資料之蒐集與利用",
    content: (
      <>
        <p className={paragraphClass}>
          本網站不設會員註冊、登入機制或線上表單，不會主動蒐集可識別您個人身分之資料。
        </p>
        <p className={paragraphClass}>
          若您主動以 E-mail 或電話與學程辦公室聯繫（包括透過「線上預約諮詢」寄送郵件），您所提供之姓名、聯絡方式與諮詢內容，僅用於回覆諮詢及提供招生相關資訊；除法令另有規定外，不會移作他用或提供予第三人。
        </p>
        <p className={paragraphClass}>
          部分頁面（如「校友資訊更新區」）連結至 Google
          表單等外部服務。您於該服務填寫之資料，學程辦公室僅用於校友聯繫與相關服務，並同時適用該服務之隱私權政策。
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookie 與存取紀錄",
    content: (
      <>
        <p className={paragraphClass}>
          本網站不使用追蹤型 Cookie，亦不以 Cookie 進行跨站追蹤或廣告投放。
        </p>
        <p className={paragraphClass}>
          為維護系統穩定與資訊安全，網站伺服器可能自動留存一般存取紀錄，例如：
        </p>
        <ul className={listClass}>
          <li>IP 位址與存取時間</li>
          <li>瀏覽器與作業系統類型</li>
          <li>瀏覽頁面與來源網址</li>
        </ul>
        <p className={paragraphClass}>
          上述紀錄僅供系統維運、資安稽核與整體流量統計之用，不會用以識別特定個人；除配合司法或主管機關依法調查外，不會對外揭露。
        </p>
      </>
    ),
  },
  {
    id: "embedded-content",
    title: "嵌入內容",
    content: (
      <p className={paragraphClass}>
        部分頁面嵌入 YouTube 影片（採 youtube-nocookie.com 隱私強化模式）與 Google
        日曆。載入或播放這些內容時，將由該服務直接提供，並可能依其隱私權政策設定 Cookie
        或記錄使用資訊；本網站不會取得您在該服務的帳號資料。
      </p>
    ),
  },
  {
    id: "external-links",
    title: "外部連結",
    content: (
      <p className={paragraphClass}>
        本網站提供連結至國立臺灣科技大學各單位、臺科大招生資訊網站、存放於 Google
        雲端硬碟的法規與表單文件，以及 Facebook、YouTube
        等第三方網站。當您點選連結前往其他網站時，即適用該網站之隱私權政策，本政策不適用於該等網站。
      </p>
    ),
  },
  {
    id: "legal-basis",
    title: "法令依據與您的權利",
    content: (
      <>
        <p className={paragraphClass}>
          本網站對個人資料之蒐集、處理及利用，均依《個人資料保護法》及相關法令，並遵循國立臺灣科技大學個人資料保護相關規定辦理。
        </p>
        <p className={paragraphClass}>
          依《個人資料保護法》第 3 條，您得就本學程保有之您的個人資料行使下列權利：
        </p>
        <ul className={listClass}>
          <li>查詢或請求閱覽</li>
          <li>請求製給複製本</li>
          <li>請求補充或更正</li>
          <li>請求停止蒐集、處理或利用</li>
          <li>請求刪除</li>
        </ul>
      </>
    ),
  },
  {
    id: "revision",
    title: "政策修訂",
    content: (
      <p className={paragraphClass}>
        本政策將因應法令修正或網站服務調整適時修訂，修訂後之內容將公告於本頁，並同步更新最後更新日期。
      </p>
    ),
  },
  {
    id: "privacy-contact",
    title: "聯絡窗口",
    content: (
      <>
        <p className={paragraphClass}>
          如對本政策或個人資料之處理有任何疑問，或欲行使上述權利，歡迎與學程辦公室聯繫。
        </p>
        <address className="mt-6 not-italic">
          <dl className="grid gap-6 rounded-md border border-stroke bg-surface p-6 sm:grid-cols-2 sm:p-8">
            <ContactRow icon={Phone} label="電話">
              <a href={site.contact.phoneHref} className={cn(inlineLinkClass, "tabular-nums")}>
                {site.contact.phone}
              </a>
            </ContactRow>
            <ContactRow icon={Mail} label="E-mail" labelLang="en">
              <a href={site.contact.emailHref} className={cn(inlineLinkClass, "wrap-anywhere")}>
                {site.contact.email}
              </a>
            </ContactRow>
            <ContactRow icon={MapPin} label="地址">
              {site.contact.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
              <span className="mt-0.5 block text-slate-600">{site.contact.office}</span>
            </ContactRow>
            <ContactRow icon={Clock} label="服務時間">
              <span className="block">{site.contact.officeDays}</span>
              <span className="block whitespace-nowrap tabular-nums">
                {site.contact.officeTime}
              </span>
            </ContactRow>
          </dl>
        </address>
      </>
    ),
  },
];

/** 將序號轉為兩位數，如 1 → 01 */
const toOrdinal = (index: number) => String(index + 1).padStart(2, "0");

export default function PrivacyPage() {
  return (
    <>
      <Navbar pathname={site.routes.privacy} />
      <main id="main" tabIndex={-1} className="outline-none">
        <Section>
          <Container>
            <nav aria-label="導覽路徑">
              <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                <li>
                  <Link
                    href={site.routes.home}
                    className="inline-flex min-h-11 items-center underline-offset-4 transition-colors duration-200 hover:text-brand-700 hover:underline"
                  >
                    首頁
                  </Link>
                </li>
                <li className="flex items-center gap-1.5">
                  <ChevronRight aria-hidden="true" className="size-4 text-slate-400" />
                  <span aria-current="page" className="font-medium text-brand-950">
                    隱私權政策
                  </span>
                </li>
              </ol>
            </nav>

            <article aria-labelledby="privacy-title">
              <header className="mt-6 max-w-3xl border-b border-stroke pb-10 lg:pb-12">
                <p
                  lang="en"
                  className="flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-champagne-700 uppercase"
                >
                  <span aria-hidden="true" className="h-px w-8 bg-champagne-500/70" />
                  Privacy Policy
                </p>
                <h1
                  id="privacy-title"
                  className="mt-4 text-4xl leading-tight font-semibold tracking-[0.01em] text-balance text-brand-950 sm:text-5xl"
                >
                  隱私權政策
                </h1>
                <p className="mt-5 text-base leading-relaxed text-pretty text-slate-700 sm:text-lg">
                  {site.officialName}
                  重視您的隱私。本政策說明您瀏覽本網站時相關資訊的處理方式，以及您依法享有的權利。
                </p>
                <p className="mt-6 text-sm text-slate-600">
                  <time dateTime="2026-10">最後更新：2026 年 10 月</time>
                </p>
              </header>

              <div className="mt-12 lg:mt-16 lg:grid lg:grid-cols-12 lg:gap-12">
                <aside className="hidden lg:col-span-3 lg:block">
                  <nav aria-labelledby="privacy-toc-title" className="sticky top-28">
                    <p
                      id="privacy-toc-title"
                      className="text-xs font-semibold tracking-[0.12em] text-champagne-700"
                    >
                      本頁目錄
                    </p>
                    <ol className="mt-4 border-l border-stroke">
                      {sections.map((section, index) => (
                        <li key={section.id}>
                          <a
                            href={`#${section.id}`}
                            className="-ml-px flex gap-3 border-l-2 border-transparent py-2 pl-4 text-sm text-slate-600 transition-colors duration-200 hover:border-brand-600 hover:text-brand-700"
                          >
                            <span aria-hidden="true" className="text-slate-500 tabular-nums">
                              {toOrdinal(index)}
                            </span>
                            {section.title}
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </aside>

                <div className="max-w-3xl lg:col-span-9">
                  <div
                    role="note"
                    className="flex gap-3 rounded-md border border-stroke bg-surface p-5"
                  >
                    <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
                    <p className="text-sm leading-relaxed text-slate-700">
                      本頁為網站隱私權聲明草案，正式內容以國立臺灣科技大學公告之政策為準。
                    </p>
                  </div>

                  {sections.map((section, index) => (
                    <section key={section.id} id={section.id} className="mt-12">
                      <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-[0.01em] text-balance text-brand-950">
                        <span
                          aria-hidden="true"
                          className="text-sm font-medium text-champagne-700 tabular-nums"
                        >
                          {toOrdinal(index)}
                        </span>
                        {section.title}
                      </h2>
                      {section.content}
                    </section>
                  ))}

                  <div className="mt-16 border-t border-stroke pt-8">
                    <Link
                      href={site.routes.home}
                      className="group inline-flex min-h-11 items-center gap-2 text-base font-semibold text-brand-700 underline-offset-4 hover:underline"
                    >
                      <ArrowLeft
                        aria-hidden="true"
                        className="size-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5"
                      />
                      返回首頁
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          </Container>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function ContactRow({
  icon: Icon,
  label,
  labelLang,
  children,
}: {
  icon: LucideIcon;
  label: string;
  labelLang?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="flex items-center gap-2 text-xs font-medium tracking-[0.12em] text-slate-600">
        <Icon aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
        <span lang={labelLang}>{label}</span>
      </dt>
      <dd className="mt-1.5 pl-6 text-base leading-relaxed text-brand-950">{children}</dd>
    </div>
  );
}
