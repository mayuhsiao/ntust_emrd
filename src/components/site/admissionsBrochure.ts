/**
 * 報考簡章的版本判斷：「招生資訊」頁（AdmissionsHub）與文章頁的歷史招生公告提示共用，
 * 兩處對「簡章是否已換成本學年度版本」的說法一致。
 */
import { currentIntakeYear } from "@/content/home";
import { site } from "@/lib/site";

/**
 * site.links.brochurePdf 是否已換成本學年度（currentIntakeYear）的簡章：
 * 依 site.links.brochureLabel 是否標示「116 學年度」判斷（學年度與「學年度」之間可有可無空白）。
 */
export const brochureIsCurrent = new RegExp(`(?<!\\d)${currentIntakeYear}\\s*學年度`).test(
  site.links.brochureLabel,
);

/** 簡章版本說明；尚未換成本學年度版本時補充「僅供參考」 */
export const brochureVersionNote = `目前版本：${site.links.brochureLabel}${
  brochureIsCurrent ? "" : `（${currentIntakeYear} 學年度簡章公告前僅供參考）`
}`;
