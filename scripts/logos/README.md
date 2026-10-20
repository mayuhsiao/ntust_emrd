# 校友公司 Logo 牆：官方 Logo 覆寫資料夾

`scripts/render_logo_wall.py` 會輸出 10 秒的「EMRD 學員與校友任職企業」Logo 牆影片
（`media/videos/emrd-logo-wall-10s.mp4`，media/ 不會部署）。預設**不使用任何第三方商標圖檔**，每家企業都以
Noto Sans TC 排成風格一致的「文字字標磚」。

若日後取得企業同意使用的官方 logo，可以把檔案放進這個資料夾，重新渲染後該企業就會改用 logo 呈現；
沒有放檔案的企業仍維持文字字標，兩者可以混用。

## 放置方式

1. **檔名**：與 `scripts/data/alumni-companies.json` 中該企業的 `display`（畫面顯示名稱）完全相同，副檔名 `.png`。
   - 例：`台積電.png`、`緯創資通.png`、`貿聯 BizLink.png`（含空白）、`Google.png`
   - 也接受以 `name`（資料中的正式名稱）命名，例如 `緯創資通股份有限公司.png`；英文大小寫不拘。
2. **格式**：PNG，**透明背景**效果最好；建議寬度 600 px 以上，圖檔四周不需留白（程式會自動裁切透明邊界）。
3. **SVG 向量檔**：請先轉成透明背景 PNG 再放入，例如：
   - Inkscape：`inkscape logo.svg --export-type=png --export-width=1200`
   - 或用 Illustrator／Figma 匯出 PNG（背景設為透明）。

## 呈現規則（為了整面牆一致）

- logo 會等比縮放，置入磚面中央（最多佔磚寬 78%、磚高 60%）。
- 一律轉為**單色**：一般企業為白色，任職人數 ≥ 2 的重點企業為香檳金；彩色 logo 會成為單色剪影。
- 若檔案是白底等不透明背景，程式會以四個角落的底色自動去背，但效果不如透明背景，建議仍提供透明 PNG。

## 重新渲染

於專案根目錄執行（Windows 請加 `-X utf8`）：

```bash
# 1. 先看 960×540 關鍵格預覽（縮圖總表輸出在 video-preview/logowall_sheet.jpg）
python -X utf8 scripts/render_logo_wall.py --preview

# 2. 確認無誤後正式輸出 1920×1080 影片與封面圖
python -X utf8 scripts/render_logo_wall.py
```

執行時第一行會顯示「官方 logo 覆寫 N 家」，可確認檔名是否對上。

## 更新企業名單

名單來自班級網站的成員資料，只擷取「服務單位」欄位（不讀取姓名、職稱等其他個人資料）：

```bash
python -X utf8 scripts/render_logo_wall.py --extract <班級網站網址>/js/data.js   # 也可以傳本機檔案路徑
```

也可以直接編輯 `scripts/data/alumni-companies.json`：`display` 是畫面上顯示的名稱，
`count` 是任職人數（≥ 2 者以香檳金呈現）。重新擷取會覆寫手動修改，修改顯示名稱的規則請改程式中的 `ALIASES`。

## 文字選項（標題、班別、家數）

片尾文字可用參數調整，不必改程式：

```bash
# 標題（預設「EMRD 學員與校友任職企業」；名單取自 114–115 級學員的目前服務單位，
# 若客戶希望更精確，可改用「EMRD 學員任職企業」）
python -X utf8 scripts/render_logo_wall.py --title "EMRD 學員任職企業"

# 班別名稱（預設「研發碩士在職專班」；品牌片／校友片片尾使用「高階科技研發碩士在職專班」，請客戶擇一統一）
python -X utf8 scripts/render_logo_wall.py --program "高階科技研發碩士在職專班"

# 家數預設顯示名單實際家數（例如「61 家企業」）；只有在確認實際任職企業多於名單時才加「+」
python -X utf8 scripts/render_logo_wall.py --count-plus
```

## 授權提醒

企業 logo 屬各公司商標，放入前請確認已取得使用同意並符合該公司的品牌規範；未取得者保留文字字標即可。
