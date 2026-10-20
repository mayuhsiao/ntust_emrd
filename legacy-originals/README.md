# legacy-originals：舊站圖片原始檔備份

這個資料夾保存「搬遷時被修改過的舊站圖片」的**原始檔**（逐位元組相同），由
`scripts/migrate_legacy.py` 自動產生與維護。

- 不在 `public/` 底下，**不會被部署**到網站上，只作為備份與還原來源。
- 腳本**永遠不會刪除**這裡的檔案；請不要手動刪除或修改，並與專案一起保存（版本控制或另行備份）。

## 哪些圖片會被修改（客戶已同意）

| 情況 | 處理方式 |
| --- | --- |
| 寬度超過 2000 px 的 JPEG／PNG／WebP | 縮成 2000 px 寬（先依 EXIF 方向轉正，Pillow LANCZOS；JPEG 品質 85、漸進式；PNG optimize；格式不變、檔名不變） |
| BMP | 無損轉成 PNG（像素完全相同），檔名副檔名改為 `.png`，內文 `<img>` 與 cover 的引用同步改寫；原本的 `.bmp` 只保留在這裡 |

其餘圖片與所有附件（`public/legacy/files/`）都保留原站的原始檔，不會出現在這裡。

## 內容

- `img/`：原始檔，檔名與原本 `public/legacy/img/` 中的檔名相同（例：`img/06a7ceac4c-25.jpg`、`img/d61b3af05d-03.bmp`）。
- `manifest.json`：目前生效的修改清單（陣列，依原始檔路徑排序），每筆欄位：

| 欄位 | 說明 |
| --- | --- |
| `original` | 原始檔的網站路徑（例：`/legacy/img/d61b3af05d-03.bmp`）；備份檔即 `legacy-originals/img/<同檔名>` |
| `current` | 目前網站實際使用的檔案（縮圖時與 `original` 相同；BMP 轉檔時為 `.png`） |
| `reason` | `downscale`（縮圖）、`bmp-to-png`（轉檔）或 `bmp-to-png+downscale` |
| `bytesBefore`／`bytesAfter` | 修改前／後的檔案大小（位元組） |
| `widthBefore`／`widthAfter` | 修改前／後的顯示寬度（px，已考慮 EXIF 方向） |
| `heightBefore`／`heightAfter` | 修改前／後的顯示高度（px） |
| `sha1Before`／`sha1After` | 修改前（＝備份檔）／後的 SHA-1，可用來驗證備份完整 |

彙整數字（張數、總大小）另見 `src/content/legacy/data/report.json` 的 `imageProcessing`。

## 還原成原始圖片

在專案根目錄執行：

```bash
python -X utf8 scripts/migrate_legacy.py --original-images
```

效果：

1. `public/legacy/img/` 中被縮圖的檔案以這裡的原始檔覆蓋回去（位元組與搬遷時下載的原檔完全相同）。
2. BMP 放回 `public/legacy/img/`，轉出來的 `.png` 移除。
3. `src/content/legacy/data/` 中的引用（內文 `<img>`、cover、`redirects.json` 的 `/var/file/...` 轉址）改回原檔名，
   `<img>` 的 width／height 依原始檔重新計算。
4. 本資料夾保持不動（備份與 `manifest.json` 都保留，方便之後再套用）。

還原後要恢復縮圖／轉檔，執行預設指令即可（結果與先前完全相同、可重現）：

```bash
python -X utf8 scripts/migrate_legacy.py
```

其他選項：`--max-image-width 2400` 改用其他縮圖寬度（`0` = 不縮圖，但 BMP 仍轉 PNG）。

### 注意

- 腳本會由 `.legacy-cache/`（原站頁面的 HTTP 快取）重建全部資料；這個快取目前只存在本機（已列入 `.gitignore`）。
  若快取遺失，腳本會改為連線到 `https://emrd.ntust.edu.tw` 重新抓取——新網站上線、取代原站之後就無法再取得
  原站內容，因此請連同 `.legacy-cache/` 一起備份。
- 只想手動還原單一張圖片時：把 `img/<檔名>` 複製回 `public/legacy/img/<檔名>` 即可（縮圖的情況檔名不變、
  引用不必改）；BMP 則還需把內文中的 `.png` 引用改回 `.bmp`——建議直接使用上面的指令，以免資料不一致。
