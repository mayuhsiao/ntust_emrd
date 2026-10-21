import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { MobileActionBar } from "@/components/layout/MobileActionBar";
import { Navbar } from "@/components/layout/Navbar";
import { AdmissionsCta } from "@/components/sections/AdmissionsCta";
import { BentoGrid } from "@/components/sections/BentoGrid";
import { Community } from "@/components/sections/Community";
import { CurriculumTabs } from "@/components/sections/CurriculumTabs";
import { Faculty } from "@/components/sections/Faculty";
import { Hero } from "@/components/sections/Hero";
import { IntroFeature } from "@/components/sections/IntroFeature";
import { Pathfinder } from "@/components/sections/Pathfinder";
import { SpeakersBand } from "@/components/sections/SpeakersBand";
import { StatStrip } from "@/components/sections/StatStrip";
import { Timeline } from "@/components/sections/Timeline";

// 標題、描述與分享設定沿用根版面；canonical 只屬於首頁，不放在根版面
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Navbar pathname="/" />
      <main id="main" tabIndex={-1} className="outline-none">
        <Hero />
        <Pathfinder />
        <StatStrip />
        <IntroFeature />
        <BentoGrid />
        <CurriculumTabs />
        <SpeakersBand />
        <Faculty />
        <Community />
        <Timeline />
        <AdmissionsCta />
      </main>
      {/* 捲過主視覺後出現；招生時程、招生行動帶與頁尾進入視窗時隱藏 */}
      <MobileActionBar pathname="/" />
      <Footer showCta={false} />
    </>
  );
}
