/**
 * 首頁照片素材（來源：EMRD 活動照片，reference_photo/）。
 * 以靜態匯入交給 next/image 產生 AVIF／WebP 與模糊預覽；position 為 object-position 焦點。
 * 照片中可辨識的當事人已同意使用（2026-10 客戶確認）；新增照片時請比照取得同意。
 */
import type { StaticImageData } from "next/image";
import heroStill from "@/assets/hero-still.jpg";
import alumniFamilyDay from "@/assets/photos/alumni-family-day.jpg";
import alumniSportsDay from "@/assets/photos/alumni-sports-day.jpg";
import anniversaryHomecoming from "@/assets/photos/anniversary-homecoming.jpg";
import anniversarySpeech from "@/assets/photos/anniversary-speech.jpg";
import auditoriumPanorama from "@/assets/photos/auditorium-panorama.jpg";
import cohortSportsDay from "@/assets/photos/cohort-sports-day.jpg";
import executivesInLecture from "@/assets/photos/executives-in-lecture.jpg";
import graduation2025 from "@/assets/photos/graduation-2025.jpg";
import guestSpeaker from "@/assets/photos/guest-speaker.jpg";
import lectureHall from "@/assets/photos/lecture-hall.jpg";
import orientationCamp from "@/assets/photos/orientation-camp.jpg";
import packagingSeminar from "@/assets/photos/packaging-seminar.jpg";
import strategyLecture from "@/assets/photos/strategy-lecture.jpg";

export type Photo = {
  src: StaticImageData;
  alt: string;
  /** CSS object-position */
  position: string;
};

export const photos = {
  heroStill: {
    src: heroStill,
    alt: "臺科大校徽在晶圓與智慧工廠網絡上方發光的動畫畫面",
    position: "64% 45%",
  },
  executivesInLecture: {
    src: executivesInLecture,
    alt: "身著西裝的貴賓與在職學員坐在階梯教室聆聽講座",
    position: "42% 40%",
  },
  packagingSeminar: {
    src: packagingSeminar,
    alt: "業界講師於研討教室講授異質整合封裝技術，學員以筆電參與",
    position: "60% 60%",
  },
  strategyLecture: {
    src: strategyLecture,
    alt: "講者手持麥克風於教室前方演講，身後投影片探討典範轉移下的產業新贏家",
    position: "40% 50%",
  },
  auditoriumPanorama: {
    src: auditoriumPanorama,
    alt: "在職學員坐在講堂座位上聆聽前方講者簡報",
    position: "50% 50%",
  },
  cohortSportsDay: {
    src: cohortSportsDay,
    alt: "身穿藍色 Polo 衫的 EMRD 學員於臺科大運動會比讚合影，前方展開臺科大旗幟",
    position: "55% 35%",
  },
  lectureHall: {
    src: lectureHall,
    alt: "身穿藍色 Polo 衫的在職學員於階梯講堂聆聽講者簡報",
    position: "55% 65%",
  },
  guestSpeaker: {
    src: guestSpeaker,
    alt: "講者站在講台旁手持麥克風分享，背景為木質格柵牆面",
    position: "45% 30%",
  },
  anniversaryHomecoming: {
    src: anniversaryHomecoming,
    alt: "EMRD 十週年「拾光・重返校園」活動，校友於階梯講堂擺出趣味手勢合影",
    position: "50% 60%",
  },
  anniversarySpeech: {
    src: anniversarySpeech,
    alt: "講者於「拾光 EMRD 10 週年」背板前持麥克風致詞",
    position: "50% 40%",
  },
  orientationCamp: {
    src: orientationCamp,
    alt: "EMRD 新生營學員身穿藍色 Polo 衫，於「TAIWAN TECH」字樣講堂比心合影",
    position: "50% 45%",
  },
  alumniSportsDay: {
    src: alumniSportsDay,
    alt: "高階科技研發碩士校友會成員於臺科大運動大會場邊持旗合影",
    position: "50% 60%",
  },
  alumniFamilyDay: {
    src: alumniFamilyDay,
    alt: "EMRD 校友與家人於戶外草地大樹下大合照",
    position: "50% 65%",
  },
  graduation2025: {
    src: graduation2025,
    alt: "2025 年畢業典禮，畢業生與師長身著學位服於台上合影",
    position: "50% 55%",
  },
} satisfies Record<string, Photo>;

export type PhotoKey = keyof typeof photos;
