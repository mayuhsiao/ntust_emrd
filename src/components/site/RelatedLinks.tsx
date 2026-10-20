import Link from "next/link";
import { ArrowRight, Clock, Mail, MapPin, Phone, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { site } from "@/lib/site";

export type RelatedLink = { href: string; label: string };

/** 獨立頁右側的「相關頁面」清單 */
export function RelatedLinks({ title = "相關頁面", links }: { title?: string; links: readonly RelatedLink[] }) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={title} className="rounded-md border border-stroke bg-white p-5">
      <p className="flex items-center gap-3 text-base font-semibold text-brand-950">
        <span aria-hidden="true" className="h-4 w-0.5 bg-champagne-500" />
        {title}
      </p>
      <ul className="mt-3 border-t border-stroke">
        {links.map((link) => (
          <li key={link.href} className="border-b border-stroke last:border-b-0">
            <Link
              href={link.href}
              // 相關頁面僅數個靜態頁：完整預先載入，點擊後不必再等伺服器回應
              prefetch={true}
              className="group flex min-h-12 items-center gap-3 py-2 text-[0.9375rem] font-medium text-slate-700 transition-colors duration-200 hover:text-brand-900"
            >
              <span className="flex-1 decoration-brand-300 underline-offset-4 group-hover:underline">
                {link.label}
              </span>
              <ArrowRight
                aria-hidden="true"
                className="size-4 shrink-0 text-brand-600 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const valueLinkClass =
  "relative inline-block font-semibold text-brand-800 underline decoration-brand-200 underline-offset-4 transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-3 hover:decoration-brand-700";

function Row({
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
      <dd className="mt-1 pl-6 text-[0.9375rem] leading-relaxed text-brand-950">{children}</dd>
    </div>
  );
}

/** 學程辦公室聯絡卡（資料取自 src/lib/site.ts，與頁尾一致） */
export function ContactCard() {
  return (
    <section className="rounded-md border border-stroke bg-surface p-5">
      <h2 className="flex items-center gap-3 text-base font-semibold text-brand-950">
        <span aria-hidden="true" className="h-4 w-0.5 bg-champagne-500" />
        學程辦公室
      </h2>
      <address className="mt-4 not-italic">
        <dl className="grid gap-4">
          <Row icon={Phone} label="電話">
            <a href={site.contact.phoneHref} className={`${valueLinkClass} tabular-nums`}>
              {site.contact.phone}
            </a>
          </Row>
          <Row icon={Mail} label="E-mail" labelLang="en">
            <a href={site.contact.emailHref} className={`${valueLinkClass} wrap-anywhere`}>
              {site.contact.email}
            </a>
          </Row>
          <Row icon={MapPin} label="地址">
            {site.contact.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <span className="mt-0.5 block text-slate-600">{site.contact.office}</span>
          </Row>
          <Row icon={Clock} label="服務時間">
            <span className="block">{site.contact.officeDays}</span>
            <span className="block whitespace-nowrap tabular-nums">{site.contact.officeTime}</span>
          </Row>
        </dl>
      </address>
    </section>
  );
}
