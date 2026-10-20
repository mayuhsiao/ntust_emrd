import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { site } from "@/lib/site";

/** 與 app/opengraph-image.alt.txt 同步（讀取失敗時退回站名） */
function defaultImageAlt() {
  try {
    const alt = fs
      .readFileSync(path.join(process.cwd(), "src", "app", "opengraph-image.alt.txt"), "utf8")
      .trim();
    return alt || site.name;
  } catch {
    return site.name;
  }
}

/**
 * 子頁面一旦定義 openGraph，根層 app/opengraph-image.jpg 便不再自動帶入，
 * 因此內頁明確補回預設分享圖（1200×630）。路徑由根版面的 metadataBase 轉為絕對網址。
 * 僅供 Server 端的 generateMetadata／metadata 使用。
 */
const DEFAULT_IMAGE = {
  url: "/opengraph-image.jpg",
  width: 1200,
  height: 630,
  alt: defaultImageAlt(),
};

/* ------------------------------------------------------------------ */
/* 分享圖尺寸檢查                                                       */
/* ------------------------------------------------------------------ */

/** 大圖卡片（summary_large_image，約 1.91:1）可用的最小尺寸 */
const SHARE_MIN_WIDTH = 600;
const SHARE_MIN_HEIGHT = 315;

type Size = { width: number; height: number };

/** 由檔頭讀取 PNG／GIF／WebP／JPEG 的像素尺寸（不支援的格式回傳 undefined） */
function imageSize(buffer: Buffer): Size | undefined {
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 10 && buffer.toString("latin1", 0, 4) === "GIF8") {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  }
  if (
    buffer.length >= 30 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    const chunk = buffer.toString("latin1", 12, 16);
    if (chunk === "VP8 ") {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") {
      return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    }
    return undefined;
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    // 逐段略過 JPEG 區段，直到 SOF（C0–CF，不含 C4 DHT、C8、CC DAC）
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) return undefined;
      const marker = buffer[offset + 1];
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  return undefined;
}

const sizeCache = new Map<string, Size | null>();

/**
 * 站內圖片（public/ 下）的像素尺寸；外部網址或讀取失敗時為 undefined。
 * 於建置時產生 metadata 時讀取（搬遷素材未打包進伺服器函式，執行期讀不到時一律視為未知）。
 */
function localImageSize(url: string): Size | undefined {
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("..")) return undefined;
  const cached = sizeCache.get(url);
  if (cached !== undefined) return cached ?? undefined;
  let size: Size | undefined;
  try {
    const file = path.join(process.cwd(), "public", decodeURI(url.split(/[?#]/)[0]));
    size = imageSize(fs.readFileSync(file));
  } catch {
    size = undefined;
  }
  sizeCache.set(url, size ?? null);
  return size;
}

/**
 * 適合作為大圖分享卡片的圖片：寬至少 600、高至少 315，且非直式（直式圖會被裁成 1.91:1）。
 * 無法確認尺寸者（外部網址、讀取失敗）不採用，改用預設分享圖。
 */
function shareableImage(image: { url: string; alt: string }) {
  const size = localImageSize(image.url);
  if (!size) return undefined;
  const { width, height } = size;
  if (width < SHARE_MIN_WIDTH || height < SHARE_MIN_HEIGHT || height > width) return undefined;
  return { ...image, width, height };
}

/* ------------------------------------------------------------------ */

type OpenGraphOptions = {
  title: string;
  description: string;
  url: string;
  type?: "website" | "article";
  /** 文章封面等站內圖片；省略、尺寸過小或為直式時使用預設分享圖 */
  image?: { url: string; alt: string };
};

/** 內頁的 Open Graph 設定（標題附上站名，與 title template 一致） */
export function interiorOpenGraph({
  title,
  description,
  url,
  type = "website",
  image,
}: OpenGraphOptions): NonNullable<Metadata["openGraph"]> {
  return {
    type,
    locale: "zh_TW",
    siteName: site.shortName,
    title: `${title}｜${site.shortName}`,
    description,
    url,
    images: [(image && shareableImage(image)) ?? DEFAULT_IMAGE],
  };
}
