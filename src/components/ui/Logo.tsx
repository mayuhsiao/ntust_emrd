import Image from "next/image";
import ntustLogo from "@/assets/ntust-logo.png";
import ntustLogoWhite from "@/assets/ntust-logo-white.png";
import ntustSymbol from "@/assets/ntust-symbol.png";
import ntustSymbolWhite from "@/assets/ntust-symbol-white.png";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

type LogoProps = {
  className?: string;
  /**
   * inline：導覽列，窄螢幕與 lg–xl 為「校徽＋兩行字」，其餘為「標準字｜學程名稱」。
   * stacked：深色頁尾，白色標準字下方接學程名稱。
   */
  layout?: "inline" | "stacked";
  /** inline 版型於深藍底使用白色標準字與文字（stacked 一律為白色） */
  inverted?: boolean;
  /** 首屏即可見時立即載入（僅導覽列使用） */
  eager?: boolean;
};

const PROGRAM_NAME = site.programName;
const PROGRAM_ABBR = site.programAbbr;
/** 單行顯示（頁尾） */
const PROGRAM_FULL_NAME = `${PROGRAM_NAME}（${PROGRAM_ABBR}）`;

/*
 * 圖片尺寸：width／height 沿用靜態匯入的原始尺寸（僅提供比例，避免版面位移），
 * 實際顯示大小完全由 CSS（h-* w-auto）決定，下載尺寸由 sizes 挑選。
 * 若改傳顯示尺寸（例如 251×40），最佳化後的縮圖寬高會被四捨五入（256×41），
 * w-auto 依縮圖比例算出的寬度會差 1px，觸發 next/image「width or height modified, but not the other」警告。
 */

/**
 * 臺科大標準字（校徽＋「國立臺灣科技大學」，秘書室 2019-07-01 公告版本）＋學程名稱。
 * 素材來源：https://www.secretariat.ntust.edu.tw/p/406-1063-85380,r1785.php
 */
export function Logo({
  className,
  layout = "inline",
  inverted = false,
  eager = false,
}: LogoProps) {
  const loading = eager ? "eager" : "lazy";

  if (layout === "stacked") {
    return (
      <span className={cn("flex flex-col items-start gap-3", className)}>
        <Image
          src={ntustLogoWhite}
          alt="國立臺灣科技大學"
          sizes="251px"
          className="h-10 w-auto"
          loading={loading}
        />
        <span className="text-base font-semibold tracking-[0.08em] text-white">
          {PROGRAM_FULL_NAME}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("flex items-center", className)}>
      {/*
        校徽符號＋兩行字：< sm 避免與選單鈕擠壓；lg–xl 之間同一列還有主導覽與 CTA，
        放不下完整標準字（約 395px）。
      */}
      <span className="flex items-center gap-2.5 sm:hidden lg:flex lg:gap-2 xl:hidden">
        <Image
          src={inverted ? ntustSymbolWhite : ntustSymbol}
          alt=""
          sizes="36px"
          className="h-9 w-auto shrink-0 lg:h-8"
          loading={loading}
        />
        {/*
          EMRD 併入第一行：第二行放全名「（EMRD）」會在 375px 折成三行、在 lg 使導覽列超寬。
          lg–xl 導覽列最緊（1024px），校徽、字距與第二行字級略縮，總寬約 183px；320px 手機上也不能碰到搜尋鈕。
        */}
        <span className="flex flex-col leading-tight whitespace-nowrap">
          <span
            className={cn(
              "text-[0.6875rem] font-medium tracking-[0.12em] lg:tracking-[0.04em]",
              inverted ? "text-champagne-300" : "text-champagne-700",
            )}
          >
            國立臺灣科技大學
            <span aria-hidden="true" className="mx-1 lg:mx-0.5">·</span>
            <span lang="en" className="font-semibold tracking-[0.16em] lg:tracking-[0.08em]">
              {PROGRAM_ABBR}
            </span>
          </span>
          <span
            className={cn(
              "text-[0.8125rem] font-semibold lg:text-xs",
              inverted ? "text-white" : "text-slate-900",
            )}
          >
            {PROGRAM_NAME}
          </span>
        </span>
      </span>

      {/*
        sm–lg 與 xl 以上：完整標準字｜學程名稱。名稱分兩行（中文名稱＋EMRD），
        單行「高階科技研發碩士學位學程（EMRD）」會讓 xl 以上的導覽列超出內容寬度（1216px）。
      */}
      <span className="hidden items-center gap-3.5 sm:flex lg:hidden xl:flex xl:gap-2.5">
        <Image
          src={inverted ? ntustLogoWhite : ntustLogo}
          alt="國立臺灣科技大學"
          sizes="226px"
          className="h-9 w-auto shrink-0 xl:h-8"
          loading={loading}
        />
        <span
          aria-hidden="true"
          className={cn("h-7 w-px", inverted ? "bg-white/30" : "bg-slate-300")}
        />
        <span className="flex flex-col leading-tight whitespace-nowrap">
          <span
            className={cn(
              "text-[0.9375rem] font-semibold tracking-[0.06em] xl:text-sm xl:tracking-[0.03em]",
              inverted ? "text-white" : "text-slate-900",
            )}
          >
            {PROGRAM_NAME}
          </span>
          <span
            lang="en"
            className={cn(
              "text-[0.6875rem] font-semibold tracking-[0.28em]",
              inverted ? "text-champagne-300" : "text-champagne-700",
            )}
          >
            {PROGRAM_ABBR}
          </span>
        </span>
      </span>
    </span>
  );
}
