import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { CampusMap } from "@/components/campus/CampusMap";
import { ContentLayout, InteriorFrame } from "@/components/site/InteriorFrame";
import { interiorOpenGraph } from "@/components/site/metadata";
import { PageHeader } from "@/components/site/PageHeader";
import { site } from "@/lib/site";

const description = `臺科大公館校區互動校園地圖：點選建物即可在官方校內配置圖上標示位置與進駐單位，並快速找到 EMRD 學程辦公室（${site.contact.office.split(" ")[0]}）、EMRD 專屬教室與校友薈萃堂。`;

export const metadata: Metadata = {
  title: "校園地圖",
  description,
  alternates: { canonical: site.routes.campus },
  openGraph: interiorOpenGraph({ title: "校園地圖", description, url: site.routes.campus }),
};

const externalLinks = [
  { label: "Google 地圖導航", href: site.links.googleMaps },
  { label: "臺科大校內配置圖（高解析度）", href: site.links.campusLayout },
  { label: "交通資訊（臺科大校址圖）", href: site.links.campusMap },
] as const;

export default function CampusPage() {
  return (
    <InteriorFrame pathname={site.routes.campus}>
      <PageHeader
        crumbs={[
          { label: "首頁", href: "/" },
          { label: "校園地圖", href: site.routes.campus },
        ]}
        eyebrow="Campus Map"
        title="校園地圖"
        lead={
          <>
            點選建物名稱，地圖會即時標示位置與進駐單位。地址：{site.contact.address}。
          </>
        }
      />
      <ContentLayout>
        <CampusMap />

        <div className="mt-12 flex flex-col gap-4 border-t border-stroke pt-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-xs leading-relaxed text-slate-600">
            地圖來源：國立臺灣科技大學「校內配置圖」（2025 年 12 月版）；建物名稱與進駐單位依同頁文字說明。
          </p>
          <ul aria-label="外部地圖連結" className="flex flex-wrap gap-x-6">
            {externalLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm font-semibold text-brand-700 underline-offset-4 transition-colors duration-200 hover:text-brand-800 hover:underline"
                >
                  {link.label}
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                  <span className="sr-only">（另開新視窗）</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </ContentLayout>
    </InteriorFrame>
  );
}
