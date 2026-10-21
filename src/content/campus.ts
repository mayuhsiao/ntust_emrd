/**
 * 校園地圖資料（/campus）。
 *
 * 地圖：臺科大官網「校內配置圖」2025-12-05 版（https://www.ntust.edu.tw/p/412-1000-102.php），
 *       取高解析度圖檔左側的地圖本體（右側圖例改以本頁清單呈現），縮為 2400 × 1948。
 * 建物編號、名稱與進駐單位：同頁「校內配置圖文字說明」（https://www.ntust.edu.tw/p/404-1000-88778.php）。
 * x／y：建物編號圓圈在地圖上的位置（佔圖寬／圖高的百分比）。學校更新配置圖時，請一併核對編號與座標。
 */

import { site } from "@/lib/site";

export type CampusCategory = "admin" | "academic" | "public" | "dorm" | "access";

export type EmrdNote = {
  label: string;
  room: string;
};

export type CampusSpot = {
  /** 清單與地圖共用的識別碼 */
  id: string;
  /** 官方配置圖上的編號；出入口與交通點沒有編號 */
  number?: number;
  /** 大樓代碼（AD、IB…） */
  code?: string;
  name: string;
  category: CampusCategory;
  x: number;
  y: number;
  /** 進駐單位（官方文字說明） */
  units?: readonly string[];
  /** EMRD 相關空間 */
  emrd?: readonly EmrdNote[];
};

export const campusCategories: ReadonlyArray<{
  key: CampusCategory;
  label: string;
  englishLabel: string;
}> = [
  { key: "academic", label: "教學大樓", englishLabel: "Academic Buildings" },
  { key: "admin", label: "行政處室", englishLabel: "Administration" },
  { key: "public", label: "公共區域", englishLabel: "Public Area" },
  { key: "dorm", label: "宿舍區域", englishLabel: "Dormitory" },
  { key: "access", label: "出入口與交通", englishLabel: "Gates & Shuttles" },
];

export const campusSpots: readonly CampusSpot[] = [
  /* 行政處室 */
  {
    id: "1", number: 1, code: "AD", name: "行政大樓", category: "admin", x: 57.71, y: 68.58,
    units: ["校長室", "副校長室", "秘書室", "主計室", "人事室", "教務處", "總務處", "校史室"],
  },
  {
    id: "2", number: 2, code: "S", name: "學生活動中心", category: "admin", x: 30.42, y: 51.44,
    units: ["學生事務處", "原住民族學生資源中心"],
  },
  {
    id: "3", number: 3, name: "體育館", category: "admin", x: 19.25, y: 50.21,
    units: ["體育室", "衛生保健組（健康中心）"],
  },
  {
    id: "4", number: 4, code: "IB", name: "國際大樓", category: "admin", x: 69.63, y: 79.11,
    units: [
      "研究發展處", "國際事務處", "環境保護暨安全衛生室", "臺巴科技大學專案辦公室", "推廣教育中心",
      "語言中心", "教學發展中心", "教務處綜合業務組", "學生學習中心學習討論室", "財務金融研究所",
      "色彩與照明科技研究所", "國際大樓會議室", "IB 展覽會場 A 區／B 區",
    ],
    emrd: [{ label: "EMRD 學程辦公室", room: site.contact.office.split(" ")[0] }],
  },
  {
    id: "5", number: 5, code: "T3", name: "第三教學大樓", category: "admin", x: 30.29, y: 43.12,
    units: ["總務處保管組", "總務處檔案室"],
  },
  {
    id: "6", number: 6, code: "IA", name: "醫揚大樓", category: "admin", x: 12.67, y: 55.24,
    units: [
      "尖端薄膜材料研究中心", "鈊象臺科 AI 遊戲研發中心", "數位發展研究中心", "國立臺灣科技大學校友總會",
      "產學營運處", "創新育成中心", "企業服務中心", "智財技轉中心", "國際產學聯盟推動辦公室",
      "無線通訊與電磁相容技術研發中心", "物聯網創新中心", "通識教育中心", "資通安全研究與教學中心",
      "永續發展與校務研究中心",
    ],
  },

  /* 教學大樓 */
  {
    id: "7", number: 7, code: "T1", name: "第一教學大樓", category: "academic", x: 36.17, y: 71.97,
    units: ["工程學院", "自動化及控制研究所"],
    // 校友薈萃堂：見「EMRD 校友薈萃堂」頁（/alumni-hall）
    emrd: [{ label: "EMRD 校友薈萃堂", room: "T1-300" }],
  },
  {
    id: "8", number: 8, code: "E1", name: "工程一館", category: "academic", x: 41.79, y: 59.91,
    units: ["機械工程系", "材料科學與工程系"],
    // 108 學年度起的 EMRD 專屬教室：見文章 76740「新教室啟用入厝 Party」
    emrd: [{ label: "EMRD 專屬教室", room: "E1-306" }],
  },
  {
    id: "9", number: 9, code: "E2", name: "工程二館", category: "academic", x: 71.46, y: 59.96,
    units: ["化學工程系", "營建工程系"],
  },
  {
    id: "10", number: 10, code: "MA", name: "管理大樓", category: "academic", x: 69.83, y: 45.48,
    units: ["管理學院", "工業管理系", "企業管理系", "資訊管理系", "管理研究所"],
  },
  {
    id: "11", number: 11, code: "EE", name: "電資館", category: "academic", x: 73.29, y: 37.42,
    units: ["電子工程系", "電機工程系", "光電工程研究所"],
  },
  {
    id: "12", number: 12, code: "T2", name: "第二教學大樓", category: "academic", x: 80.29, y: 42.86,
    units: ["電資學院"],
  },
  {
    id: "13", number: 13, code: "RB", name: "綜合研究大樓", category: "academic", x: 40.63, y: 80.39,
    units: ["設計學院", "建築系", "設計系", "電子計算機中心", "RB101 會議室", "國際會議室", "演講廳"],
  },
  {
    id: "14", number: 14, code: "T4", name: "第四教學大樓", category: "academic", x: 38.54, y: 67.71,
    units: ["人文社會學院", "應用外語系", "數位學習與教育研究所", "人文社會學科", "師資培育中心", "資訊工程系"],
  },
  {
    id: "15", number: 15, code: "TR", name: "研揚大樓", category: "academic", x: 13.54, y: 72.23,
    units: [
      "應用科技學院", "應用科技研究所", "醫學工程研究所", "科技管理研究所", "專利研究所",
      "應用科技學士學位學程", "不分系學士班", "新竹分部辦公室",
    ],
  },
  {
    id: "16", number: 16, name: "浩揚實驗大樓", category: "academic", x: 68.42, y: 34.19,
    units: ["產學創新學院", "臺灣高速 3D 列印研究中心"],
  },

  /* 公共區域 */
  { id: "17", number: 17, name: "圖書館", category: "public", x: 48.42, y: 76.8 },
  { id: "18", number: 18, code: "AU", name: "視聽館", category: "public", x: 42.08, y: 71.61 },
  { id: "19", number: 19, name: "游泳池", category: "public", x: 18.83, y: 42.76 },
  { id: "20", number: 20, name: "活動中心第二餐廳", category: "public", x: 34.92, y: 56.26 },
  { id: "21", number: 21, name: "郵局", category: "public", x: 34.58, y: 58.57 },
  { id: "22", number: 22, name: "活動中心第一餐廳", category: "public", x: 33.13, y: 60.42 },
  { id: "23", number: 23, name: "醫揚餐廳", category: "public", x: 14.75, y: 57.7 },
  { id: "24", number: 24, name: "第二教學大樓餐廳", category: "public", x: 74.5, y: 50.72 },
  { id: "25", number: 25, name: "碩博士停車場", category: "public", x: 94.04, y: 23.97 },

  /* 宿舍區域 */
  { id: "26", number: 26, name: "第一學生宿舍", category: "dorm", x: 39.04, y: 35.32 },
  { id: "27", number: 27, name: "第二學生宿舍", category: "dorm", x: 60.08, y: 35.11 },
  { id: "28", number: 28, name: "第三學生宿舍", category: "dorm", x: 53.58, y: 33.93 },
  { id: "29", number: 29, name: "職務一舍", category: "dorm", x: 58.79, y: 23.0 },
  { id: "30", number: 30, name: "職務二舍", category: "dorm", x: 65.5, y: 23.87 },
  { id: "31", number: 31, name: "職務三舍", category: "dorm", x: 72.04, y: 24.59 },
  { id: "32", number: 32, name: "國際會館一館", category: "dorm", x: 48.67, y: 36.04 },
  { id: "33", number: 33, name: "國際會館二館", category: "dorm", x: 27.0, y: 41.84 },

  /* 出入口與交通（配置圖上的圖示，無編號） */
  { id: "gate", name: "大門（基隆路四段）", category: "access", x: 60.63, y: 84.7 },
  { id: "shuttle-huaxia", name: "華夏校區交通接駁車", category: "access", x: 55.42, y: 81.31 },
  { id: "shuttle-ntu", name: "三校接駁車（往臺大、師大）", category: "access", x: 84.38, y: 68.07 },
];

/** 本頁預設標示的建物：EMRD 專屬教室所在的工程一館 */
export const defaultSpotId = "8";

/** 快速定位（EMRD 相關空間），依學程辦公室、專屬教室、校友薈萃堂排列 */
export const emrdQuickSpots: ReadonlyArray<{ spotId: string; label: string; room: string }> =
  ["4", "8", "7"].flatMap((id) => {
    const spot = campusSpots.find((item) => item.id === id);
    return (spot?.emrd ?? []).map((note) => ({ spotId: id, label: note.label, room: note.room }));
  });

/** 建物顯示名稱：「8 E1 工程一館」中的「E1 工程一館」 */
export function spotTitle(spot: CampusSpot) {
  return spot.code ? `${spot.code} ${spot.name}` : spot.name;
}
