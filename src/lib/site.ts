/**
 * 全站設定：聯絡資訊、站內路由與對外連結集中於此，年度更新時只需修改本檔。
 * 本站即 EMRD 正式網站（取代原 emrd.ntust.edu.tw，網域沿用）；
 * 內容 1:1 搬遷自原網站（2026-10 擷取），招生資訊另參考 115 學年度碩士在職專班招生簡章。
 */

const SITE_URL = "https://emrd.ntust.edu.tw";
const CONSULT_SUBJECT = "【線上預約諮詢】EMRD 報考諮詢";

export const site = {
  name: "國立臺灣科技大學 研發碩士在職專班",
  shortName: "NTUST EMRD",
  officialName: "高階科技研發碩士學位學程（EMRD）",
  /** 導覽列與頁尾標準字旁的學程名稱（2026-10 依學程要求由「研發碩士在職專班」更名） */
  programName: "高階研發碩士學位學程",
  programAbbr: "EMRD",
  englishName: "Executive Master of Research and Development",
  college: "國立臺灣科技大學 工程學院",
  /** 正式網域，供 metadataBase、canonical 與 Open Graph 使用 */
  url: SITE_URL,
  foundedAcademicYear: 104,

  contact: {
    phone: "(02) 2730-1026",
    phoneHref: "tel:+886227301026",
    email: "emrd@mail.ntust.edu.tw",
    emailHref: "mailto:emrd@mail.ntust.edu.tw",
    address: "106335 臺北市大安區基隆路四段 43 號",
    /** 窄欄排版用的自然斷行 */
    addressLines: ["106335 臺北市大安區", "基隆路四段 43 號"],
    office: "IB-809 學程辦公室",
    officeHours: "週一至週五 09:00–12:00／13:30–17:00",
    officeDays: "週一至週五",
    officeTime: "09:00–12:00／13:30–17:00",
  },

  /**
   * 站內頁面（slug 對應 src/content/legacy/ia.json）。
   * 一律以 next/link 於同一分頁開啟；完整選單結構請改用 src/lib/ia.ts。
   */
  routes: {
    home: "/",
    features: "/about/features",
    courses: "/curriculum/courses",
    theses: "/curriculum/theses",
    executives: "/faculty/executives",
    facultyInternal: "/faculty/internal",
    facultyIndustry: "/faculty/industry",
    speakers: "/faculty/speakers",
    rules: "/study/regulations",
    graduation: "/study/graduation",
    tuition: "/study/tuition",
    forms: "/study/forms",
    alumni: "/study/alumni-update",
    admissionsInfo: "/admissions/info",
    admissionsNews: "/admissions/news",
    audit: "/admissions/audit",
    news: "/news",
    events: "/news/events",
    contact: "/contact",
    campus: "/campus",
    alumniHall: "/alumni-hall",
    privacy: "/privacy",
    sitemap: "/sitemap",
  },

  /** 外部網站與檔案：除 mailto 外，一律另開新視窗 */
  links: {
    /**
     * 最新一份「碩士在職專班招生簡章」PDF（臺科大研教組）。
     * 116 學年度簡章公告後（往年約 10 月底），請替換為新檔網址。
     */
    brochurePdf:
      "https://www.admission.ntust.edu.tw/var/file/52/1052/img/2675/288650388.pdf",
    brochureLabel: "115 學年度碩士在職專班招生簡章",
    admissionsPortal:
      "https://www.admission.ntust.edu.tw/p/412-1052-8737.php?Lang=zh-tw",
    /** 目前以 E-mail 預約；若日後啟用線上預約表單，替換此連結即可。 */
    consultation: `mailto:emrd@mail.ntust.edu.tw?subject=${encodeURIComponent(CONSULT_SUBJECT)}`,
    /** 「學生修業規定」PDF（Google 雲端硬碟；「法規」頁亦列出同一檔案） */
    studyRules:
      "https://drive.google.com/file/d/1SSdNyx6L3sbWRdH6iPpG2H5WPMNR0G8h/view?usp=drive_link",

    ntust: "https://www.ntust.edu.tw",
    /** 工程學院（原網站「常用網站」所列） */
    engineeringCollege: "https://www.ce.ntust.edu.tw/",
    campusMap: "https://www.ntust.edu.tw/p/412-1000-101.php?Lang=zh-tw",
    campusLayout: "https://www.ntust.edu.tw/p/412-1000-102.php?Lang=zh-tw",
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("國立臺灣科技大學")}`,

    facebook: "https://www.facebook.com/EMRDofNTUST/",
    youtube: "https://www.youtube.com/channel/UCFcZjtSCFN6_rEl5AAUUojg",
  },
} as const;

export type Site = typeof site;
export type RouteKey = keyof Site["routes"];
export type ExternalLinkKey = keyof Site["links"];
