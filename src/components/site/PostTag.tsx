import { Tag } from "@/components/ui/Tag";

type PostTagProps = {
  tag: string;
  /** 深藍底（頁首）使用 */
  inverted?: boolean;
  className?: string;
};

/** 依原站標籤語意配色：活動／招生為臺科大藍、喜訊為香檳金，其餘公告類為鈦金屬 */
export function tagTone(tag: string, inverted = false) {
  if (inverted) return /喜訊|恭賀/.test(tag) ? "champagne-inverted" : "inverted";
  if (/喜訊|恭賀/.test(tag)) return "champagne";
  if (/活動|招生/.test(tag)) return "brand";
  return "titanium";
}

/** 標題開頭「[活動]」等標籤的晶片樣式（純展示，可用於 Server 與 Client Components） */
export function PostTag({ tag, inverted = false, className }: PostTagProps) {
  return (
    <Tag tone={tagTone(tag, inverted)} className={className}>
      {tag}
    </Tag>
  );
}
