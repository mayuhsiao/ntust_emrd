/**
 * 部署於子路徑時的網址前綴（例：GitHub Pages 預覽版為 "/ntust_emrd"）；正式網域部署時為空字串。
 * next/link、靜態匯入的圖片與 metadata 會自動加上 basePath；
 * 其餘「原始字串網址」（搬遷內容的連結與圖片、<video src>、fetch 等）請一律經過 withBasePath()。
 */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function withBasePath(path: string) {
  if (!basePath || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === basePath || path.startsWith(`${basePath}/`) || path.startsWith(`${basePath}?`)) {
    return path;
  }
  return `${basePath}${path}`;
}
