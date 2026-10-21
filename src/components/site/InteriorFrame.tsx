import type { ReactNode } from "react";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { Navbar } from "@/components/layout/Navbar";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

/**
 * 內頁外框：頁首導覽＋主要內容地標＋行動版底部行動列＋頁尾
 * @param pathname 目前頁面的路徑，供頁首標示目前所在單元
 */
export function InteriorFrame({ pathname, children }: { pathname: string; children: ReactNode }) {
  return (
    <>
      <Navbar pathname={pathname} />
      <main id="main" tabIndex={-1} className="outline-none">
        {children}
      </main>
      {/* 行動列須緊接在 <main> 與 <footer> 之間：以同層節點找出要觀察的區塊 */}
      <MobileActionBar pathname={pathname} />
      <Footer />
    </>
  );
}

type ContentLayoutProps = {
  /** 側欄內容（單元導覽或相關連結） */
  aside?: ReactNode;
  /** start：左側 3 欄（單元導覽）；end：右側 4 欄（相關連結） */
  asidePosition?: "start" | "end";
  children: ReactNode;
  className?: string;
};

/** 內頁主體：12 欄格線。內容欄加上 min-w-0，讓寬表格在欄內左右捲動而非撐開版面 */
export function ContentLayout({
  aside,
  asidePosition = "start",
  children,
  className,
}: ContentLayoutProps) {
  if (!aside) {
    return (
      <Container className={cn("py-12 lg:py-16", className)}>
        <div className="min-w-0">{children}</div>
      </Container>
    );
  }

  // 單元導覽在前（行動版收合於內容上方）；相關連結在後（行動版接在內容之後）
  if (asidePosition === "end") {
    return (
      <Container className={cn("py-12 lg:py-16", className)}>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 lg:col-span-8">{children}</div>
          <div className="lg:col-span-4">{aside}</div>
        </div>
      </Container>
    );
  }

  return (
    <Container className={cn("py-12 lg:py-16", className)}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-3">{aside}</div>
        <div className="min-w-0 lg:col-span-9">{children}</div>
      </div>
    </Container>
  );
}
