/**
 * 首頁內容資料。元件只負責版面，文案與數據集中於此維護。
 *
 * 資料來源（2026-10 擷取）：
 * - 原 EMRD 網站（已 1:1 搬遷至本站內頁）：特色簡介、課程地圖（112 學年度起適用）、師資、聯絡資訊
 * - 臺科大 115 學年度碩士在職專班招生簡章（報考資格、甄試方式、重要日程、學分費）
 *
 * 站內連結以 routeKey 指向 site.routes（next/link）；外部連結直接使用 site.links。
 */

import type { StaticImageData } from "next/image";
import tsaiMengLin from "@/assets/faculty/tsai-meng-lin.jpg";
import yuChinYang from "@/assets/faculty/yu-chin-yang.jpg";
import type { PhotoKey } from "@/content/photos";
import type { RouteKey } from "@/lib/site";

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

export const hero = {
  badge: ["前瞻研發", "智慧轉型", "決策領航"],
  titleLines: ["鍛造科技領袖的", "研發戰略與決策思維"],
  subtitle:
    "專為高科技產業技術決策者與研發高階主管打造的碩士在職學程，匯聚跨領域產學頂尖人脈與前瞻智造視野。",
  primaryCta: { label: "查看本年度招生時程", href: "#admissions" },
  secondaryCta: { label: "瀏覽課程模組架構", href: "#curriculum" },
  /** 「特色簡介」頁可佐證的信任標示 */
  credentials: [
    "全國首創技術長（CTO）學程",
    "臺科大工程學院 104 學年度創立",
    "每學期逾 30 位產學專家授課",
  ],
  /** 桌機版右側「下一屆招生」資訊卡 */
  intake: {
    title: "116 學年度招生",
    items: [
      { label: "招生簡章", value: "預計 10 月底公告" },
      { label: "網路報名", value: "預計 11 月下旬起" },
      { label: "招生名額", value: "30 名（115 學年度）" },
    ],
    note: "時程依往年推估，以正式簡章為準",
  },
} as const;

/* ------------------------------------------------------------------ */
/* Utility bar & Pathfinder                                            */
/* ------------------------------------------------------------------ */

/**
 * 導覽列上方工具列：招生快訊。
 * Navbar 以 `/${href}` 組成首頁錨點（/#admissions），故 href 須維持 `#` 開頭。
 */
export const utilityBar = {
  notice: { label: "116 學年度招生簡章預計 10 月底公告", href: "#admissions" },
} as const;

export type PathfinderItem = {
  label: string;
  englishLabel: string;
  description: string;
  href: `#${string}`;
};

/** Hero 下方四格路徑導覽（參考 UniMelb pathfinder） */
export const pathfinder: readonly PathfinderItem[] = [
  {
    label: "專班特色",
    englishLabel: "Why EMRD",
    description: "以企業未來 3–5 年技術藍圖為核心的技術長養成",
    href: "#features",
  },
  {
    label: "前瞻課綱",
    englishLabel: "Curriculum",
    description: "三大課程主軸，45 學分兩年完成",
    href: "#curriculum",
  },
  {
    label: "卓越師資",
    englishLabel: "Faculty",
    description: "產官學研師資，每學期逾 30 位專家授課",
    href: "#faculty",
  },
  {
    label: "招生專區",
    englishLabel: "Admissions",
    description: "116 學年度招生時程與報考資格自我檢視",
    href: "#admissions",
  },
];

/* ------------------------------------------------------------------ */
/* Intro feature（圖文介紹）                                            */
/* ------------------------------------------------------------------ */

/** 取自原網站「特色簡介」（現為 /about/features） */
export const intro = {
  eyebrow: "ABOUT EMRD",
  title: "全國首創的技術長養成學程",
  photo: "executivesInLecture" satisfies PhotoKey,
  paragraphs: [
    "高階科技研發碩士在職專班（EMRD）自 104 學年度由臺科大工程學院首創，系統化培育企業技術長（CTO）人才，提供企業高階人員技術與管理的進修再造管道。",
    "學程以企業結合學界的雙贏模式運作：學員以任職公司未來 3–5 年的技術與產品藍圖作為畢業論文，並與授課師資、同學及企業高階經理人建立技術脈、產業脈與人脈。",
  ],
  points: [
    "學員多為企業資深研發人員與中高階主管",
    "管理、規劃與領導研發團隊的跨域能力",
    "前瞻技術、智財營運與管理並重",
  ],
  link: { label: "閱讀特色簡介", routeKey: "features" satisfies RouteKey },
} as const;

/* ------------------------------------------------------------------ */
/* CTO lecture series（技術長講座）                                     */
/* ------------------------------------------------------------------ */

export type Talk = {
  topic: string;
  speaker: string;
  organization: string;
  year: number;
};

/** 講題取自「演講講座嘉賓」頁（/faculty/speakers） */
export const speakers = {
  eyebrow: "CTO LECTURE SERIES",
  title: "技術長講座：與產業決策者同場對話",
  description:
    "技術長講座（一）（二）為必修課程，歷年邀請科技大廠董事長、總經理、技術長與研發長，分享研發管理與產業決策的第一手經驗。",
  photo: "guestSpeaker" satisfies PhotoKey,
  talks: [
    {
      topic: "產業生命週期決策與趨勢",
      speaker: "何春盛 董事",
      organization: "研華科技",
      year: 2016,
    },
    {
      topic: "企業研發領導人的培養與育成",
      speaker: "馬堅勇 董事長",
      organization: "台灣精材",
      year: 2019,
    },
    {
      topic: "A step to CTO from global business experience",
      speaker: "連監棠 技術長",
      organization: "台達電子",
      year: 2019,
    },
    {
      topic: "工業 4.0 智慧製造及智慧管理",
      speaker: "吳天勝 研發長",
      organization: "漢翔航空",
      year: 2018,
    },
  ] satisfies readonly Talk[],
  /** 「業界推薦」頁（/about/recommendations）節錄 */
  quote: {
    text: "台科大所開設的 EMRD 課程，對於現有理工背景的工程師是很好的進修管道，來培養自己全方位、跨領域、全球化視野的能力。",
    name: "何春盛",
    title: "研華股份有限公司 執行董事",
  },
  link: { label: "歷年演講嘉賓與講題", routeKey: "speakers" satisfies RouteKey },
} as const;

/* ------------------------------------------------------------------ */
/* Community & alumni（社群與校友）                                     */
/* ------------------------------------------------------------------ */

export type CommunityItem = {
  photo: PhotoKey;
  /** 內容類型標籤（參考 UniMelb content-type chip） */
  chip: string;
  title: string;
};

export const community = {
  eyebrow: "COMMUNITY & ALUMNI",
  title: "拾光十年，凝聚科技產業研發領袖",
  description:
    "從新生營、運動大會到校友回娘家，EMRD 學員來自電腦及週邊、半導體、電子零組件、機械製造與資訊服務等產業，畢業後持續以校友網絡延伸跨業交流。",
  items: [
    { photo: "anniversaryHomecoming", chip: "10 週年", title: "EMRD 十週年「拾光・重返校園」" },
    { photo: "anniversarySpeech", chip: "校友回娘家", title: "十週年活動致詞" },
    { photo: "orientationCamp", chip: "新生營", title: "新生營破冰交流" },
    { photo: "alumniSportsDay", chip: "校友會", title: "校友會參與運動大會" },
    { photo: "alumniFamilyDay", chip: "家庭日", title: "校友與家人戶外聚會" },
  ] satisfies readonly CommunityItem[],
  links: [
    { label: "活動集錦", routeKey: "events" },
    { label: "校友專區", routeKey: "alumni" },
    { label: "EMRD 校友薈萃堂", routeKey: "alumniHall" },
  ] satisfies ReadonlyArray<{ label: string; routeKey: RouteKey }>,
} as const;

/* ------------------------------------------------------------------ */
/* Admissions CTA band                                                 */
/* ------------------------------------------------------------------ */

export const admissionsCta = {
  eyebrow: "ADMISSIONS 2027",
  title: "116 學年度招生即將啟動",
  description:
    "招生簡章預計 10 月底公告、11 月下旬起網路報名。歡迎下載簡章，或預約諮詢由學程辦公室協助評估報考資格。",
  photo: "graduation2025" satisfies PhotoKey,
  dates: [
    { label: "招生簡章", value: "預計 10 月底公告" },
    { label: "網路報名", value: "預計 11 月下旬至 12 月中旬" },
    { label: "放榜", value: "預計 3 月中旬" },
  ],
} as const;

/** 頁尾第一層宣言帶 */
export const footerStatement = {
  slogan: "引領研發前瞻，鍛造卓越領導",
  description: "與科技產業的研發領袖同行，從技術藍圖走向決策高度。",
} as const;

/* ------------------------------------------------------------------ */
/* Executive Impact Strip                                              */
/* ------------------------------------------------------------------ */

export type Stat = {
  prefix?: string;
  value: string;
  suffix?: string;
  label: string;
};

/**
 * 首項「10+ 年」：EMRD 於 104 學年度創立（2026-10 客戶確認，原「30+ 年」已更正）。
 * TODO(content): 其餘三項為品牌指定的宣傳數據，仍待招生單位提供佐證（見根目錄「待確認事項.md」）。
 */
export const stats: readonly Stat[] = [
  { value: "10", suffix: "+ 年", label: "深厚研發管理培育基石" },
  { value: "85", suffix: "%+", label: "高科技與半導體產業學員佔比" },
  { value: "100", suffix: "%", label: "實務產學與國際雙軌師資" },
  { prefix: "TOP", value: "1", label: "技職體系工程研發領航典範" },
];

/* ------------------------------------------------------------------ */
/* Bento Grid                                                          */
/* ------------------------------------------------------------------ */

export type BentoIcon = "cpu" | "scale" | "calendar" | "network";

export type BentoCard = {
  id: string;
  icon: BentoIcon;
  /** 卡片背景照片（85% 臺科大藍遮罩） */
  photo: PhotoKey;
  /** lg 以上的欄寬（三欄格線） */
  span: 1 | 2;
  eyebrow: string;
  title: string;
  description: string;
  points: readonly string[];
  tags: readonly string[];
};

export const bento = {
  eyebrow: "WHY EMRD",
  title: "專為技術決策者設計的核心優勢",
  description:
    "以企業未來 3–5 年技術與產品藍圖為核心，串連前瞻技術、智財佈局與高階人脈，讓學習直接轉化為組織的研發戰力。",
  cards: [
    {
      id: "frontier-tech",
      photo: "packagingSeminar",
      icon: "cpu",
      span: 2,
      eyebrow: "Frontier Technology × Smart Manufacturing",
      title: "跨域前瞻技術 × 智慧製造",
      description: "結合半導體、AI 落地與先進製程策略。",
      points: [
        "材料、機械、化工、電子、資工、醫工等 8 個系所教授輪授「科技總論」",
        "與 SEMI-EMRD 半導體學程共享產業資源，掌握供應鏈與先進製程脈動",
        "從技術判讀到量產導入，建立智慧製造與 AI 落地的系統化視野",
      ],
      tags: ["半導體", "AI 落地", "先進製程", "CIM"],
    },
    {
      id: "ip-strategy",
      photo: "strategyLecture",
      icon: "scale",
      span: 1,
      eyebrow: "R&D Management & IP",
      title: "研發管理與智財佈局",
      description: "強化技術商業化、全球專利與投資評估。",
      points: [
        "智慧財產局主管親授專利實務",
        "科技法規、財務分析與投資評估並重",
      ],
      tags: ["專利策略", "技術商業化", "投資評估"],
    },
    {
      id: "flexible-study",
      photo: "auditoriumPanorama",
      icon: "calendar",
      span: 1,
      eyebrow: "Executive Schedule",
      title: "彈性在職修業規劃",
      description: "週五晚間與週六集中授課，兼顧高壓產業工作與學術精進。",
      points: [
        "寒假停課，二下無必修專注論文",
        "畢業論文即企業 3–5 年技術藍圖",
      ],
      tags: ["週五晚＋週六", "在職友善"],
    },
    {
      id: "executive-network",
      photo: "cohortSportsDay",
      icon: "network",
      span: 2,
      eyebrow: "Executive Ecosystem",
      title: "高階決策者生態圈",
      description:
        "各科技大廠研發副總、處長共同研討，拓展高價值產業縱深人脈。",
      points: [
        "同儕多為企業資深研發人員與中高階主管，亦是未來技術長人選",
        "企業高階經理人可擔任論文共同指導，建立技術脈、產業脈與人脈",
      ],
      tags: ["技術長講座", "跨業交流", "校友網絡"],
    },
  ] satisfies readonly BentoCard[],
  /** Card 4 底部的歷屆講座企業（取自「演講講座嘉賓」頁） */
  speakerCompanies: [
    "研華科技",
    "台達電子",
    "聯發科技",
    "台灣 IBM",
    "漢翔航空",
    "台灣精材",
    "閎康科技",
    "上銀科技",
    "Siemens",
    "大同",
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Curriculum                                                          */
/* ------------------------------------------------------------------ */

export type Course = {
  name: string;
  /** 學分數；課程地圖未列者省略 */
  credits?: number;
  type: "必修" | "選修";
  description: string;
  tags: readonly string[];
};

export type CurriculumModule = {
  id: string;
  label: string;
  englishLabel: string;
  summary: string;
  courses: readonly Course[];
};

export const curriculum = {
  eyebrow: "CURRICULUM",
  title: "模組化前瞻課綱",
  description:
    "三大課程主軸對應技術決策者的關鍵能力：前瞻技術判讀、智慧製造系統思維，以及研發策略與組織領導。",
  modules: [
    {
      id: "engineering-rd",
      label: "前瞻工程研發",
      englishLabel: "Advanced Engineering R&D",
      summary:
        "由校內跨系所教授輪授前瞻技術，並以任職企業的技術藍圖為研究主題，將學術方法導入真實研發場域。",
      courses: [
        {
          name: "科技總論（一）",
          credits: 3,
          type: "必修",
          description:
            "材料、機械、電子、資工與醫工等領域教授輪授，掌握半導體材料、先進製程與 AI 等關鍵技術脈動。",
          tags: ["半導體材料", "先進製程", "AI"],
        },
        {
          name: "科技總論（二）",
          credits: 3,
          type: "必修",
          description:
            "延伸探討機械、材料與營建等領域的關鍵技術議題，建立跨域技術判讀與整合能力。",
          tags: ["跨域整合", "技術評估"],
        },
        {
          name: "專題研究（一）（二）",
          credits: 2,
          type: "必修",
          description:
            "以任職企業未來 3–5 年技術或產品藍圖為題，由校內教授與企業高階主管共同指導。",
          tags: ["技術藍圖", "產學共研"],
        },
        {
          name: "實務專題研究",
          credits: 1,
          type: "選修",
          description: "聚焦企業實際研發課題，進行深度實務專題探討。",
          tags: ["實務研發"],
        },
      ],
    },
    {
      id: "smart-manufacturing",
      label: "智慧科技與製造系統",
      englishLabel: "Smart Technology & Manufacturing Systems",
      summary:
        "從產業情報、技術地圖到智慧製造現場，建立 AIoT 與半導體供應鏈的系統化視野。",
      courses: [
        {
          name: "科技產業趨勢與策略分析",
          credits: 3,
          type: "選修",
          description:
            "由資策會產業情報研究所（MIC）專家主講，解析 AIoT、半導體與智慧製造的產業趨勢與策略。",
          tags: ["AIoT", "產業情報", "半導體"],
        },
        {
          name: "科技與產業地圖分析",
          credits: 3,
          type: "選修",
          description:
            "運用產業地圖與技術地圖方法，判讀供應鏈結構、技術缺口與佈局機會。",
          tags: ["技術地圖", "供應鏈"],
        },
        {
          name: "軟性半導體與展望",
          type: "選修",
          description:
            "探討軟性電子與新興半導體材料的技術發展、應用場景與產業化前景。",
          tags: ["軟性電子", "新興材料"],
        },
        {
          name: "企業參訪",
          type: "選修",
          description:
            "走訪國內外科技企業與智慧製造現場，連結課堂知識與產線實務。",
          tags: ["智慧製造", "CIM"],
        },
      ],
    },
    {
      id: "strategy-leadership",
      label: "研發策略與組織領導",
      englishLabel: "R&D Strategy & Leadership",
      summary:
        "向科技大廠董事長、技術長學習決策實戰，並建立研發策略、組織領導與智財佈局的完整框架。",
      courses: [
        {
          name: "技術長講座（一）（二）",
          credits: 4,
          type: "必修",
          description:
            "邀請科技大廠董事長、技術長與研發長親臨分享，直擊高階研發決策的實戰經驗。",
          tags: ["CTO 視野", "決策實戰"],
        },
        {
          name: "管理（一）（二）",
          credits: 6,
          type: "必修",
          description:
            "由企管、工管與財金領域教授授課，建立策略、組織與財務管理的系統化框架。",
          tags: ["經營管理", "財務決策"],
        },
        {
          name: "專利（一）／科技法規總論（一）",
          credits: 6,
          type: "必修",
          description:
            "智慧財產局主管與科技法律專家授課，建立全球專利布局與科技法規的完整思維。",
          tags: ["專利策略", "智財佈局", "科技法律"],
        },
        {
          name: "研發策略管理／研發領導與管理",
          credits: 6,
          type: "選修",
          description:
            "由科技企業執行長與前大廠資深副總暨技術長授課，剖析研發組合、資源配置與團隊領導。",
          tags: ["研發策略", "組織領導"],
        },
      ],
    },
  ] satisfies readonly CurriculumModule[],
  footnote: "課程依 112 學年度起適用之課程地圖及近期開課資料整理，每學期課程可能微調，請以當學期課表為準。",
} as const;

/* ------------------------------------------------------------------ */
/* 修業規定                                                             */
/* ------------------------------------------------------------------ */

export type Requirement = { label: string; value: string; detail: string };

export const requirements = {
  eyebrow: "PROGRAM REQUIREMENTS",
  title: "修業規定",
  items: [
    {
      label: "畢業學分",
      value: "45 學分",
      detail: "必修 24 學分（專業核心 12、智財核心 6、專業必修 6）＋選修 21 學分",
    },
    {
      label: "修業年限",
      value: "2 年（1–4 年）",
      detail: "一上、一下、一暑、二上、二下共 5 學期；寒假停課（約 1 月中至 2 月中）",
    },
    {
      label: "學位論文",
      value: "企業技術藍圖",
      detail: "以任職公司未來 3–5 年技術或產品藍圖為題；修畢 45 學分後可申請學位口試",
    },
    {
      label: "學分費",
      value: "NT$11,000／學分",
      detail: "每學期基本學分費 99,000 元，共收 5 學期；學雜費基數每學期 15,380 元（115 學年度標準）",
    },
  ] satisfies readonly Requirement[],
} as const;

/* ------------------------------------------------------------------ */
/* Faculty                                                             */
/* ------------------------------------------------------------------ */

export type Leader = {
  role: string;
  name: string;
  englishName: string;
  title: string;
  education: string;
  /** 大頭照（取自「現任執行長 / 副執行長」頁 /faculty/executives，裁為 3:4） */
  portrait: StaticImageData;
};

export type FacultyHighlight = {
  name: string;
  organization: string;
  position: string;
  course: string;
};

export const faculty = {
  eyebrow: "FACULTY",
  title: "產官學研卓越師資",
  description:
    "整合臺科大跨學院師資，並延攬政府機關首長、科技大廠高階主管與法人智庫專家擔任業師，理論與實務並重。",
  leaders: [
    {
      role: "執行長",
      name: "游進陽",
      englishName: "Chin-Yang Yu",
      title: "臺科大材料系 教授",
      education: "英國曼徹斯特大學 化學博士",
      portrait: yuChinYang,
    },
    {
      role: "副執行長",
      name: "蔡孟霖",
      englishName: "Meng-Lin Tsai",
      title: "臺科大材料系 副教授",
      education: "國立清華大學 材料科學與工程博士",
      portrait: tsaiMengLin,
    },
  ] satisfies readonly Leader[],
  metrics: [
    { value: "30+", label: "每學期校內外授課專家" },
    { value: "13", label: "跨域合授的校內系所" },
    { value: "20+", label: "產官學研業界與他校師資" },
  ],
  /** 取自「外校 & 業界師資」與「校內師資」頁（112-02 更新），師資依學期異動 */
  highlights: [
    {
      name: "廖承威",
      organization: "經濟部智慧財產局",
      position: "局長",
      course: "專利（一）",
    },
    {
      name: "龔紹祖",
      organization: "前仁寶電腦",
      position: "資深副總暨技術長",
      course: "研發領導與管理",
    },
    {
      name: "詹文男",
      organization: "資策會產業情報研究所（MIC）",
      position: "顧問／前所長",
      course: "科技產業趨勢與策略分析",
    },
    {
      name: "張智強",
      organization: "皇輝科技",
      position: "執行長",
      course: "研發策略管理",
    },
    {
      name: "劉必榮",
      organization: "東吳大學政治系",
      position: "教授",
      course: "談判理論與實務",
    },
    {
      name: "陳明志",
      organization: "臺科大工程學院",
      position: "院長",
      course: "企業參訪",
    },
  ] satisfies readonly FacultyHighlight[],
  footnote: "師資依學程公告整理，每學期授課教師可能異動。",
} as const;

/* ------------------------------------------------------------------ */
/* Admissions Timeline                                                 */
/* ------------------------------------------------------------------ */

export type TimelineStep = {
  step: number;
  title: string;
  /** 依 115 學年度實際日程推估的 116 學年度時程 */
  period: string;
  description: string;
  details: readonly string[];
};

export const admissions = {
  eyebrow: "ADMISSIONS ROADMAP",
  title: "116 學年度菁英入學 Roadmap",
  description:
    "招生考試採書面審查 50%＋口試 50%。審查成績優異者（招生名額 50% 以內）得直接錄取、免參加口試。",
  notice:
    "下列時程依 115 學年度實際日程推估，正式日期以 116 學年度招生簡章公告為準。",
  quota: "115 學年度招生名額 30 名",
  /** 區塊底部延伸連結（招生資訊、招生公告、隨班附讀）的說明 */
  moreInfo: "歷年招生公告、報考常見 Q&A 與隨班附讀辦法，請見招生專區。",
  steps: [
    {
      step: 1,
      title: "招生簡章公告與線上報名",
      period: "10 月底公告｜11 月下旬至 12 月中旬報名",
      description: "一律網路報名並上傳審查資料，逾期恕不受理。",
      details: ["報名費 NT$2,500", "報名期間系統 24 小時開放"],
    },
    {
      step: 2,
      title: "專業書面審查",
      period: "1 月中旬公告書審成績與口試名單",
      description:
        "著重研發成就與領導歷練。必繳 EMRD 報考申請表、畢業證書與工作年資證明；自傳、推薦信、證照與得獎紀錄可加分。",
      details: ["審查成績佔 50%", "優異者得直接錄取"],
    },
    {
      step: 3,
      title: "專家委員會綜合面試",
      period: "2 月下旬至 3 月初",
      description:
        "由學程專家委員會進行綜合面試，深度了解您的研發歷程、管理視野與進修規劃。",
      details: ["口試成績佔 50%", "到校實體口試", "口試費 NT$500"],
    },
    {
      step: 4,
      title: "榜單公告與學位起航",
      period: "3 月中旬放榜｜9 月入學",
      description:
        "放榜後完成網路報到，9 月正式啟程，與科技產業菁英同儕共同展開兩年的研發戰略修練。",
      details: ["網路報到與備取遞補", "9 月開學"],
    },
  ] satisfies readonly TimelineStep[],
  eligibility: {
    title: "報名資格快速自我檢視",
    description: "勾選下列條件，快速確認是否符合 EMRD 基本報考資格。",
    items: [
      {
        id: "degree",
        label: "具學士學位",
        detail: "或符合「入學大學同等學力認定標準」第五條之碩士班報考資格。",
      },
      {
        id: "experience",
        label: "取得學歷後累計 6 年以上工作年資",
        detail: "年資計算至入學當年 8 月 31 日止，服義務役年資不列計。",
      },
      {
        id: "proof",
        label: "可提供工作年資證明",
        detail: "個人勞保投保明細，或公司開立之服務證明。",
      },
      {
        id: "interview",
        label: "可於口試期間到校參加實體口試",
        detail: "報名繳費後不得以無法到校為由要求退費。",
      },
    ],
    successMessage: "您已符合 EMRD 基本報考資格，歡迎下載簡章並準備報名。",
    pendingMessage: "尚有條件未確認，歡迎來電或來信由學程辦公室協助判斷。",
    disclaimer:
      "本檢視僅供參考，二／五專、三專學歷及同等學力之年資計算方式，請依當年度招生簡章規定。",
  },
} as const;
