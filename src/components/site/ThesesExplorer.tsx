/**
 * 歷屆畢業論文（/curriculum/theses）：資料來自 src/content/theses.json
 * （客戶整理於班級網站，topics 為依題名關鍵字自動分類）。
 *
 * 本檔為 Server Component：整理資料、輸出導言，並把畫面所需的最小欄位交給 ThesesFilter；
 * ThesesFilter 於伺服器端渲染完整清單，瀏覽器端只負責篩選。
 */
import { ArrowUpRight, Info } from "lucide-react";
import data from "@/content/theses.json";
import { ThesesFilter, type ThesisEntry, type ThesisProgram } from "./ThesesFilter";

/** 自 Client 模組匯入的非元件值在伺服器端只是參照，學程清單因此在此另行定義 */
const PROGRAMS: readonly string[] = ["EMRD", "SEMI-EMRD"] satisfies readonly ThesisProgram[];

function isProgram(value: string): value is ThesisProgram {
  return PROGRAMS.includes(value);
}

/** 依學年度由新到舊（同學年度維持資料檔順序） */
const theses: readonly ThesisEntry[] = data.theses
  .filter((item) => item.title && item.url)
  .map((item): ThesisEntry => {
    const entry: ThesisEntry = {
      year: item.year,
      program: isProgram(item.program) ? item.program : "EMRD",
      name: item.name.trim(),
      title: item.title.trim(),
      advisor: item.advisor.trim(),
      url: item.url,
      topics: item.topics,
    };
    const titleEn = "titleEn" in item ? item.titleEn?.trim() : undefined;
    if (titleEn) entry.titleEn = titleEn;
    return entry;
  })
  .sort((a, b) => b.year - a.year);

/** 研究方向依篇數排序，「其他」固定在最後 */
const topics: readonly string[] = (() => {
  const counts = new Map<string, number>();
  for (const thesis of theses) {
    for (const topic of thesis.topics) counts.set(topic, (counts.get(topic) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a, countA], [b, countB]) => {
      if (a === "其他" || b === "其他") return a === "其他" ? 1 : -1;
      return countB - countA || a.localeCompare(b, "zh-Hant-TW");
    })
    .map(([topic]) => topic);
})();

export const thesesStats = (() => {
  const years = theses.map((thesis) => thesis.year);
  return {
    count: theses.length,
    minYear: Math.min(...years),
    maxYear: Math.max(...years),
    updated: data.updated,
    sources: data.sources,
  };
})();

const yearRange = `${thesesStats.minYear}–${thesesStats.maxYear}`;

/** meta description（與 ia.json 的 curriculum/theses description 同步；篇數與學年度依資料檔計算） */
export function thesesDescription() {
  return `EMRD 歷屆畢業論文：收錄 ${yearRange} 學年度 EMRD 與 SEMI-EMRD 學程畢業論文共 ${thesesStats.count} 篇，可依關鍵字、學年度、學程與研究方向查詢，並連結臺科大博碩士論文系統；另保留原網站 105–109 學年度中英文論文清單。`;
}

/** 頁首導言 */
export function thesesLead() {
  return `收錄 ${yearRange} 學年度 EMRD 與 SEMI-EMRD 學程畢業論文共 ${thesesStats.count} 篇，依學年度由新到舊排列，可依關鍵字、學年度、學程與研究方向查詢。`;
}

function formatDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[1]} 年 ${Number(match[2])} 月 ${Number(match[3])} 日` : iso;
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-0.5 font-medium text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-900 hover:decoration-brand-700"
    >
      {children}
      <span className="sr-only">（另開新視窗）</span>
      <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 self-center" />
    </a>
  );
}

/** 資料來源、整理日期與研究方向分類說明 */
export function ThesesIntro() {
  return (
    <div className="flex gap-3 rounded-md border border-stroke bg-white p-4 text-sm leading-relaxed text-slate-700 sm:p-5">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-700" />
      <p>
        資料來源：<ExternalLink href={thesesStats.sources.lib}>臺科大博碩士論文系統</ExternalLink>
        （整理日期 <time dateTime={thesesStats.updated}>{formatDate(thesesStats.updated)}</time>
        ）。點選論文題目可查看論文資訊；研究方向標籤係依論文題目關鍵字自動分類，僅供參考。
      </p>
    </div>
  );
}

/** 歷屆畢業論文清單與篩選 */
export function ThesesExplorer() {
  return <ThesesFilter entries={theses} topics={topics} />;
}
