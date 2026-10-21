#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
migrate_legacy.py — 舊版 EMRD 網站（https://emrd.ntust.edu.tw，rpage CMS）內容 1:1 搬遷腳本

客戶需求：「原始的素材，就1:1的搬過來」— 每個頁面、文章、表格、圖片、影片嵌入與附件都要完整搬移，
只有呈現方式（樣式）由新網站重新設計。本腳本會「即時」抓取原站（可重複執行、結果具冪等性），
清洗 HTML 後輸出成 src/content/legacy/types.ts 定義的資料格式。

用法（於專案根目錄執行；Windows 主控台請加 -X utf8）：
    python -X utf8 scripts/migrate_legacy.py             # 優先使用 .legacy-cache/ 中的 HTTP 快取
    python -X utf8 scripts/migrate_legacy.py --refresh   # 略過快取，重新抓取所有頁面並重新下載檔案
    python -X utf8 scripts/migrate_legacy.py --prune     # 另外刪除 public/legacy/ 中本次未使用的舊檔案
    python -X utf8 scripts/migrate_legacy.py --original-images  # 還原：圖片全部改回原始檔（BMP 不轉檔、不縮圖），
                                                                # 由 legacy-originals/ 取回被修改過的原檔並改回引用
    python -X utf8 scripts/migrate_legacy.py --max-image-width 2400   # 改用其他縮圖寬度（預設 2000；0 = 不縮圖）
    python -X utf8 scripts/migrate_legacy.py --no-weebly-mirror        # 不由 Weebly 預覽主機下載（預設會下載）

圖片處理（客戶已同意；預設）：
    * 寬度超過 2000 px 的 JPEG／PNG／WebP／BMP 縮成 2000 px 寬（先依 EXIF 方向轉正、Pillow LANCZOS；
      JPEG 品質 85 漸進式、PNG optimize；格式不變）。
    * BMP 一律無損轉成 PNG（像素相同），引用（html、cover）改為 .png。
    * 被修改（縮圖或轉檔）的原始檔在修改前逐位元組備份到 legacy-originals/img/（與 public/legacy/img 同檔名；
      不在 public/ 下、不會部署），對照表在 legacy-originals/manifest.json；還原方式見 legacy-originals/README.md。
    * html 中每個本地 <img> 都帶 width／height（依實際檔案〔縮圖後〕的比例；原站有設定顯示寬度時沿用該寬度），
      前端不必讀檔判斷尺寸。

輸出：
    src/content/legacy/data/pages/<slug>.json         LegacyPage（slug 中的 "/" 以 "__" 取代）
    src/content/legacy/data/collections/<slug>.json   LegacyCollection（文章順序與原站相同：新到舊）
    src/content/legacy/data/posts/<id>.json           LegacyPost
    src/content/legacy/data/redirects.json            舊網址 → 新網址（供 next.config 301 轉址；含 /var/file/... 檔案路徑，
                                                      以及含查詢字串的 /app/index.php?Action=downloadfile&… 檔案網址）
    src/content/legacy/data/report.json               搬遷報告（數量、未解析連結、下載失敗、圖片縮圖／轉檔…）
    public/legacy/img/、public/legacy/files/          下載的圖片與附件（檔名為 ASCII、可重現）
    legacy-originals/img/、legacy-originals/manifest.json   被縮圖／轉檔圖片的原始檔備份（不部署）
    .private-originals/                               因個資保護而移除／修改前的原始檔與對照表 manifest.json
                                                      （.gitignore 排除：只留本機、不部署、不進 git；見 PRIVACY_REDACTIONS）

資訊架構（舊代碼 → 新路徑）以 src/content/legacy/ia.json 為準；若日後在 ia.json 新增頁面或單元，
重新執行本腳本即可。

原站結構重點（rpage CMS）：
    * 主要內容在 <div id="Dyn_2_3">；麵包屑在 #Dyn_2_2（本腳本不需要）。
    * 412-1039-<代碼>.php：選單／分類頁，標題 <h2 class="mt-title">，內文 .mpgdetail .meditor，
      部分分類頁另有條目清單（#pageptlist，連到 405 文章或 450 連結；可能分頁 -2.php…）。
    * 403-1039-<單元>[-<頁碼>].php：文章列表（#pageptlist），以 totalPage 分頁。
    * 406-1039-<id>,r<單元>.php／405-1039-<id>,c<分類>.php／404-1039-<id>.php：文章（同一篇可有多種網址），
      標題 <h2 class="hdline">，內文 .mpgdetail .meditor，附件區塊 .module-ptattach。
    * 相片輯：文章／頁面的「相片」不在 .meditor 內，而是主模組中 .mpgdetail 前或後的
      div.mcarousel（owl-carousel）> figure.figBS > img + figcaption。單張相片時另有一份
      style="display:none" 的手機版副本（ImageList2），依 src 去重。搬移為 <figure><img><figcaption>，
      位置（內文之前／之後）與原站 DOM 順序相同；原站列表縮圖即取自相片輯第一張，因此作為 cover。
    * 450-1039-<id>,c<n>.php：連結紀錄，以 HTTP 302 轉到目標網址（本腳本不跟隨到外站，只讀 Location）。
    * 16-1039-<id>.php：友善列印版本（只做轉址；例外：連結紀錄的目標已下架時，列印版本仍保有該則公告的
      完整內文 — 例：83957 — 因此改由列印版本搬移內文）。列印版本沒有 #Dyn_2_3，內容在 .module-detail。
    * 影音專區（403-1039-2092）的列表條目本身有內文（.mdetail .meditor：YouTube 播放器＋日期），
      條目標題則連到相關文章；搬移時以列表內文作為該則（連結型）文章的內文，並保留相關文章連結。
    * 412-1039-7696／7721／7723／7724 為原站隱藏的分類鏡像（ia.json aliases），其中的文章網址
      （405-1039-<id>,c7696.php 等）與分頁都會加入轉址。
    * 原站列表與文章頁皆未顯示發布日期（HTML 與 AJAX 列表皆無），因此 date 欄位通常省略；
      腳本仍會偵測列表項目或文章中的日期標記，若原站日後顯示日期即會自動帶入。

搬移規則（1:1）：
    * attachments 只取原站附件區塊（.module-ptattach）；內文中的檔案連結留在內文，不重複列為附件。
    * 圖片只有「寬度超過 2000 px」與「BMP」兩種情況會被修改（見上方「圖片處理」）；其餘保留原始檔
      （位元組完全相同）。--original-images 可完整還原為原始檔。附件（/legacy/files/）保留原檔，
      唯一的例外是下一項的個資保護。
    * 個資保護（PRIVACY_REDACTIONS，任何模式都會套用）：原站公開過的學生個資（學分抵免審核清單、公聽會簽到單與
      線上出席紀錄、抽選結果的學號欄）不搬移或只搬移不含個資的部分，原處改為一段說明文字；原站檔案網址轉址到
      該文章；.legacy-cache/ 快照中的學號也先遮蔽。移除或修改前的原始檔移到 .private-originals/（不進版控、
      不部署），明細見 report.json 的 privacy。
    * 內嵌的站內影片（<iframe src=".../xxx.mp4">）下載後仍以 <iframe> 嵌入。
    * 內文中的 data: URI 圖片（例：表情符號）解碼存成 /legacy/img/inline-*.png。
    * 列表中的 450 連結紀錄：若目標是站內文章且標題與列表相同、且未重複，直接使用該文章；
      否則建立「連結型文章」（編號為 450 代碼、標題為原站列表標題），條目數與標題與原站一致。
    * 已下架的原站網址（302 回首頁）在內文中改寫為原站實際行為（首頁）或明確的後繼頁面（LEGACY_SUCCESSORS），
      並加入轉址；每個 450 連結紀錄、已下架文章／頁面與未列入 ia.json 的列表單元也都有轉址。
    * ia.json 中的 412 別名頁若有自己的內容（例：412-1039-7707 EMRD 校友會的日曆與 4 個條目），
      併入別名目標頁（標題作為小節標題），內容不遺失。
    * 以行內樣式 display:none 隱藏的元素（例：92909 表格中重複的學生姓名）不搬移；相片輯的手機版隱藏副本
      另由相片輯去重邏輯處理（不受影響）。
    * 頁內目錄／回到頂端：同頁 "#..." 連結的目標（<a name>、id）保留為 id="legacy-<文件代號>-<名稱>"
      （文件代號＝頁面 slug〔"/" 改 "-"〕或文章編號；只含 a-z0-9-，同一文件內不重複），放在最近的
      h2–h4／p／td 上（找不到時保留空的 <a id>），連結改為 href="#legacy-<文件代號>-<名稱>"。
      加上文件代號是為了讓同時存在於 DOM 的多個頁面（React Activity 保留的頁面）id 不會互相衝突。
    * www.emrd.tw（EMRD 舊 Weebly 網站，客戶自有、客戶要求 1:1 搬移）上的圖片與 /uploads/ 檔案：
      網域已失效（NXDOMAIN），預設由同一個 Weebly 網站（站台 115637951）的預覽主機
      （*.preview.editmysite.com）下載到 public/legacy/ 並改寫 src／href（--no-weebly-mirror 可停用）；
      仍無法取得者保留原網址並列入報告。其他外站圖片（fbcdn、facebook、LINE…）只檢查能否存取
      （HEAD／GET 標頭，不下載），結果快取於 .legacy-cache/probes.json。
    * 每個已搬移的站內檔案（/var/file/...）都有轉址到 /legacy/...；依賴查詢字串的 downloadfile 網址
      以「完整路徑＋查詢字串」寫入 redirects.json（next.config 以 has 查詢條件比對）。
    * 無障礙（內容不增刪，只補語意；明細見 report.json 的 accessibility）：
      - 以圖片呈現的核心資訊（課程地圖、課程規劃、學分費計算表、調整流程圖、特色資訊圖）在圖片後加上逐字轉寫的
        「文字版」（IMAGE_TEXT_OVERRIDES），圖片 alt 改為簡短說明；依路徑指定的 alt 見 IMAGE_ALT_OVERRIDES。
      - 無意義的 alt（圖片、1、pic、(shiny)…）改為空字串；文章唯一的大圖以文章標題為 alt（列入待轉寫清單）。
      - Facebook 表情圖示、LINE 加入好友按鈕改為其 alt 文字；已失效的外站圖片移除（DROPPED_EXTERNAL_IMAGES）。
      - 資料表格的標題列改為 <th scope>（跨滿整列的表格標題改為 <caption>）；全英文的區塊加 lang="en"。
      - 頁內目錄指到的粗體段落改為 h2；內文標題層級從 h2 開始（不跳級）；YouTube 嵌入的 title 改為明確的影片標題。
    * 安全：連結只允許 http(s)／mailto／tel／相對網址（先移除控制字元再判斷 scheme）；屬性值一律以雙引號輸出。

禮貌抓取：最多 4 個並行連線、每個請求之間有間隔、瀏覽器 User-Agent、失敗時指數退避重試。
只下載 emrd.ntust.edu.tw 與 www.emrd.tw 上的檔案；Google Drive／Docs 與其他網域一律保留為連結，不下載。
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures as cf
import hashlib
import io
import json
import mimetypes
import os
import re
import socket
import sys
import threading
import time
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from html import unescape as html_unescape
from pathlib import Path, PurePosixPath
from urllib.parse import parse_qs, unquote, urljoin, urlsplit, urlunsplit

import requests
import urllib3
from bs4 import BeautifulSoup, NavigableString, Tag
from bs4.dammit import EntitySubstitution
from bs4.element import CData, Comment, Declaration, Doctype, ProcessingInstruction
from bs4.formatter import HTMLFormatter
from PIL import Image, ImageOps

# ---------------------------------------------------------------------------
# 路徑與常數
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parent.parent
IA_PATH = ROOT / "src" / "content" / "legacy" / "ia.json"
DATA_DIR = ROOT / "src" / "content" / "legacy" / "data"
PUBLIC_ROOT = ROOT / "public"
ASSET_DIR = PUBLIC_ROOT / "legacy"
CACHE_DIR = ROOT / ".legacy-cache"
# 被縮圖／轉檔圖片的原始檔備份（不在 public/ 下，不會部署）；子資料夾與 public/legacy/ 相同（img/）
ORIGINALS_DIR = ROOT / "legacy-originals"
ORIGINALS_MANIFEST = ORIGINALS_DIR / "manifest.json"
# 因個資保護（PRIVACY_REDACTIONS）而移除或修改前的原始檔：.gitignore 排除，只留本機（不部署、不進 git）。
# 子資料夾與 public/legacy/ 相同（files/、img/）；快照原文在 legacy-cache/http/；對照表 manifest.json
PRIVATE_DIR = ROOT / ".private-originals"
PRIVATE_MANIFEST = PRIVATE_DIR / "manifest.json"

BASE = "https://emrd.ntust.edu.tw"
SITE_ID = "1039"
LANG_QUERY = "?Lang=zh-tw"
LEGACY_HOSTS = {"emrd.ntust.edu.tw", "www.emrd.ntust.edu.tw"}
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)
MAX_WORKERS = 4                     # 並行連線上限（禮貌抓取）
RETRY_STATUS = {429, 500, 502, 503, 504}
MAX_IMAGE_WIDTH = 2000              # 客戶同意：寬度超過者縮成此寬度（--max-image-width 0 或 --original-images 停用）
JPEG_QUALITY = 85
# 衍生圖片的編碼設定版本：調整縮圖／壓縮參數時遞增，重跑時才會重新產生既有的衍生檔
DERIVE_VERSION = 1
DERIVABLE_FORMATS = {"JPEG", "PNG", "WEBP", "BMP"}

# 原站已下架（302 回首頁）的網址 → 新網站的明確後繼頁面；未列出者依原站行為導向首頁
LEGACY_SUCCESSORS = {
    "412-1039-7708": "/admissions/info",    # 舊「招生資訊」頁（連結文字皆為「招生資訊」／招生公告）
}
# 原站存在、但 ia.json 未列入的列表單元 → 新網站對應頁面（轉址用）；未列出者導向 /news
# （首頁「招生資訊」1782 已在 ia.json 列為 admissions/news，不再需要）
UNIT_SUCCESSORS: dict[str, str] = {}
UNMAPPED_UNIT_FALLBACK = "/news"

# EMRD 舊 Weebly 網站（客戶自有、要求 1:1 搬移）：內文熱連結的圖片下載到本地
OWNED_HOSTS = {"www.emrd.tw", "emrd.tw"}
OWNED_CANONICAL_HOST = "www.emrd.tw"
# 同一個 Weebly 網站（站台 115637951）的預覽主機：www.emrd.tw 網域失效後，/uploads/ 檔案仍可由此取得。
# 客戶（EMRD，網站所有者）已同意 1:1 搬移：預設由此下載（--no-weebly-mirror 停用、改為只做 HEAD 檢查）。
# www.emrd.tw 網域已失效、可能被他人重新註冊，因此 /uploads/ 一律改由預覽主機取得，不連線到 www.emrd.tw。
WEEBLY_MIRROR = "https://115637951-491297898992377255.preview.editmysite.com"
WEEBLY_MIRROR_HOSTS = {"115637951-491297898992377255.preview.editmysite.com"}
ANCHOR_ID_TAGS = {"h2", "h3", "h4", "p", "td"}     # 頁內錨點 id 可放的元素（另可放在 <a>）
ANCHOR_BLOCKS = ANCHOR_ID_TAGS | {"th", "li", "blockquote", "figure", "figcaption", "caption",
                                  "ul", "ol", "table", "thead", "tbody", "tfoot", "tr"}

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tif", ".tiff"}
FILE_EXTS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pps", ".ppsx",
    ".odt", ".ods", ".odp", ".rtf", ".txt", ".csv", ".zip", ".rar", ".7z",
    ".mp3", ".mp4", ".mov", ".avi", ".wmv",
}

# 原站網址：/p/<類型>-<站台>[-<代碼>][-<頁碼>][,r|c<單元>][-preview].php
P_RE = re.compile(
    r"^/p/(?P<type>\d+)-(?P<site>\d+)"
    r"(?:-(?P<id>\d+))?(?:-(?P<page>\d+))?"
    r"(?:,(?P<sfx>[rc])(?P<unit>\d+))?"
    r"(?P<preview>-preview)?\.php$"
)

WS_RE = re.compile(r"[ \t\n\r\f\v]+")                     # 一般空白（不含 &nbsp;）
ZW_RE = re.compile("[\u200b\u2060\ufeff]")    # 零寬空白／BOM（保留 ZWJ、ZWNJ，否則 👨‍👩‍👧 等組合表情會被拆開）
BLANK_CHARS = " \t\n\r\f\v\xa0\u3000\u200b\u200c\u200d\u2060\ufeff"
ACCESS_ANCHOR_RE = re.compile(r"(?<!\S):::(?!\S)")         # rpage 無障礙定位點 ":::"
DATE_RE = re.compile(r"(?<!\d)(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?(?!\d)")

# ---------------------------------------------------------------------------
# 個資保護（PRIVACY_REDACTIONS）
# ---------------------------------------------------------------------------
# 上線前稽核發現原網站公開過學生個資（姓名＋學號＋成績的審核清單、簽到單、線上會議出席名單、學號）。新網站與公開的
# git 儲存庫都不得再帶有這些資料，因此搬遷時依下表處理。每次執行（含 --refresh、--original-images）都會套用，
# 結果可重現：
#
#   remove_assets  整個檔案不搬移：不下載、不放進 public/legacy/、不列為附件。內文中的該圖片／附件改為一段說明文字
#                  （note；附在該文件內文最後，同一段只出現一次），沒有圖片的文章不設封面（同其他無圖文章）；
#                  內文連結與原站檔案網址（redirects.json）都改連到 post 指定的文章。
#   pdf_pages      PDF 只保留 keep 列出的頁（1 起算；其餘頁連同只屬於它們的圖片、標籤結構一併移除），並清除作者
#                  欄位與 XMP 中繼資料；附件大小標示依處理後的檔案。
#   table_columns  指定文件（"post:<編號>"／"page:<slug>"）的表格中，表頭文字為 headers 的欄整欄移除。
#   cache_scrub    指定文章（編號；原站 404／405／406／16 各種網址形式）在 .legacy-cache/ 快照中的個資以
#                  replacement 取代：讀取快取時即改寫快照，--refresh 重新抓取時在寫入快取前遮蔽。
#
# 被移除或被修改前的原始檔（含快照原文）由本腳本移到 .private-originals/（.gitignore 排除；不部署、不進 git），
# 對照表為 .private-originals/manifest.json，說明見該資料夾的 README.txt。要恢復 remove_assets／pdf_pages 的
# 某一項：從下表刪除該項後重跑本腳本即可，腳本會自 .private-originals/ 取回原檔（不需連網）。
#
# 檔案以穩定識別碼比對（privacy_asset_id）：原站 downloadfile 網址取 file 參數（兩層 base64）解碼後的伺服器路徑，
# 同一檔案的不同網址（有無 &cg=…、fname 不同）都會被比對到；其他網址取「主機＋路徑」（不含 ?時間戳；www.emrd.tw
# 與其 Weebly 預覽主機視為同一主機）。
PRIVACY_VERSION = 1     # PDF 處理方式（輸出設定等）變更時遞增，重跑時才會重新產生已處理過的檔案
PRIVACY_NOTE_GRADE_LIST = "審核結果已個別通知申請人。為保護個人資料，本站不公開含姓名、學號與成績的審核清單。"
PRIVACY_REDACTIONS: dict[str, dict] = {
    "remove_assets": {
        "emrd.ntust.edu.tw/app/index.php?file=attach/4/pta_36965_3627801_99071.pdf": {
            "what": "109 學年度學分抵免申請審核清單（附件「109-抵免學分申請結果公告.pdf」：全名、學號、課程成績）",
            "post": "82939", "note": PRIVACY_NOTE_GRADE_LIST,
        },
        "emrd.ntust.edu.tw/app/index.php?file=attach/78/pta_43511_4314762_43480.pdf": {
            "what": "110 學年度學分抵免申請審核清單（附件「110-抵免學分申請清單(公告).pdf」：全名、學號、課程成績）",
            "post": "93392", "note": PRIVACY_NOTE_GRADE_LIST,
        },
        "www.emrd.tw/uploads/1/1/5/6/115637951/published/0910mail-page-0001.jpg": {
            "what": "108 學年度學分抵免申請審核清單（內文圖片，亦為文章封面：全名、學號、課程成績）",
            "post": "76672", "note": PRIVACY_NOTE_GRADE_LIST,
        },
    },
    "pdf_pages": {
        "emrd.ntust.edu.tw/app/index.php?file=attach/10/pta_54243_1779120_73735.pdf": {
            "what": ("112 學年度調整學分費公聽會會議紀錄（/study/tuition 附件）：保留第 1–3 頁會議紀錄，移除第 4–8 頁"
                     "（現場照片與 Webex 參與者名單截圖、手寫簽到單、Webex 出席紀錄〔約 40 人的姓名與加入／離開時間〕）"),
            "keep": [1, 2, 3],
        },
    },
    "table_columns": {
        "post:121858": {
            "what": "112-2「談判理論與實務」修課名額抽選結果：移除學號欄（保留序號與已遮蔽的姓名）",
            "headers": ["學號"],
        },
    },
    "cache_scrub": {
        "121858": {
            "what": "112-2「談判理論與實務」修課名額抽選結果表格中的學號 → 「（已移除）」",
            "pattern": r"(?<![A-Za-z0-9])[MBD]1\d{7,8}(?![0-9])",
            "replacement": "（已移除）",
        },
    },
}
# 臺科大學號樣式（M／B／D＋入學學年＋序號）：輸出前檢查所有頁面與文章，仍有符合者列入報告（privacy.studentIdPatternHits）
STUDENT_ID_RE = re.compile(r"(?<![A-Za-z0-9])[MBD]1\d{7,8}(?![0-9])")


def privacy_asset_id(url: str) -> str:
    """檔案的穩定識別碼（PRIVACY_REDACTIONS 的鍵）：見上方說明。"""
    sp = urlsplit(url)
    host = (sp.hostname or "").lower()
    path = sp.path or "/"
    if host in LEGACY_HOSTS:
        m = re.search(r"(?:^|&)file=([^&]+)", sp.query or "")
        if m and path.lower().startswith("/app/index.php"):
            raw = unquote(m.group(1))
            try:
                name = base64.b64decode(base64.b64decode(raw, validate=True), validate=True).decode("utf-8")
            except (ValueError, UnicodeDecodeError):
                name = raw
            return f"emrd.ntust.edu.tw/app/index.php?file={name}"
        return f"emrd.ntust.edu.tw{path}"
    if host in OWNED_HOSTS or host in WEEBLY_MIRROR_HOSTS:
        return f"{OWNED_CANONICAL_HOST}{path}"
    return f"{host}{path}"


def privacy_removed(url: str) -> dict | None:
    """remove_assets 的規則（不搬移的檔案）；其他網址回傳 None。"""
    return PRIVACY_REDACTIONS["remove_assets"].get(privacy_asset_id(url))


def privacy_pdf_rule(url: str) -> dict | None:
    """pdf_pages 的規則（只保留部分頁面的 PDF）；其他網址回傳 None。"""
    return PRIVACY_REDACTIONS["pdf_pages"].get(privacy_asset_id(url))


def privacy_scrub(url: str, body: bytes) -> bytes:
    """cache_scrub：指定文章的原站頁面（任何網址形式）遮蔽個資；其他網址原樣回傳（位元組不變）。"""
    ref = parse_legacy(url)
    if ref is None or ref.type not in ("404", "405", "406", "16"):
        return body
    rule = PRIVACY_REDACTIONS["cache_scrub"].get(ref.id or "")
    if not rule:
        return body
    text = body.decode("utf-8", errors="surrogateescape")
    new = re.sub(rule["pattern"], rule["replacement"], text)
    return body if new == text else new.encode("utf-8", errors="surrogateescape")

# ---------------------------------------------------------------------------
# HTML 清洗規則
# ---------------------------------------------------------------------------

ALLOWED_TAGS = {
    "p", "br", "hr", "h2", "h3", "h4", "strong", "em", "u", "s", "sub", "sup",
    "ul", "ol", "li", "blockquote", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "caption", "a", "img", "figure", "figcaption", "iframe",
}
RENAME = {"b": "strong", "i": "em", "h1": "h2", "h5": "h4", "h6": "h4",
          "strike": "s", "del": "s", "ins": "u"}
DROP_TAGS = {
    "script", "style", "noscript", "form", "input", "button", "svg", "select", "textarea",
    "option", "optgroup", "object", "embed", "link", "meta", "head", "title", "template",
    "canvas", "map", "area", "colgroup", "col", "audio", "video", "source", "track",
    "param", "math",
}
# 會被展開（或在只含行內內容時改成 <p>）的區塊型外框
BLOCK_WRAPPERS = {
    "div", "section", "article", "center", "header", "footer", "aside", "nav", "main",
    "address", "dl", "dt", "dd", "pre", "fieldset", "details", "summary", "hgroup", "legend",
}
# 來源 HTML 中屬於區塊層級的標籤（用來判斷外框是否只含行內內容）
BLOCK_SOURCE = BLOCK_WRAPPERS | {
    "p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "blockquote", "hr",
    "figure", "tr", "td", "th", "tbody", "thead", "tfoot", "caption",
}
OUT_BLOCKS = {"p", "h2", "h3", "h4", "ul", "ol", "blockquote", "table", "hr", "figure"}
INLINE_FORMAT = {"strong", "em", "u", "s", "sub", "sup"}
HEADINGS = {"h2", "h3", "h4"}
TEXT_BLOCKS = {"p", "h2", "h3", "h4", "li", "td", "th", "caption", "figcaption", "blockquote"}
GENERIC_LINK_TITLES = {"另開新視窗", "(另開新視窗)", "（另開新視窗）", "(另開新視窗)[下載]", "開啟新視窗"}

# ---------------------------------------------------------------------------
# 圖片的替代文字與文字版（無障礙）
# ---------------------------------------------------------------------------

# 原站沒有意義的 alt（「圖片」、「1」、「P」、「pic」、「EVENT」、Skype 表情代碼「(shiny)」…）：改為空字串，
# 避免螢幕閱讀器念出「圖片」「1」（WCAG 1.1.1）。只有一張大圖的文章另以文章標題為 alt（見 Sanitizer.label_single_image）
JUNK_ALT_RE = re.compile(
    r"(?:圖片|圖|pics?|picture|img|image|photo|event|link|list|web|report|banner|[a-z]|\(\w+\)|\d{1,3})", re.I)
# 單張大圖文章：顯示寬度至少此值的唯一圖片以文章標題為 alt，並列入報告待人工轉寫
SINGLE_IMAGE_MIN_WIDTH = 500

# 依本地路徑指定 alt（重跑不會被原站的錯誤 alt 覆蓋）；內容為圖片上文字的逐字轉寫
IMAGE_ALT_OVERRIDES = {
    # 原站誤用執行長的 alt（「游進陽執行長」）
    "/legacy/img/5abc0cf4a1-838765448.png": "蔡孟霖副執行長",
    # 以下為連結中的圖片（原站 alt 為「圖片」「4」「EVENT」，是連結唯一的名稱）
    "/legacy/img/e67e489937-youtube.png": "YouTube",
    "/legacy/img/0e197770de-emrd-fb.jpg": "Facebook 臺科大高階科技研發碩士在職專班 -EMRD CTO 技術長學程",
    "/legacy/img/21acf6deaa-916001535.png": "高階科技研發碩士在職專班 109現正招生中 研發人員的專屬EMBA 報考時間：11.27 – 12.05 立即報名",
    "/legacy/img/fc549a2c24-0815-01.png": ("臺科大高階科技研發碩士在職專班 110學年度 線上迎新會 Online Welcome Party "
                                           "2021.08.15 (Sun) 週日 09:00 ~12:00"),
    "/legacy/img/1c715014e9-qr-orig.png": "報名 QRcode",
}

# 以圖片呈現的核心資訊（課程地圖、學分費計算表、流程圖、特色資訊圖）：圖片保留，圖片後加上「文字版」
# （逐字轉寫圖片內容的 HTML），圖片 alt 改為簡短說明並指向文字版。依本地路徑對應，重跑時自動套用。
IMAGE_TEXT_OVERRIDES: dict[str, dict[str, str]] = {
    # /curriculum/courses 課程地圖
    "/legacy/img/56dacd12b2-654609268.jpg": {
        "alt": "課程地圖：EMRD 畢業學分數 45 學分，必修 24 學分、選修 21 學分（文字版見下方）",
        "html": (
            "<h2>課程地圖（文字版）</h2>"
            "<p>EMRD 畢業學分數 45 學分</p>"
            "<h3>必修 24 學分</h3>"
            "<h4>專業核心 (12 學分)</h4>"
            "<ul><li>科技總論(一) (3)</li><li>科技總論(二) (3)</li><li>管理(一) (3)</li><li>管理(二) (3)</li></ul>"
            "<h4>智財核心 (6 學分)</h4>"
            "<ul><li>科技法規總論(一) (3)</li><li>專利(一) (3)</li></ul>"
            "<h4>專業必修 (6 學分)</h4>"
            "<ul><li>技術長講座(一) (2)</li><li>技術長講座(二) (2)</li><li>專題研究(一) (1)</li>"
            "<li>專題研究(二) (1)</li></ul>"
            "<h3>選修 21 學分</h3>"
            "<h4>跨領域選修</h4>"
            "<ul><li>科技與產業地圖分析 (3)</li><li>研發策略管理 (3)</li><li>企業策略管理 (3)</li>"
            "<li>理財實務與規劃(3)</li><li>研發領導與管理 (3)</li><li>科技產業趨勢與策略分析(3)</li>"
            "<li>財務分析與應用 (3)</li><li>創新創業實務 (3)</li><li>產品創意設計 (3)</li>"
            "<li>實務專題研究(1)</li><li>藝術鑑賞 (2)</li></ul>"
            "<p>每學期課程會微幅調整，請依當學期課表為主。</p>"
        ),
    },
    # /curriculum/courses 課程規劃（各學期課表）
    "/legacy/img/8d015cb9f0-115634911.jpg": {
        "alt": "課程規劃：一上、一下、一暑、二上、二下各學期的必修與選修課程（文字版見下方）",
        "html": (
            "<h2>課程規劃（文字版）</h2>"
            "<p>(寒假不上課，約 1 月中 ~ 2 月中。)</p>"
            "<p>二下無必修課程，僅開設彈性選修課程，給予充足時間準備畢業論文與口試。</p>"
            + "".join(
                f"<table><caption>{cap}</caption><thead><tr><th scope=\"col\">課程</th>"
                f"<th scope=\"col\">必 / 選</th><th scope=\"col\">學分</th></tr></thead><tbody>"
                + "".join(f"<tr><th scope=\"row\">{c}</th><td>{t}</td><td>{n}</td></tr>" for c, t, n in rows)
                + "</tbody></table>"
                for cap, rows in (
                    ("一上：必修 11 / 選修 6", (("科技總論 (一)", "必", 3), ("技術長講座 (一)", "必", 2),
                                             ("專利 (一)", "必", 3), ("管理 (一)", "必", 3),
                                             ("選修課程 (1)", "選", 3), ("選修課程 (2)", "選", 3))),
                    ("一下：必修 8 / 選修 7", (("科技總論 (二)", "必", 3), ("技術長講座 (二)", "必", 2),
                                            ("管理 (二)", "必", 3), ("選修課程 (3)", "選", 1),
                                            ("選修課程 (4)", "選", 3), ("選修課程 (5)", "選", 3))),
                    ("一暑：必修 1 / 選修 7", (("專題研究 (一)", "必", 1), ("選修課程 (6)", "選", 1),
                                            ("選修課程 (7)", "選", 3), ("選修課程 (8)", "選", 3))),
                    ("二上：必修 4 / 選修 6", (("科技法規總論 (一)", "必", 3), ("專題研究 (二)", "必", 1),
                                            ("選修課程 (9)", "選", 3), ("選修課程 (10)", "選", 3))),
                    ("二下：選修 5", (("選修課程 (11)", "選", 3), ("選修課程 (12)", "選", 2))),
                ))
            + "<p>EMRD 畢業學分數 45 學分<br>必修 24 學分<br>選修 21 學分</p>"
            "<p>每學期課程會微幅調整，請依當學期課表為主。</p>"
        ),
    },
    # /study/tuition 圖1 調整流程
    "/legacy/img/9f1c5db663-509717809.png": {
        "alt": "圖1 流程圖：辦理學年度學雜費調整作業流程（文字版見下方）",
        "html": (
            "<h2>辦理學年度學雜費調整作業流程（圖1 文字版）</h2>"
            "<ol><li>針對學校整體發展、財務狀況及資源規劃等進行評估</li>"
            "<li>舉行學雜費調整審議小組研商會議</li>"
            "<li>舉行學雜費公聽會</li>"
            "<li>設置學生陳述意見管道並回應處理</li>"
            "<li>彙整資料提案行政會議審議</li>"
            "<li>調整學雜費與否?<ul><li>是：陳報校長後，檢送資料呈請教育部核定</li>"
            "<li>否：陳報校長後，檢送資料予教育部備查</li></ul></li></ol>"
        ),
    },
    # /study/tuition 參、計算方式
    "/legacy/img/a71a21d6b2-105650883.png": {
        "alt": "計算方式：學分費調整前後的學雜費比較表（文字版見下方）",
        "html": (
            "<h2>計算方式（文字版）</h2>"
            "<table><thead>"
            "<tr><th rowspan=\"2\" scope=\"col\">系所項目</th>"
            "<th colspan=\"2\" scope=\"col\">EMRD 高階科技研發碩士在職專班</th></tr>"
            "<tr><th scope=\"col\">調整前</th><th scope=\"col\">調整後</th></tr>"
            "</thead><tbody>"
            "<tr><th scope=\"row\">學雜費基數</th><td>15,380</td><td>15,380</td></tr>"
            "<tr><th scope=\"row\">基本學分費</th><td>73,800<br>(45*8,200/5=73,800)</td>"
            "<td>99,000<br>(45*11,000/5=99,000)</td></tr>"
            "<tr><th scope=\"row\">畢業總學雜費</th><td>445,900<br>((15,380+73,800)*5=445,900)</td>"
            "<td>571,900<br>((15,380+99,000)*5=571,900)</td></tr>"
            "</tbody></table>"
        ),
    },
    # /about/features 資訊圖一（圓形排列）
    "/legacy/img/1802c66573-mczh-tw1000x800-large5678-937536864001.png": {
        "alt": "為什麼要加入EMRD?（圖一，文字版見下方）",
        "html": (
            "<h2>為什麼要加入EMRD?（圖一文字版）</h2>"
            "<ul><li><strong>首創學程</strong><br>2015創立<br>中高階研發管理人才在職進修管道</li>"
            "<li><strong>跨領域課程</strong><br>工程技術、研發管理、產業趨勢、科技法規、專利智財等課程</li>"
            "<li><strong>師資多元</strong><br>產官學研各界業師與校內教師合授</li>"
            "<li><strong>提升自我價值</strong><br>開拓知識技術涵養<br>拓展視野，贏取未來</li>"
            "<li><strong>專業學員</strong><br>學生背景多元，產業人脈連結<br>平均年資17年以上中高階主管</li>"
            "<li><strong>終身進修</strong><br>開放校友旁聽課程<br>持續進修，不斷成長</li></ul>"
        ),
    },
    # /about/features 資訊圖二（六角形排列）
    "/legacy/img/c9eedbbfa5-mczh-tw1920x700-large5679-537394664001.png": {
        "alt": "為什麼要加入EMRD?（圖二，文字版見下方）",
        "html": (
            "<h2>為什麼要加入EMRD?（圖二文字版）</h2>"
            "<ul><li><strong>全球首創</strong><br>2015年創立<br>技術長CTO學程<br>研發人員的EMBA</li>"
            "<li><strong>三脈合一</strong><br>產業脈<br>技術脈<br>人脈：師資脈、學生脈、企業內脈</li>"
            "<li><strong>業師合授</strong><br>業界高階主管<br>總經理 技術長</li>"
            "<li><strong>跨領域課程</strong><br>工程、智財、專利<br>管理、設計、科技</li>"
            "<li><strong>百位師資</strong><br>網羅百位以上師資<br>台清交政各校<br>及校內外專家學者</li>"
            "<li><strong>專業學員</strong><br>電子、機械、資工<br>材料、商管、傳播</li>"
            "<li><strong>50%↑ 職涯異動</strong><br>高達50%以上畢業生<br>3年內升遷、轉職</li></ul>"
        ),
    },
}

# 外站小圖改為文字（不再熱連結外站、不洩漏訪客 IP）：Facebook 表情圖示（alt 即表情符號）、LINE「加入好友」按鈕
TEXT_IMAGE_HOSTS = {
    "static.xx.fbcdn.net": "/images/emoji.php/",
    "www.facebook.com": "/images/emoji.php/",
    "facebook.com": "/images/emoji.php/",
    "scdn.line-apps.com": "/n/line_add_friends/",
}
# 已失效的外站圖片：移除 <img>（周圍文字保留）
DROPPED_EXTERNAL_IMAGES = {
    "https://www.ce.ntust.edu.tw/var/file/24/1024/img/2850/457250288.jpg":
        "原圖已失效（HTTP 302 轉回 ce.ntust.edu.tw 首頁，瀏覽器顯示破圖）；移除圖片、保留旁邊的姓名與聯絡資訊",
}

# 影片標題：原站常見的通用標題（視為沒有標題）
GENERIC_VIDEO_TITLE_RE = re.compile(r"(?:youtube video player|影片\s*mv|影片|video|嵌入影片)", re.I)
# 英文段落（lang="en"）：不含中日韓文字、至少此數量的英文單字
CJK_RE = re.compile("[⺀-⿿　-ヿ㄀-ㄯ㐀-䶿一-鿿豈-﫿＀-￯]")
EN_WORD_RE = re.compile(r"[A-Za-z]{2,}")
URL_TEXT_RE = re.compile(r"(?:https?://|www\.)\S+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+", re.I)
EN_MIN_WORDS = 2
# 文章封面（列表縮圖、og:image）至少的顯示寬度；更小的圖（QR code、圖示）只在沒有其他圖片時使用
COVER_MIN_WIDTH = 200


def _entities(s: str) -> str:
    """只跳脫 &、<、>，並把不換行空白輸出為 &nbsp;（方便閱讀）。"""
    return EntitySubstitution.substitute_xml(s).replace("\xa0", "&nbsp;")


class _Formatter(HTMLFormatter):
    """屬性值一律以雙引號包住、值中的 " 寫成 &quot;。

    BeautifulSoup 預設遇到含 " 的值會改用單引號；前端（legacyHtml.ts）重新輸出屬性時固定使用雙引號，
    單引號值中的 " 會提早結束屬性（可注入事件屬性），因此在來源端統一格式。
    """

    def attribute_value(self, value):
        return super().attribute_value(value).replace('"', "&quot;")

    def quoted_attribute_value(self, value):
        return '"' + value.replace('"', "&quot;") + '"'


FORMATTER = _Formatter(entity_substitution=_entities, void_element_close_prefix=None)


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------

def log(msg: str) -> None:
    print(msg, flush=True)


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def page_url(code: str, page: int | None = None) -> str:
    """原站頁面網址（固定加上 ?Lang=zh-tw）。"""
    return f"{BASE}/p/{code}{'-' + str(page) if page else ''}.php{LANG_QUERY}"


def clean_text(s: str | None) -> str:
    """壓縮空白、移除零寬字元，並去除前後空白（含 &nbsp;）。"""
    if not s:
        return ""
    return WS_RE.sub(" ", ZW_RE.sub("", s)).strip(BLANK_CHARS)


def norm_compare(s: str) -> str:
    """比較標題是否相同用：移除所有空白類字元。"""
    return re.sub(r"[\s\u3000\u200b\ufeff]+", "", s or "")


def is_blank(s: str) -> bool:
    return not (s or "").strip(BLANK_CHARS)


def slugify(s: str, fallback: str) -> str:
    """轉成 ASCII 安全的檔名片段（中文會被去除；全空時用 fallback）。"""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60].strip("-") or fallback


def human_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{max(1, round(n / 1024))} KB"
    return f"{n / (1024 * 1024):.1f} MB"


def is_legacy_host(host: str | None) -> bool:
    return (host or "").lower() in LEGACY_HOSTS


def legacy_key(url: str) -> str:
    """站內網址正規化（https、固定主機名稱、移除 fragment）；用於資產去重與報告。"""
    sp = urlsplit(url)
    return urlunsplit(("https", "emrd.ntust.edu.tw", sp.path or "/", sp.query, ""))


def is_owned_host(host: str | None) -> bool:
    return (host or "").lower() in OWNED_HOSTS


def asset_key(url: str) -> str:
    """資產網址正規化：原站網址同 legacy_key；www.emrd.tw 統一為 https://www.emrd.tw（保留查詢字串）。"""
    sp = urlsplit(url)
    host = (sp.hostname or "").lower()
    if host in LEGACY_HOSTS:
        return legacy_key(url)
    if host in OWNED_HOSTS:
        return urlunsplit(("https", OWNED_CANONICAL_HOST, sp.path or "/", sp.query, ""))
    return urlunsplit((sp.scheme or "https", sp.netloc, sp.path or "/", sp.query, ""))


def mirror_url(url: str) -> str | None:
    """www.emrd.tw/uploads/... → 同一 Weebly 網站預覽主機上的相同路徑；其他網址回傳 None。"""
    sp = urlsplit(url)
    if not is_owned_host(sp.hostname) or not (sp.path or "").startswith("/uploads/"):
        return None
    return WEEBLY_MIRROR + sp.path + (f"?{sp.query}" if sp.query else "")


def mirror_page_url(url: str) -> str | None:
    """www.emrd.tw 的頁面（非 /uploads/ 檔案）在 Weebly 預覽主機上的網址（只做存在與否的檢查，不搬移）。"""
    sp = urlsplit(url)
    if not is_owned_host(sp.hostname):
        return None
    return WEEBLY_MIRROR + (sp.path or "/") + (f"?{sp.query}" if sp.query else "")


def doc_anchor_key(where: str) -> str:
    """文件代號（錨點 id 前綴用）："page:curriculum/theses" → "curriculum-theses"；"post:76692" → "76692"。"""
    val = where.partition(":")[2] or where
    s = re.sub(r"[^a-z0-9]+", "-", val.lower()).strip("-")
    return s or sha1(where)[:8]


def anchor_id(raw: str, key: str) -> str:
    """頁內錨點名稱 → 安全的 id（legacy-<文件代號>- 前綴＋ [a-z0-9-]；全為非 ASCII 時以雜湊代替）。

    加上文件代號：React Activity 會讓多個頁面同時留在 DOM，不同頁面的相同錨點名稱（例：top、1）不可衝突。
    """
    s = unicodedata.normalize("NFKD", raw or "").encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40].strip("-")
    return f"legacy-{key}-" + (s or sha1(raw or "")[:8])


def legacy_page_url(path: str) -> str:
    """把 /p/... 路徑轉成標準的原站網址（去掉 fbclid 等查詢參數）。"""
    return f"{BASE}{path}{LANG_QUERY}"


URL_IGNORED_CHARS_RE = re.compile(r"[\x00-\x20\x7f]+")


def url_scheme(url: str | None) -> str:
    """瀏覽器實際採用的 scheme（小寫；相對網址回傳 ""）：先移除 C0 控制字元、空白與 DEL 再解析。"""
    clean = URL_IGNORED_CHARS_RE.sub("", url or "")
    m = re.match(r"([A-Za-z][A-Za-z0-9+.\-]*):", clean)
    return m.group(1).lower() if m else ""


def url_ext(path: str) -> str:
    return os.path.splitext(unquote(path or ""))[1].lower()


def is_asset_url(sp) -> bool:
    """站內網址是否為檔案（圖片、附件）而非頁面。"""
    path = sp.path or ""
    low = path.lower()
    if low.startswith("/var/file/"):
        return True
    if low.startswith("/app/index.php") and "downloadfile" in (sp.query or "").lower():
        return True
    ext = url_ext(path)
    return ext in IMAGE_EXTS or ext in FILE_EXTS


def write_if_changed(path: Path, data: bytes) -> bool:
    """內容相同就不重寫（保持冪等、避免觸發開發伺服器重新載入）。"""
    if path.exists():
        try:
            if path.read_bytes() == data:
                return False
        except OSError:
            pass
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)
    return True


def write_json(path: Path, obj) -> bool:
    text = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    return write_if_changed(path, text.encode("utf-8"))


def parse_content_disposition(value: str | None) -> str | None:
    """從 Content-Disposition 取出原始檔名（支援 filename*= 與 UTF-8 被當成 latin-1 的情況）。"""
    if not value:
        return None
    m = re.search(r"filename\*\s*=\s*([\w-]*)'[^']*'([^;]+)", value, re.I)
    if m:
        try:
            return unquote(m.group(2).strip().strip('"'), encoding=m.group(1) or "utf-8")
        except LookupError:
            return unquote(m.group(2).strip().strip('"'))
    m = re.search(r'filename\s*=\s*"([^"]*)"', value, re.I) or re.search(r"filename\s*=\s*([^;]+)", value, re.I)
    if not m:
        return None
    name = m.group(1).strip()
    try:
        name = name.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    if "%" in name:
        name = unquote(name)
    return name or None


def find_date(container: Tag | None, exclude_text: str = "") -> str | None:
    """在列表項目／文章標記中找 YYYY-MM-DD 型式的日期（不從標題推測）。"""
    if container is None:
        return None
    candidates = []
    for el in container.select("[class*=date], time"):
        candidates.append(el.get("datetime") or el.get_text(" "))
    text = container.get_text(" ")
    if exclude_text:
        text = text.replace(exclude_text, " ")
    candidates.append(text)
    for c in candidates:
        m = DATE_RE.search(c or "")
        if m:
            y, mo, d = (int(x) for x in m.groups())
            if 1990 <= y <= 2100 and 1 <= mo <= 12 and 1 <= d <= 31:
                return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


# ---------------------------------------------------------------------------
# HTTP（含磁碟快取、節流、重試）
# ---------------------------------------------------------------------------

class FetchError(Exception):
    pass


@dataclass
class Resp:
    url: str
    status: int
    location: str | None
    content_type: str
    body: bytes

    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")


class Http:
    """所有請求都不自動跟隨轉址（避免被帶到外站或首頁），由呼叫端自行判斷 Location。"""

    def __init__(self, refresh: bool, workers: int, delay: float):
        self.refresh = refresh
        self.workers = max(1, min(MAX_WORKERS, workers))
        self.delay = delay
        self.dir = CACHE_DIR / "http"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._local = threading.local()
        self._lock = threading.Lock()
        self._next_slot = 0.0
        self._fresh: set[str] = set()   # --refresh 時，本次已重新抓過的網址
        self._dns: dict[str, bool] = {}
        self.network = 0
        self.cached = 0

    def _session(self) -> requests.Session:
        s = getattr(self._local, "session", None)
        if s is None:
            s = requests.Session()
            s.headers.update({
                "User-Agent": USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.7,en;q=0.6",
            })
            self._local.session = s
        return s

    def _throttle(self) -> None:
        """全域節流：任兩個請求的起始時間至少相隔 delay 秒。"""
        with self._lock:
            now = time.monotonic()
            start = max(now, self._next_slot)
            self._next_slot = start + self.delay
        wait = start - time.monotonic()
        if wait > 0:
            time.sleep(wait)

    def raw_get(self, url: str, stream: bool = False) -> requests.Response:
        last = ""
        for attempt in range(5):
            self._throttle()
            try:
                r = self._session().get(url, timeout=(15, 120), allow_redirects=False, stream=stream)
            except requests.RequestException as e:
                last = f"{type(e).__name__}: {e}"
            else:
                if r.status_code not in RETRY_STATUS:
                    with self._lock:
                        self.network += 1
                    return r
                last = f"HTTP {r.status_code}"
                r.close()
            time.sleep(min(30.0, 1.5 * (2 ** attempt)))   # 指數退避
        raise FetchError(f"{url} — {last}")

    def resolves(self, host: str | None) -> bool:
        """主機名稱能否解析（每個主機只查一次；失效網域不必逐一重試、等待退避）。"""
        host = (host or "").lower()
        with self._lock:
            if host in self._dns:
                return self._dns[host]
        ok = False
        for attempt in range(2):
            try:
                socket.getaddrinfo(host, 443)
                ok = True
                break
            except OSError:
                time.sleep(1.0 + attempt)
        with self._lock:
            self._dns[host] = ok
        return ok

    def probe(self, url: str) -> dict:
        """外站檔案可否存取：HEAD（不支援時改用 GET 只讀標頭），跟隨轉址，不下載內容。"""
        if not self.resolves(urlsplit(url).hostname):
            return {"ok": False, "status": 0, "error": "DNS：主機名稱無法解析（網域已失效）"}
        last = ""
        verify = True
        for attempt in range(3):
            self._throttle()
            try:
                r = self._session().head(url, timeout=(10, 30), allow_redirects=True, verify=verify)
                r.close()
                if r.status_code in (400, 403, 405, 501):
                    self._throttle()
                    r = self._session().get(url, timeout=(10, 30), allow_redirects=True, stream=True,
                                            verify=verify)
                    r.close()
            except requests.exceptions.SSLError as e:
                # 憑證鏈不完整（缺中繼憑證）時瀏覽器多半仍可顯示；只為了判斷能否存取，改用不驗證憑證的 HEAD 再試一次
                last = f"SSLError: {e}"
                if verify:
                    verify = False
                    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
                    continue
            except requests.RequestException as e:
                last = f"{type(e).__name__}: {e}"
            else:
                with self._lock:
                    self.network += 1
                if r.status_code not in RETRY_STATUS:
                    ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
                    rec = {"ok": 200 <= r.status_code < 300 and not ctype.startswith("text/html"),
                           "status": r.status_code, "contentType": ctype}
                    if r.url != url:
                        rec["finalUrl"] = r.url
                    if not verify:
                        rec["certificateVerified"] = False
                    return rec
                last = f"HTTP {r.status_code}"
            time.sleep(min(10.0, 1.5 * (2 ** attempt)))
        return {"ok": False, "status": 0, "error": last}

    def get(self, url: str) -> Resp:
        key = sha1(url)
        meta_p, body_p = self.dir / f"{key}.json", self.dir / f"{key}.body"
        if (not self.refresh or url in self._fresh) and meta_p.exists() and body_p.exists():
            try:
                meta = json.loads(meta_p.read_text("utf-8"))
                body = body_p.read_bytes()
                scrubbed = self._scrub(url, key, body)
                if scrubbed != body:            # 個資保護：快照中的個資（cache_scrub）一併改寫
                    write_if_changed(body_p, scrubbed)
                with self._lock:
                    self.cached += 1
                return Resp(url, meta["status"], meta.get("location"), meta.get("contentType", ""), scrubbed)
            except (OSError, ValueError, KeyError):
                pass
        r = self.raw_get(url)
        body = self._scrub(url, key, r.content)
        loc = r.headers.get("Location")
        resp = Resp(url, r.status_code, urljoin(url, loc) if loc else None,
                    r.headers.get("Content-Type", ""), body)
        write_if_changed(body_p, body)
        write_if_changed(meta_p, json.dumps({
            "url": url, "status": resp.status, "location": resp.location,
            "contentType": resp.content_type,
        }, ensure_ascii=False, indent=1).encode("utf-8"))
        with self._lock:
            self._fresh.add(url)
        return resp

    @staticmethod
    def _scrub(url: str, key: str, body: bytes) -> bytes:
        """個資保護（cache_scrub）：遮蔽後的內容才進快照與後續處理；原文移到 .private-originals/（不進版控）。"""
        scrubbed = privacy_scrub(url, body)
        if scrubbed != body:
            write_if_changed(PRIVATE_DIR / "legacy-cache" / "http" / f"{key}.body", body)
            log(f"  個資保護：遮蔽快照 {url}（原文移到 .private-originals/legacy-cache/http/{key}.body）")
        return scrubbed

    def get_many(self, urls) -> dict[str, Resp | FetchError]:
        uniq = list(dict.fromkeys(urls))

        def one(u):
            try:
                return u, self.get(u)
            except FetchError as e:
                return u, e

        if not uniq:
            return {}
        with cf.ThreadPoolExecutor(self.workers) as ex:
            return dict(ex.map(one, uniq))


# ---------------------------------------------------------------------------
# 原站頁面解析
# ---------------------------------------------------------------------------

@dataclass
class RawItem:
    title: str
    href: str               # 絕對網址（尚未改寫）
    date: str | None = None
    body: Tag | None = None  # 列表條目本身的內文（.mdetail .meditor；例：影音專區的 YouTube 播放器＋日期）
    base: str = ""          # 條目所在的列表頁網址（內文相對連結的基準）


@dataclass
class RawDoc:
    url: str
    status: int
    location: str | None = None
    found: bool = False     # 是否找到 #Dyn_2_3 主要內容
    title: str = ""
    date: str | None = None
    editors: list = field(default_factory=list)       # .meditor 的 Tag（依序）
    gallery_before: list = field(default_factory=list)  # 相片輯 figure（位於內文之前；已依 src 去重）
    gallery_after: list = field(default_factory=list)   # 相片輯 figure（位於內文之後）
    items: list = field(default_factory=list)         # RawItem（#pageptlist／sublist）
    attachments: list = field(default_factory=list)   # RawItem（.module-ptattach）
    has_list: bool = False
    total_pages: int = 1
    page_prefix: str | None = None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == 200 and self.found


def img_src(img: Tag | None) -> str:
    if img is None:
        return ""
    return (img.get("src") or img.get("data-src") or img.get("data-original") or "").strip()


def is_hidden(tag: Tag) -> bool:
    return "display:none" in re.sub(r"\s+", "", (tag.get("style") or "").lower())


def collect_gallery(main: Tag, url: str, doc: RawDoc) -> None:
    """主模組中的 rpage 相片輯（.mcarousel > figure.figBS），依 DOM 位置分成內文前／後，依 src 去重。

    單張相片時原站輸出兩份：ImageList1（桌機，可見）與 ImageList2（手機，style=display:none）；
    先處理可見的那份，隱藏副本中重複的 src 會被略過（若隱藏副本有獨有的相片仍會保留）。
    """
    order = {id(t): i for i, t in enumerate(main.find_all(True))}
    detail = main.select_one(".mpgdetail")
    detail_pos = order[id(detail)] if detail is not None else None
    cars = [c for c in main.select(".mcarousel")
            if c.find_parent(class_="meditor") is None and c.find_parent(id="pageptlist") is None]
    cars.sort(key=lambda c: (is_hidden(c), order[id(c)]))
    def key_of(img: Tag) -> str:
        u = urljoin(url, img_src(img))
        return legacy_key(u) if is_legacy_host(urlsplit(u).hostname) else u

    seen: set[str] = set()
    for car in cars:
        target = doc.gallery_before if detail_pos is None or order[id(car)] < detail_pos else doc.gallery_after
        # 每個 figure 為一張相片；沒有 figure 外框時以 img 為單位
        units = car.find_all("figure") or [i for i in car.find_all("img")]
        for unit in units:
            keys = [key_of(i) for i in ([unit] if unit.name == "img" else unit.find_all("img")) if img_src(i)]
            if not keys or all(k in seen for k in keys):
                continue
            seen.update(keys)
            target.append(unit)


def parse_doc(resp: Resp | FetchError, url: str) -> RawDoc:
    if isinstance(resp, FetchError):
        return RawDoc(url=url, status=0, error=str(resp))
    doc = RawDoc(url=url, status=resp.status, location=resp.location)
    if resp.status != 200:
        return doc
    soup = BeautifulSoup(resp.body, "lxml", from_encoding="utf-8")
    main = soup.select_one("#Dyn_2_3")
    if main is None and soup.select_one("body.page_fprint") is not None:
        main = soup.select_one(".module-detail")      # 友善列印版本（16-1039-<id>.php）
    if main is None:
        return doc
    doc.found = True
    h = main.select_one("h2.hdline") or main.select_one("h2.mt-title")
    doc.title = clean_text(h.get_text(" ")) if h else ""
    editors = main.select(".mpgdetail .meditor")
    ids = {id(e) for e in editors}
    doc.editors = [e for e in editors if not any(id(p) in ids for p in e.parents)]   # 排除巢狀重複
    collect_gallery(main, url, doc)
    lists = main.select("#pageptlist, .module-sublist")
    doc.has_list = main.select_one("#pageptlist") is not None      # 只有 #pageptlist 會分頁
    for lst in lists:
        for a in lst.select(".mtitle a[href]"):
            title = clean_text(a.get_text(" "))
            row = a.find_parent(class_="d-item") or a.find_parent(class_="row") or a.parent
            body = row.select_one(".mdetail .meditor") if row is not None else None
            if body is not None and is_blank(body.get_text()) and body.find(["img", "iframe"]) is None:
                body = None
            doc.items.append(RawItem(title, urljoin(url, a["href"].strip()), find_date(row, a.get_text(" ")),
                                     body, url))
    for a in main.select(".module-ptattach a[href]"):
        doc.attachments.append(RawItem(clean_text(a.get_text(" ")), urljoin(url, a["href"].strip())))
    # 文章頁若有日期標記（.mdate 等，位於內文之外）就帶入
    for el in main.select("[class*=date], time"):
        if not el.find_parent(class_="meditor") and not el.find_parent(id="pageptlist"):
            doc.date = find_date(el)
            if doc.date:
                break
    scripts = " ".join(s.get_text() for s in main.find_all("script"))
    m = re.search(r"totalPage\s*:\s*(\d+)", scripts)
    doc.total_pages = max(1, int(m.group(1))) if m else 1
    m = re.search(r"urlPrefix\s*:\s*'([^']+)'", scripts)
    doc.page_prefix = m.group(1) if m else None
    return doc


@dataclass
class LegacyRef:
    """原站 /p/ 網址的解析結果。"""
    type: str
    code: str               # 例："412-1039-11023"
    id: str | None
    page: str | None
    path: str               # 例："/p/406-1039-141774,r1293.php"
    preview: bool


def parse_legacy(url: str) -> LegacyRef | None:
    sp = urlsplit(url)
    if sp.scheme not in ("http", "https", "") or not is_legacy_host(sp.hostname):
        return None
    m = P_RE.match(sp.path or "")
    if not m or m["site"] != SITE_ID:
        return None
    code = f"{m['type']}-{m['site']}" + (f"-{m['id']}" if m["id"] else "")
    return LegacyRef(m["type"], code, m["id"], m["page"], sp.path, bool(m["preview"]))


# ---------------------------------------------------------------------------
# 報告
# ---------------------------------------------------------------------------

class Report:
    def __init__(self):
        self._lock = threading.Lock()
        self.unresolved: dict[str, dict] = {}
        self.external_images: dict[str, set] = {}
        self.iframes_to_links: dict[str, set] = {}
        self.link_items_404: dict[str, dict] = {}
        self.fetch_failures: dict[str, str] = {}
        self.dead_posts: dict[str, dict] = {}
        self.dead_links: dict[str, dict] = {}       # 已下架原站網址 → 改寫結果
        self.galleries: dict[str, dict] = {}        # 相片輯（where → 張數／說明）
        self.dropped = Counter()
        self.fragment_links = 0                     # 找不到目標而改為純文字的頁內連結
        self.anchors: dict[str, list] = {}          # where → 保留的錨點 id
        self.hidden: dict[str, dict] = {}           # where → 移除的 display:none 元素
        self.owned_links: dict[str, set] = {}       # 內文中連到 www.emrd.tw 的連結（未下載）
        # 無障礙調整（種類 → [{where, src/…, detail}]）：圖片 alt／文字版、外站小圖、表格標題列、lang、標題層級、影片標題
        self.a11y: dict[str, list] = {}
        self.a11y_counts = Counter()                # 種類 → 次數（同一文件中重複者也計入）
        # 個資保護（PRIVACY_REDACTIONS）的處理紀錄（種類 → [{where, …}]）
        self.privacy: dict[str, list] = {}

    def privacy_change(self, kind: str, rec: dict) -> None:
        with self._lock:
            lst = self.privacy.setdefault(kind, [])
            if rec not in lst:
                lst.append(rec)

    def image_change(self, kind: str, where: str, src: str, detail: str) -> None:
        self.a11y_change(kind, {"where": where, "src": src, "detail": detail})

    def a11y_change(self, kind: str, rec: dict) -> None:
        with self._lock:
            self.a11y_counts[kind] += 1
            lst = self.a11y.setdefault(kind, [])
            if rec not in lst:
                lst.append(rec)

    def hidden_element(self, where: str, text: str) -> None:
        with self._lock:
            rec = self.hidden.setdefault(where, {"elements": 0, "text": []})
            rec["elements"] += 1
            text = clean_text(text)
            if text and text not in rec["text"]:
                rec["text"].append(text)

    def unresolved_link(self, url: str, where: str, reason: str) -> None:
        with self._lock:
            rec = self.unresolved.setdefault(legacy_key(url), {"reason": reason, "foundIn": set()})
            rec["foundIn"].add(where)

    def external_image(self, src: str, where: str) -> None:
        with self._lock:
            self.external_images.setdefault(src, set()).add(where)

    def dead_link(self, url: str, where: str, dst: str, reason: str) -> None:
        with self._lock:
            rec = self.dead_links.setdefault(legacy_key(url), {"rewrittenTo": dst, "reason": reason, "foundIn": set()})
            rec["foundIn"].add(where)


# ---------------------------------------------------------------------------
# 資產（圖片／附件）下載
# ---------------------------------------------------------------------------

def file_sha1(path: Path) -> str | None:
    try:
        return hashlib.sha1(path.read_bytes()).hexdigest()
    except OSError:
        return None


def public_file(web_path: str) -> Path:
    """"/legacy/img/x.jpg" → public/legacy/img/x.jpg"""
    return PUBLIC_ROOT / web_path.lstrip("/")


def backup_file(web_path: str) -> Path:
    """"/legacy/img/x.jpg" → legacy-originals/img/x.jpg（與 public/legacy/ 相同的子資料夾與檔名）"""
    return ORIGINALS_DIR / PurePosixPath(web_path).relative_to("/legacy")


def private_file(web_path: str) -> Path:
    """"/legacy/files/x.pdf" → .private-originals/files/x.pdf（個資保護移除／修改前的原始檔；不進版控）"""
    return PRIVATE_DIR / PurePosixPath(web_path).relative_to("/legacy")


def image_meta(data: bytes) -> dict | None:
    """圖片格式與「顯示」尺寸（已考慮 EXIF 方向：瀏覽器會依 EXIF 轉正顯示）；無法辨識時回傳 None。"""
    try:
        with Image.open(io.BytesIO(data)) as im:
            fmt = im.format
            w, h = im.size
            animated = bool(getattr(im, "is_animated", False))
            try:
                orient = im.getexif().get(0x0112, 1)
            except Exception:
                orient = 1
    except Exception:
        return None
    if orient in (5, 6, 7, 8):
        w, h = h, w
    return {"format": fmt, "width": w, "height": h, "animated": animated}


def derive_plan(meta: dict | None, max_width: int, convert_bmp: bool) -> tuple[bool, bool]:
    """(是否 BMP→PNG, 是否縮圖)。動畫圖片與無法辨識的格式不處理。"""
    if not meta or meta["animated"] or meta["format"] not in DERIVABLE_FORMATS:
        return False, False
    convert = convert_bmp and meta["format"] == "BMP"
    resize = max_width > 0 and meta["width"] > max_width
    return convert, resize


def derive_image(data: bytes, max_width: int, convert: bool, resize: bool) -> tuple[bytes, tuple[int, int]]:
    """產生衍生圖片：BMP→PNG（無損、像素相同）及／或縮成 max_width 寬（先依 EXIF 方向轉正、LANCZOS；
    JPEG 品質 85 漸進式、PNG optimize；格式不變）。結果可重現（相同輸入與設定 → 相同位元組）。"""
    im = Image.open(io.BytesIO(data))
    fmt = im.format
    icc = im.info.get("icc_profile")
    out_fmt = "PNG" if convert else fmt
    if resize:
        im = ImageOps.exif_transpose(im)        # 先套用 EXIF 方向，縮圖後不再保留 EXIF
        if out_fmt == "JPEG" and im.mode not in ("RGB", "L", "CMYK"):
            im = im.convert("RGB")
        elif im.mode == "P":
            im = im.convert("RGBA" if "transparency" in im.info else "RGB")
        elif im.mode == "1":
            im = im.convert("L")
        elif im.mode.startswith("I"):
            im = im.convert("RGB")
        nh = max(1, round(im.height * max_width / im.width))
        im = im.resize((max_width, nh), getattr(Image, "Resampling", Image).LANCZOS)
    else:
        im.load()
    kw: dict = {}
    if out_fmt == "JPEG":
        kw.update(quality=JPEG_QUALITY, optimize=True, progressive=True)
    elif out_fmt == "PNG":
        kw.update(optimize=True)
    elif out_fmt == "WEBP":
        kw.update(quality=JPEG_QUALITY, method=6)
    if icc:
        kw["icc_profile"] = icc
    buf = io.BytesIO()
    im.save(buf, format=out_fmt, **kw)
    out = buf.getvalue()
    meta = image_meta(out)
    return out, ((meta["width"], meta["height"]) if meta else im.size)


def _prune_struct_tree(mu, pdf, kept: set[int]) -> None:
    """標籤結構（StructTreeRoot）只保留內容位於 kept（頁面物件編號）的元素。

    MuPDF 刪頁時保留結構樹，但元素的 /Pg 仍指向被刪的頁面，被刪頁面（含其圖片與內容）因此仍被引用、
    留在檔案中；先剪掉這些元素，garbage 回收才會真的移除被刪頁面。"""
    root = mu.pdf_dict_gets(mu.pdf_trailer(pdf), "Root")
    tree = mu.pdf_dict_gets(root, "StructTreeRoot")
    if not tree.m_internal:
        return

    def on_page(node, inherited):
        pg = mu.pdf_dict_gets(node, "Pg")
        if pg.m_internal and mu.pdf_is_indirect(pg):
            return mu.pdf_to_num(pg) in kept
        return inherited

    def keep(node, inherited) -> bool:
        if mu.pdf_is_int(node):                 # MCID：屬於所在元素的頁面
            return inherited is True
        if not mu.pdf_is_dict(node):
            return False
        here = on_page(node, inherited)
        if mu.pdf_to_name(mu.pdf_dict_gets(node, "Type")) in ("MCR", "OBJR"):
            return here is True
        kids = mu.pdf_dict_gets(node, "K")
        if not kids.m_internal:
            return here is True
        if mu.pdf_is_array(kids):
            i = 0
            while i < mu.pdf_array_len(kids):
                if keep(mu.pdf_array_get(kids, i), here):
                    i += 1
                else:
                    mu.pdf_array_delete(kids, i)
            return mu.pdf_array_len(kids) > 0
        if keep(kids, here):
            return True
        mu.pdf_dict_dels(node, "K")
        return False

    keep(tree, None)


def redact_pdf(data: bytes, pages: list[int]) -> tuple[bytes, int]:
    """個資保護（pdf_pages）：PDF 只保留 pages（1 起算）；回傳 (新檔位元組, 原頁數)。

    被刪頁面連同只屬於它們的圖片、字型與標籤結構一併移除（garbage 回收）；文件資訊的作者欄位清空、移除 XMP
    中繼資料；保留原 /ID、不寫入新時間，因此相同輸入 → 相同位元組。輸出後逐項驗證，不符時拋出例外（不輸出）。"""
    import pymupdf      # 只有需要重新處理 PDF 時才載入（沿用已處理的檔案時不需要）

    mu = pymupdf.mupdf
    doc = pymupdf.open(stream=data, filetype="pdf")
    total = doc.page_count
    if not pages or any(not 1 <= p <= total for p in pages):
        raise ValueError(f"PDF 只有 {total} 頁，無法保留第 {pages} 頁")
    doc.select([p - 1 for p in pages])
    _prune_struct_tree(mu, pymupdf._as_pdf_document(doc), {doc[i].xref for i in range(doc.page_count)})
    md = doc.metadata or {}
    doc.set_metadata({k: ("" if k == "author" else md.get(k) or "") for k in
                      ("title", "author", "subject", "keywords", "creator", "producer", "creationDate", "modDate")})
    doc.del_xml_metadata()
    out = doc.tobytes(garbage=4, deflate=True, no_new_id=True)

    chk = pymupdf.open(stream=out, filetype="pdf")
    page_objs = sum(1 for x in range(1, chk.xref_length()) if chk.xref_get_key(x, "Type")[1] == "/Page")
    used_imgs = {x for page in chk for img in page.get_images(full=True) for x in img[:2] if x}
    img_objs = {x for x in range(1, chk.xref_length()) if chk.xref_get_key(x, "Subtype")[1] == "/Image"}
    problems = []
    if chk.page_count != len(pages) or page_objs != len(pages):
        problems.append(f"頁面物件 {page_objs}（應為 {len(pages)}）")
    if img_objs - used_imgs:
        problems.append(f"殘留未使用的圖片 {sorted(img_objs - used_imgs)}")
    if (chk.metadata or {}).get("author") or chk.get_xml_metadata():
        problems.append("作者欄位或 XMP 中繼資料未清除")
    if problems:
        raise ValueError("PDF 個資處理驗證失敗：" + "；".join(problems))
    return out, total


class AssetStore:
    """依網址去重下載；對照表存於 .legacy-cache/assets.json，重跑時直接沿用已下載的檔案。

    每筆紀錄同時保存兩組欄位：
      * 原始檔：originalPath／originalSha1／originalBytes／originalWidth／originalHeight（原站下載的位元組）
      * 目前檔案：path／sha1／bytes／width／height（縮圖或 BMP→PNG 之後、實際被引用的檔案）
    被修改的原始檔在修改前逐位元組備份到 legacy-originals/（同子資料夾、同檔名），因此任何設定
    （含 --original-images 還原）都能由原始檔重新產生，結果可重現。width／height 為顯示尺寸（已依 EXIF 方向）。
    """

    def __init__(self, http: Http, refresh: bool, max_width: int = MAX_IMAGE_WIDTH, weebly_mirror: bool = True,
                 convert_bmp: bool = True):
        self.http = http
        self.refresh = refresh
        self.max_width = max(0, max_width)
        self.convert_bmp = convert_bmp
        self.weebly_mirror = weebly_mirror
        self.manifest_path = CACHE_DIR / "assets.json"
        try:
            self.manifest = json.loads(self.manifest_path.read_text("utf-8"))
        except (OSError, ValueError):
            self.manifest = {}
        self.probe_path = CACHE_DIR / "probes.json"
        try:
            self.probe_cache = {} if refresh else json.loads(self.probe_path.read_text("utf-8"))
        except (OSError, ValueError):
            self.probe_cache = {}
        self.probes: dict[str, dict] = {}       # 本次檢查（或沿用快取）的外站網址 → 結果
        self.wanted: dict[str, str] = {}        # 網址 → "img" | "file"
        self.found_in: dict[str, set] = {}
        self.records: dict[str, dict] = {}      # 網址 → 下載結果
        self.failed: dict[str, str] = {}
        self.used: set[str] = set()             # 實際被輸出內容引用的網址
        self.duplicates: dict[str, dict] = {}   # 內容與其他網址相同、改用同一本地檔的網址
        self.derived: dict[str, dict] = {}      # 原始檔路徑 → legacy-originals/manifest.json 的一筆（本次被修改者）
        self.derive_errors: dict[str, str] = {}  # 無法產生衍生檔、改用原始檔者
        self.removed: list[str] = []            # 本次移除的過時衍生檔／已轉檔的 BMP（public/ 內）
        self._lock = threading.Lock()
        self._hash_cache: dict[tuple, str | None] = {}
        # 個資保護（PRIVACY_REDACTIONS）：.private-originals/manifest.json 的 assets（網址 → {rule, what, record…}）
        try:
            self.private: dict[str, dict] = json.loads(PRIVATE_MANIFEST.read_text("utf-8")).get("assets", {})
        except (OSError, ValueError, AttributeError):
            self.private = {}
        for key, entry in self.private.items():
            # 已自 remove_assets 刪除（恢復）的檔案：取回下載紀錄；原檔由 original_source 在 .private-originals/ 找到
            if key not in self.manifest and not privacy_removed(key) and isinstance(entry.get("record"), dict):
                self.manifest[key] = dict(entry["record"])
        self.privacy_skipped: dict[str, set] = {}   # remove_assets：不搬移的網址 → 出現位置
        self.privacy_pdf: dict[str, dict] = {}       # pdf_pages：網址 → 處理結果
        self.privacy_errors: list[str] = []

    @property
    def spec(self) -> str:
        """衍生檔的產生設定；與紀錄相同且檔案未變時沿用，不重新編碼。"""
        return f"v{DERIVE_VERSION};w{self.max_width};bmp2png{int(self.convert_bmp)};q{JPEG_QUALITY}"

    def want(self, url: str, kind: str, where: str) -> None:
        key = asset_key(url)
        if privacy_removed(key):                # 個資保護：不下載、不搬移
            with self._lock:
                self.privacy_skipped.setdefault(key, set()).add(where)
            return
        if self.wanted.get(key) != "img":
            self.wanted[key] = kind
        self.found_in.setdefault(key, set()).add(where)

    def downloadable(self, url: str, link: bool = False) -> bool:
        """此網址是否要下載：原站檔案；www.emrd.tw 的圖片（啟用 Weebly 預覽主機時〔預設〕另含 /uploads/
        連結檔案與預覽主機上的圖片）。"""
        sp = urlsplit(url)
        host = (sp.hostname or "").lower()
        if host in LEGACY_HOSTS:
            return is_asset_url(sp)
        if host in OWNED_HOSTS:
            if link:
                return self.weebly_mirror and (sp.path or "").startswith("/uploads/") and is_asset_url(sp)
            return is_asset_url(sp) or (sp.path or "").startswith("/uploads/")
        if host in WEEBLY_MIRROR_HOSTS:
            return self.weebly_mirror and (sp.path or "").startswith("/uploads/") and (not link or is_asset_url(sp))
        return False

    def probe_all(self, urls) -> None:
        """外站網址可否存取（不下載）；結果快取於 .legacy-cache/probes.json（--refresh 重新檢查）。"""
        todo = [u for u in dict.fromkeys(urls) if u not in self.probes]
        miss = [u for u in todo if u not in self.probe_cache]
        if miss:
            log(f"檢查 {len(miss)} 個外站網址能否存取（HEAD，不下載）…")
        with cf.ThreadPoolExecutor(self.http.workers) as ex:
            for u, rec in zip(miss, ex.map(self.http.probe, miss)):
                self.probe_cache[u] = rec
        for u in todo:
            self.probes[u] = self.probe_cache[u]
        write_json(self.probe_path, {k: self.probe_cache[k] for k in sorted(self.probe_cache)})

    # ---- 檔案雜湊（同一次執行內依路徑、大小、修改時間快取） ----
    def _sha1_of(self, path: Path) -> str | None:
        try:
            st = path.stat()
        except OSError:
            return None
        k = (str(path), st.st_size, st.st_mtime_ns)
        with self._lock:
            if k in self._hash_cache:
                return self._hash_cache[k]
        h = file_sha1(path)
        with self._lock:
            self._hash_cache[k] = h
        return h

    @staticmethod
    def _upgrade(rec: dict) -> None:
        """舊版對照表（沒有原始檔欄位）：當時一律未縮圖，目前檔案即原始檔。"""
        if "originalPath" in rec or rec.get("resized"):
            return
        rec["originalPath"] = rec["path"]
        if rec.get("sha1"):
            rec["originalSha1"] = rec["sha1"]
        rec["originalBytes"] = rec.get("originalBytes", rec.get("bytes"))
        if rec.get("width"):
            rec["originalWidth"], rec["originalHeight"] = rec["width"], rec.get("height")

    def original_source(self, rec: dict) -> Path | None:
        """原始檔目前所在位置：public/legacy/、legacy-originals/ 或 .private-originals/（個資保護移出的原檔）
        中位元組與 originalSha1 相同者。"""
        op, want = rec.get("originalPath"), rec.get("originalSha1")
        if not op or not want:
            return None
        for p in (public_file(op), backup_file(op), private_file(op)):
            if self._sha1_of(p) == want:
                return p
        return None

    def download_all(self) -> None:
        keys = sorted(self.wanted)
        total = len(keys)
        done = [0]
        lock = threading.Lock()

        def one(key):
            kind = self.wanted[key]
            rec = self.manifest.get(key)
            if rec and not self.refresh and self._reusable(rec, kind):
                self.records[key] = rec
            else:
                try:
                    self.records[key] = self._download(key, kind)
                except Exception as e:     # 下載失敗不中斷整體流程，記入報告
                    self.failed[key] = f"{type(e).__name__}: {e}"
            with lock:
                done[0] += 1
                if done[0] % 100 == 0 or done[0] == total:
                    log(f"  檔案 {done[0]}/{total}")

        with cf.ThreadPoolExecutor(self.http.workers) as ex:
            list(ex.map(one, keys))
        self.dedupe_by_content()
        self.finalize_images()
        self.finalize_privacy()
        merged = dict(self.manifest)
        merged.update(self.records)
        # 個資保護（remove_assets）：下載紀錄與檔案移到 .private-originals/（第一次套用規則時；之後不再出現）
        removed = {k: merged.pop(k) for k in [k for k in merged if privacy_removed(k)]}
        kept_paths = {p for r in merged.values() for p in (r.get("path"), r.get("originalPath")) if p}
        for key in sorted(removed):
            self.stash_removed(key, removed[key], kept_paths)
        write_json(self.manifest_path, {k: merged[k] for k in sorted(merged)})
        if self.private:
            write_json(PRIVATE_MANIFEST, self.private_manifest())

    def dedupe_by_content(self) -> None:
        """不同原站網址、內容完全相同的檔案共用一個本地檔（以網址排序第一個為準，結果可重現）。

        共用後的路徑寫回對照表（droppedPath 記錄原本的檔名），重跑時不會再下載被 --prune 刪掉的副本。
        """
        groups: dict[tuple, list] = {}
        for key in sorted(self.records):
            rec = self.records[key]
            if rec.get("originalSha1"):
                groups.setdefault((rec["kind"], rec["originalSha1"]), []).append(key)
        self.duplicates = {}
        for keys in groups.values():
            if len(keys) < 2:
                continue
            canon = self.records[keys[0]]["originalPath"]
            for k in keys[1:]:
                rec = self.records[k]
                if rec["originalPath"] != canon:
                    rec = self.records[k] = dict(rec, originalPath=canon, path=canon, droppedPath=rec["originalPath"])
                self.duplicates[k] = {"duplicateOf": keys[0], "droppedPath": rec.get("droppedPath")}

    def _reusable(self, rec: dict, kind: str) -> bool:
        """對照表中的下載結果可否沿用：種類相同，且原始檔（public/legacy/ 或 legacy-originals/）仍在、位元組未變。"""
        if rec.get("kind") != kind:
            return False
        self._upgrade(rec)
        if "originalPath" not in rec:
            return False
        if not rec.get("originalSha1"):
            h = self._sha1_of(public_file(rec["originalPath"]))
            if not h:
                return False
            rec["originalSha1"] = h
        if self.original_source(rec) is not None:
            return True
        # 個資保護處理過的 PDF：原檔只在本機 .private-originals/（例：從 git 新取出的工作目錄沒有它），
        # 目前檔案（已處理）仍在且位元組未變時沿用，不重新下載原檔
        return bool(rec.get("privacySpec") and rec.get("sha1")
                    and self._sha1_of(public_file(rec["path"])) == rec["sha1"])

    # ---- 縮圖／BMP→PNG ----
    def finalize_images(self) -> None:
        """依本次設定決定每張圖片的「目前檔案」：需要時備份原始檔並產生衍生檔，不需要時確保原始檔就位。"""
        groups: dict[str, list] = {}
        for _key, rec in sorted(self.records.items()):
            if rec.get("kind") == "img" and str(rec.get("originalPath", "")).startswith("/legacy/img/"):
                groups.setdefault(rec["originalPath"], []).append(rec)

        def one(op):
            try:
                return op, self._finalize(groups[op][0])
            except Exception as e:      # 衍生檔失敗不影響整體：改用原始檔並記入報告
                return op, e

        with cf.ThreadPoolExecutor(MAX_WORKERS) as ex:
            results = list(ex.map(one, sorted(groups)))
        for op, cur in results:
            if isinstance(cur, Exception):
                self.derive_errors[op] = f"{type(cur).__name__}: {cur}"
                log(f"  無法處理圖片 {op}：{cur}")
                continue
            for rec in groups[op]:
                self._apply(rec, cur)

    @staticmethod
    def _apply(rec: dict, cur: dict) -> None:
        for k, v in cur.items():
            if v is None:
                rec.pop(k, None)
            else:
                rec[k] = v

    def _finalize(self, rec: dict, data: bytes | None = None) -> dict:
        """單一原始檔 → 目前檔案的欄位。修改前先把原始檔逐位元組備份到 legacy-originals/（並驗證）。"""
        op = rec["originalPath"]
        if data is None:
            src = self.original_source(rec)
            if src is None:
                raise FetchError("找不到原始檔（public/legacy/ 與 legacy-originals/ 皆無相同位元組的檔案）")
            data = src.read_bytes()
        orig_sha = rec.get("originalSha1") or hashlib.sha1(data).hexdigest()
        meta = image_meta(data)
        convert, resize = derive_plan(meta, self.max_width, self.convert_bmp)
        if not (convert or resize):
            write_if_changed(public_file(op), data)       # 原始檔就位（先前被衍生檔取代時即還原）
            out = {"path": op, "bytes": len(data), "sha1": orig_sha, "resized": False, "converted": None,
                   "maxWidth": None, "derivedSpec": None, "derivedFrom": None}
            if meta:
                out["width"], out["height"] = meta["width"], meta["height"]
            return out
        cur = str(PurePosixPath(op).with_suffix(".png")) if convert else op
        bk = backup_file(op)
        write_if_changed(bk, data)
        if file_sha1(bk) != orig_sha:
            raise FetchError(f"原始檔備份驗證失敗：{bk}")
        spec = self.spec
        if (rec.get("derivedSpec") == spec and rec.get("derivedFrom") == orig_sha and rec.get("path") == cur
                and rec.get("sha1") and rec.get("width") and self._sha1_of(public_file(cur)) == rec["sha1"]):
            digest, size, dims = rec["sha1"], rec["bytes"], (rec["width"], rec["height"])   # 沿用（不重新編碼）
        else:
            out_data, dims = derive_image(data, self.max_width, convert, resize)
            write_if_changed(public_file(cur), out_data)
            digest, size = hashlib.sha1(out_data).hexdigest(), len(out_data)
        if cur != op and public_file(op).exists():
            public_file(op).unlink()                       # 已轉檔的 BMP 原檔只保留在 legacy-originals/
            with self._lock:
                self.removed.append(op)
        reason = "+".join(r for r, on in (("bmp-to-png", convert), ("downscale", resize)) if on)
        with self._lock:
            self.derived[op] = {
                "original": op, "current": cur, "reason": reason,
                "bytesBefore": len(data), "bytesAfter": size,
                "widthBefore": meta["width"], "widthAfter": dims[0],
                "heightBefore": meta["height"], "heightAfter": dims[1],
                "sha1Before": orig_sha, "sha1After": digest,
            }
        return {"path": cur, "bytes": size, "sha1": digest, "width": dims[0], "height": dims[1],
                "resized": resize, "converted": "BMP→PNG" if convert else None,
                "maxWidth": self.max_width if resize else None, "derivedSpec": spec, "derivedFrom": orig_sha}

    # ---- 個資保護（PRIVACY_REDACTIONS） ----
    def finalize_privacy(self) -> None:
        """pdf_pages：PDF 只保留指定頁（原檔移到 .private-originals/）；規則已刪除者還原為原檔。
        另把只存在於 .private-originals/ 的已恢復附件放回 public/legacy/（圖片由 finalize_images 處理）。"""
        for key in sorted(self.records):
            rec = self.records[key]
            if rec.get("kind") == "img":
                continue
            rule = privacy_pdf_rule(key)
            if rule:
                self._redact_pdf_record(key, rec, rule)
            elif rec.get("privacySpec"):
                self._unredact_record(key, rec)
            elif not public_file(rec["path"]).exists():
                src = self.original_source(rec)
                if src is not None:
                    write_if_changed(public_file(rec["path"]), src.read_bytes())

    def _redact_pdf_record(self, key: str, rec: dict, rule: dict) -> None:
        spec = f"v{PRIVACY_VERSION};pages{','.join(str(p) for p in rule['keep'])}"
        op, cur = rec["originalPath"], public_file(rec["path"])
        src = self.original_source(rec)
        data = None
        if src is not None:
            data = src.read_bytes()
            write_if_changed(private_file(op), data)        # 原檔保存在本機（不進版控）
            if file_sha1(private_file(op)) != rec["originalSha1"]:
                raise FetchError(f"原檔保存驗證失敗：{private_file(op)}")
        info = dict(rec.get("privacy") or {})
        if rec.get("privacySpec") == spec and rec.get("sha1") and self._sha1_of(cur) == rec["sha1"]:
            pass                                            # 已處理且檔案未變：沿用（不重新產生）
        elif data is None:
            self.privacy_errors.append(f"{key}：處理設定已變更，但找不到原檔（.private-originals/），保留目前已處理的檔案")
            return
        else:
            try:
                out, total = redact_pdf(data, rule["keep"])
            except Exception as e:
                if cur.exists() and file_sha1(cur) == rec["originalSha1"]:
                    cur.unlink()                            # 無法處理時不得公開原檔（原檔已在 .private-originals/）
                raise RuntimeError(f"個資保護：無法處理 {key}：{e}") from e
            write_if_changed(cur, out)
            rec["sha1"], rec["bytes"] = hashlib.sha1(out).hexdigest(), len(out)
            info = {"rule": "pdf_pages", "keptPages": list(rule["keep"]), "pagesBefore": total}
            log(f"  個資保護：{rec['path']} 只保留第 {rule['keep']} 頁（原 {total} 頁；原檔移到 .private-originals/）")
        rec["privacySpec"], rec["privacy"] = spec, info
        self.privacy_pdf[key] = {"path": rec["path"], "what": rule["what"], **info,
                                 "bytesBefore": rec.get("originalBytes"), "bytesAfter": rec["bytes"]}
        if private_file(op).exists():
            self.private[key] = {"rule": "pdf_pages", "what": rule["what"],
                                 "file": private_file(op).relative_to(PRIVATE_DIR).as_posix(),
                                 "publicPath": rec["path"], "originalSha1": rec["originalSha1"],
                                 "originalBytes": rec.get("originalBytes")}

    def _unredact_record(self, key: str, rec: dict) -> None:
        """pdf_pages 的規則已刪除：改回原檔（自 .private-originals/ 取回）。"""
        src = self.original_source(rec)
        if src is None:
            self.privacy_errors.append(f"{key}：規則已刪除，但找不到原檔（.private-originals/），保留目前已處理的檔案")
            return
        write_if_changed(public_file(rec["path"]), src.read_bytes())
        rec["sha1"], rec["bytes"] = rec["originalSha1"], rec.get("originalBytes", rec["bytes"])
        rec.pop("privacySpec", None)
        rec.pop("privacy", None)
        self.private.pop(key, None)
        log(f"  個資保護規則已刪除：{rec['path']} 改回原檔")

    def stash_removed(self, key: str, rec: dict, kept_paths: set[str]) -> None:
        """remove_assets：檔案（原檔與衍生檔）自 public/legacy/、legacy-originals/ 移到 .private-originals/，
        下載紀錄移到 .private-originals/manifest.json（.legacy-cache/assets.json 不再保留）。
        kept_paths：其他（未移除的）紀錄仍使用的路徑，不刪除。"""
        rule = privacy_removed(key) or {}
        op = rec.get("originalPath") or rec["path"]
        src = self.original_source(rec)
        if src is not None:
            write_if_changed(private_file(op), src.read_bytes())    # 原檔（已在 .private-originals/ 時不變）
        for p in sorted({rec.get("path"), op} - {None} - kept_paths):
            for f in (public_file(p), backup_file(p)):
                if not f.exists():
                    continue
                if not private_file(p).exists():                    # 沒有原檔可保存時也先保存一份再刪除
                    write_if_changed(private_file(p), f.read_bytes())
                f.unlink()
                log(f"  個資保護：移除 {f.relative_to(ROOT).as_posix()}（原檔移到 .private-originals/）")
        if not private_file(op).exists():
            self.privacy_errors.append(f"{key}：找不到原檔，未能保存到 .private-originals/")
        self.private[key] = {"rule": "remove_assets", "what": rule.get("what", ""), "post": rule.get("post"),
                             "file": private_file(op).relative_to(PRIVATE_DIR).as_posix(), "record": rec}

    def private_manifest(self) -> dict:
        """.private-originals/manifest.json：個資保護移出的原始檔對照（不進版控）。"""
        cache = {}
        for f in sorted((PRIVATE_DIR / "legacy-cache" / "http").glob("*.body")):
            try:
                url = json.loads((CACHE_DIR / "http" / f"{f.stem}.json").read_text("utf-8")).get("url")
            except (OSError, ValueError):
                url = None
            cache[f.stem] = {"url": url, "file": f"legacy-cache/http/{f.name}",
                             "snapshot": f".legacy-cache/http/{f.name}"}
        return {
            "note": ("scripts/migrate_legacy.py 的 PRIVACY_REDACTIONS 自新網站移除或修改的原始檔（含個資，只留本機、"
                     "不進版控、不部署）。assets：網址 → 原檔（file，相對於本資料夾）與原本的下載紀錄；"
                     "cache：快照原文（遮蔽前）。還原方式見 README.txt。"),
            "assets": {k: self.private[k] for k in sorted(self.private)},
            "cache": cache,
        }

    def write_originals_manifest(self, restore_mode: bool) -> None:
        """legacy-originals/manifest.json：本次被修改（縮圖／轉檔）的圖片與原始檔對照（依原始檔路徑排序）。

        另移除 public/ 中先前產生、本次已不再使用的衍生檔（例：--original-images 還原後的 .png）。
        還原模式（--original-images）不修改 legacy-originals/（備份永不由腳本刪除）。
        """
        try:
            prev = json.loads(ORIGINALS_MANIFEST.read_text("utf-8"))
        except (OSError, ValueError):
            prev = []
        current = {r["path"] for r in self.records.values() if r.get("kind") == "img"}
        for e in prev if isinstance(prev, list) else []:
            cur, org = (e or {}).get("current"), (e or {}).get("original")
            if isinstance(cur, str) and cur.startswith("/legacy/img/") and cur != org and cur not in current:
                p = public_file(cur)
                if p.exists() and backup_file(org).exists():
                    p.unlink()
                    self.removed.append(cur)
                    log(f"  移除不再使用的衍生檔 {cur}")
        if not restore_mode:
            write_json(ORIGINALS_MANIFEST, [self.derived[k] for k in sorted(self.derived)])

    def store_data_uri(self, uri: str, hint: str, where: str) -> dict | None:
        """把內文中的 data:image/...;base64 圖片解碼存成 /legacy/img/inline-*.ext；無法解碼時回傳 None。"""
        m = re.match(r"data:(image/(?:png|jpeg|jpg|gif|webp|bmp));base64,(.+)$", uri.strip(), re.I | re.S)
        if not m:
            return None
        try:
            data = base64.b64decode(re.sub(r"\s+", "", m.group(2)), validate=True)
        except Exception:
            return None
        meta = image_meta(data)
        if meta is None:
            return None
        ctype = m.group(1).lower().replace("image/jpg", "image/jpeg")
        ext = {"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
               "image/webp": ".webp", "image/bmp": ".bmp"}[ctype]
        digest = hashlib.sha1(data).hexdigest()
        name = f"inline-{digest[:10]}-{slugify(hint, 'img')}{ext}"
        key = f"data:{digest}"
        with self._lock:
            rec = self.records.get(key)
        if rec is None:
            path = f"/legacy/img/{name}"
            rec = {"path": path, "kind": "img", "bytes": len(data), "originalBytes": len(data),
                   "contentType": ctype, "filename": name, "resized": False,
                   "width": meta["width"], "height": meta["height"], "sha1": digest, "source": "data-uri",
                   "originalPath": path, "originalSha1": digest,
                   "originalWidth": meta["width"], "originalHeight": meta["height"]}
            self._apply(rec, self._finalize(rec, data))
            with self._lock:
                self.records[key] = rec
        self.used.add(key)
        self.found_in.setdefault(key, set()).add(where)
        return rec

    def _source_url(self, key: str) -> str:
        """實際抓取的網址：www.emrd.tw 的 /uploads/ 檔案（網域已失效）改由同一 Weebly 網站的預覽主機抓取。"""
        if self.weebly_mirror and is_owned_host(urlsplit(key).hostname):
            return mirror_url(key) or key
        return key

    @staticmethod
    def _redirect_ok(origin: str, loc: str) -> bool:
        sp = urlsplit(loc)
        if is_legacy_host(urlsplit(origin).hostname):
            return is_legacy_host(sp.hostname) and is_asset_url(sp)
        return (sp.hostname or "").lower() in OWNED_HOSTS | WEEBLY_MIRROR_HOSTS

    def _download(self, url: str, kind: str) -> dict:
        """下載原始檔到 public/legacy/（位元組不變）；縮圖／轉檔由 finalize_images 另行處理。"""
        cur = self._source_url(url)
        if not self.http.resolves(urlsplit(cur).hostname):
            raise FetchError("DNS：主機名稱無法解析（網域已失效）")
        for _ in range(4):
            r = self.http.raw_get(cur, stream=True)
            if r.status_code in (301, 302, 303, 307, 308):
                loc = urljoin(cur, r.headers.get("Location", ""))
                r.close()
                if not self._redirect_ok(url, loc):
                    raise FetchError(f"轉址至非檔案位置 {loc}")
                cur = loc
                continue
            break
        else:
            raise FetchError("轉址次數過多")
        if r.status_code != 200:
            r.close()
            raise FetchError(f"HTTP {r.status_code}")
        ctype = r.headers.get("Content-Type", "").split(";")[0].strip().lower()
        data = r.content
        if ctype in ("text/html", "application/xhtml+xml"):
            raise FetchError("伺服器回傳 HTML 而非檔案")
        if not data:
            raise FetchError("空檔案")
        filename = (parse_content_disposition(r.headers.get("Content-Disposition"))
                    or unquote(PurePosixPath(urlsplit(cur).path).name))
        stem, ext = os.path.splitext(filename)
        ext = ext.lower()
        if not ext or len(ext) > 6:
            ext = mimetypes.guess_extension(ctype) or ""
        ext = {".jpe": ".jpg", ".jpeg": ".jpg"}.get(ext, ext)
        sub = "img" if kind == "img" else "files"
        name = f"{sha1(url)[:10]}-{slugify(stem, 'img' if sub == 'img' else 'file')}{ext}"
        path = f"/legacy/{sub}/{name}"
        write_if_changed(ASSET_DIR / sub / name, data)
        digest = hashlib.sha1(data).hexdigest()
        rec = {"path": path, "kind": kind, "bytes": len(data), "contentType": ctype, "filename": filename,
               "resized": False, "sha1": digest,
               "originalPath": path, "originalSha1": digest, "originalBytes": len(data)}
        if cur != url:
            rec["fetchedFrom"] = cur
        meta = image_meta(data) if sub == "img" else None
        if meta:
            rec["width"], rec["height"] = meta["width"], meta["height"]
            rec["originalWidth"], rec["originalHeight"] = meta["width"], meta["height"]
        return rec

    def local(self, url: str) -> str | None:
        rec = self.local_record(url)
        return rec["path"] if rec else None

    def local_record(self, url: str) -> dict | None:
        """已下載檔案的紀錄（並標記為已使用）；未下載時回傳 None。"""
        key = asset_key(url)
        rec = self.records.get(key)
        if rec:
            self.used.add(key)
        return rec

    def record(self, url: str) -> dict | None:
        return self.records.get(asset_key(url))


# ---------------------------------------------------------------------------
# 連結改寫
# ---------------------------------------------------------------------------

@dataclass
class Link450:
    id: str
    path: str               # 例："/p/450-1039-120894,c0.php"
    url: str
    status: int = 0
    target: str | None = None   # 最終目標（絕對網址）
    error: str | None = None


class Ctx:
    """單一頁面／文章的清洗上下文。"""

    def __init__(self, base: str, where: str):
        self.base = base
        self.where = where
        self.attachments: list[dict] = []
        self.post_links: set[str] = set()
        self.gallery_imgs: list[str] = []      # 相片輯中已下載的圖片（本地路徑，依序）
        self.privacy_notes: list[str] = []     # 個資保護：被移除的圖片／附件改為的說明文字（附在內文最後）

    def add_privacy_note(self, note: str) -> None:
        if note and note not in self.privacy_notes:
            self.privacy_notes.append(note)

    def add_attachment(self, label: str, href: str, meta: str | None) -> None:
        if any(a["href"] == href for a in self.attachments):
            return
        att = {"label": label, "href": href}
        if meta:
            att["meta"] = meta
        self.attachments.append(att)


class Mapper:
    def __init__(self, mig: "Migration"):
        self.m = mig

    def map_legacy(self, url: str) -> str | None:
        """原站 /p/ 網址 → 新網站路徑；無法對應時回傳 None。"""
        sp = urlsplit(url)
        path = sp.path or "/"
        if path in ("/", "/index.php", "/index.html", "/index.htm"):
            return "/"
        ref = parse_legacy(url)
        if ref is None:
            return None
        m = self.m
        if ref.type in ("405", "406", "16") or (ref.type == "404" and (ref.preview or ref.code not in m.code_map)):
            if ref.id in m.post_page:
                return m.post_page[ref.id]
            if ref.id in m.alive_posts:
                return f"/posts/{ref.id}"
            return None
        if ref.code in m.code_map:
            return m.code_map[ref.code]
        if ref.type == "403" and ref.id in m.unit_slug:
            return m.unit_slug[ref.id]
        return None

    def dead_destination(self, url: str) -> tuple[str, str] | None:
        """已下架（原站 302 回首頁）或 ia.json 未列入的原站網址 → (新網站路徑, 原因)；其他回傳 None。

        原站行為是轉回首頁，因此預設導向 "/"；LEGACY_SUCCESSORS／UNIT_SUCCESSORS 列出明確的後繼頁面。
        """
        ref = parse_legacy(url)
        if ref is None:
            return None
        m = self.m
        if ref.code in LEGACY_SUCCESSORS:
            return LEGACY_SUCCESSORS[ref.code], "原站頁面已下架（轉址至首頁），改連到後繼頁面"
        if ref.type in ("405", "406", "404", "16") and ref.id in m.dead_posts:
            loc = m.dead_posts[ref.id].get("location")
            return (self.map_legacy(loc) if loc else None) or "/", "原站文章已下架（原站轉址至首頁）"
        unknown = m.unknown_pages.get(ref.code)
        if unknown is not None and unknown.get("status") in (301, 302, 303, 307, 308):
            loc = unknown.get("location")
            return (self.map_legacy(loc) if loc else None) or "/", "原站頁面已下架（原站轉址至首頁）"
        if ref.type == "403" and ref.id in m.extra_units:
            return UNIT_SUCCESSORS.get(ref.id, UNMAPPED_UNIT_FALLBACK), "ia.json 未列入的列表單元，改連到對應頁面"
        if ref.type == "403" and ref.id in m.skipped_units:
            return "/", "首頁輪播單元（未搬移），改連到首頁"
        return None

    def rewrite(self, raw: str | None, ctx: Ctx, depth: int = 0) -> tuple[str | None, bool]:
        """改寫連結；回傳 (新 href 或 None＝移除連結, 是否為外部連結)。"""
        raw = (raw or "").strip()
        if not raw:
            return None, False
        if raw.startswith("#"):
            self.m.report.fragment_links += 1      # 頁內錨點：錨點目標已移除，改為純文字
            return None, False
        # 只允許已知的 scheme（白名單）：瀏覽器解析網址時會忽略 tab／換行等控制字元
        # （"java\tscript:" 仍是 javascript:），因此先移除控制字元與空白再判斷 scheme
        scheme = url_scheme(raw)
        if scheme in ("mailto", "tel"):
            return raw, True
        if scheme and scheme not in ("http", "https"):
            self.m.report.dropped[f"link(不允許的 scheme {scheme}:)"] += 1
            return None, False
        absu = urljoin(ctx.base, raw)
        sp = urlsplit(absu)
        if sp.scheme not in ("http", "https"):
            return None, False
        rule = privacy_removed(absu)
        if rule:
            # 個資保護：不搬移的檔案 → 連到說明它的文章（在該文章本身則移除連結、只留文字，並加上說明）
            self.m.report.privacy_change("removedLink", {"where": ctx.where, "url": asset_key(absu)})
            if ctx.where == f"post:{rule['post']}":
                ctx.add_privacy_note(rule["note"])
                return None, False
            ctx.post_links.add(rule["post"])
            return f"/posts/{rule['post']}", False
        if not is_legacy_host(sp.hostname):
            host = (sp.hostname or "").lower()
            if host in OWNED_HOSTS or host in WEEBLY_MIRROR_HOSTS:
                local = self.m.assets.local(absu)       # --weebly-mirror 時已下載的 /uploads/ 檔案
                if local:
                    return local, False
                if host in OWNED_HOSTS:
                    with self.m.report._lock:
                        self.m.report.owned_links.setdefault(asset_key(absu), set()).add(ctx.where)
            return (raw if urlsplit(raw).scheme in ("http", "https") else absu), True
        # ---- 站內 ----
        if is_asset_url(sp):
            local = self.m.assets.local(absu)
            if local:
                return local, False
            return legacy_key(absu), True            # 下載失敗：保留原網址（已記入報告）
        ref = parse_legacy(absu)
        if ref is not None and ref.type == "450" and depth < 5:
            rec = self.m.links450.get(ref.id)
            if rec is None or not rec.target:
                with self.m.report._lock:
                    self.m.report.link_items_404.setdefault(ref.id, {
                        "url": legacy_key(absu), "status": rec.status if rec else 0, "foundIn": set()
                    })["foundIn"].add(ctx.where)
                return legacy_key(absu), True
            return self.rewrite(rec.target, ctx, depth + 1)
        mapped = self.map_legacy(absu)
        if mapped is not None:
            if mapped.startswith("/posts/"):
                ctx.post_links.add(mapped.rsplit("/", 1)[1])
            return mapped, False
        dead = self.dead_destination(absu)
        if dead is not None:
            self.m.report.dead_link(absu, ctx.where, dead[0], dead[1])
            if dead[0].startswith("/posts/"):
                ctx.post_links.add(dead[0].rsplit("/", 1)[1])
            return dead[0], False
        reason = "無對應的新頁面"
        unknown = self.m.unknown_pages.get(ref.code) if ref is not None else None
        if unknown is not None and unknown.get("alive"):
            reason = f"原站頁面仍存在但 ia.json 未列入（{unknown.get('title') or ref.code}）"
        elif ref is not None and ref.type == "403":
            reason = "原站列表單元未列入 ia.json"
        self.m.report.unresolved_link(absu, ctx.where, reason)
        return legacy_key(absu), True


# ---------------------------------------------------------------------------
# HTML 清洗
# ---------------------------------------------------------------------------

def has_block(node: Tag) -> bool:
    return node.find(lambda t: RENAME.get((t.name or "").lower(), (t.name or "").lower()) in BLOCK_SOURCE) is not None


def youtube_id(sp) -> tuple[str | None, dict]:
    host = (sp.hostname or "").lower()
    qs = parse_qs(sp.query)
    if host == "youtu.be":
        vid = sp.path.strip("/").split("/")[0]
        return (vid or None), qs
    if host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        parts = [p for p in sp.path.split("/") if p]
        if len(parts) >= 2 and parts[0] in ("embed", "v", "shorts", "live"):
            return parts[1], qs
        if parts and parts[0] == "watch" and qs.get("v"):
            return qs["v"][0], qs
    return None, qs


def normalize_iframe_src(src: str) -> str | None:
    """允許的嵌入：YouTube（統一為 youtube-nocookie）、Google 地圖、Google Drive 預覽。"""
    if src.startswith("//"):
        src = "https:" + src
    sp = urlsplit(src)
    if sp.scheme not in ("http", "https"):
        return None
    host = (sp.hostname or "").lower()
    vid, qs = youtube_id(sp)
    if vid:
        if not re.fullmatch(r"[\w-]{6,}", vid):
            return None
        if vid == "videoseries" and qs.get("list"):
            return f"https://www.youtube-nocookie.com/embed/videoseries?list={qs['list'][0]}"
        start = (qs.get("start") or qs.get("t") or [None])[0]
        start = re.sub(r"\D", "", start or "")
        return f"https://www.youtube-nocookie.com/embed/{vid}" + (f"?start={start}" if start else "")
    if (host in ("www.google.com", "google.com", "maps.google.com") and sp.path.startswith("/maps")) or \
            (host in ("www.google.com.tw", "google.com.tw") and sp.path.startswith("/maps")):
        return urlunsplit(("https", host, sp.path, sp.query, ""))
    if host == "drive.google.com" and re.match(r"^/file/d/[^/]+/preview", sp.path):
        return urlunsplit(("https", host, sp.path, sp.query, ""))
    if host == "calendar.google.com" and sp.path.startswith("/calendar/embed"):
        return urlunsplit(("https", host, sp.path, sp.query, ""))
    return None


def int_attr(v) -> str | None:
    v = str(v or "").strip().lower().removesuffix("px").strip()
    return v if re.fullmatch(r"\d{1,5}", v) and int(v) > 0 else None


HEADING_RE = re.compile(r"<h([2-4])\b[^>]*>([\s\S]*?)</h\1>")
HEADING_TAG_RE = re.compile(r"<(/?)h([2-4])\b")
HEADING_MAX_CHARS = 60      # 與前端 legacyHtml.ts demoteLongHeadings 相同：更長的標題會被前端改為段落


def heading_text(inner: str) -> str:
    return re.sub(r"[\s\xa0　]+", " ", html_unescape(re.sub(r"<[^>]+>", "", inner))).strip()


def normalize_heading_levels(html: str) -> tuple[str, int]:
    """內文標題從 h2 開始（頁面標題為 h1）：最高層的標題（不計前端會降為段落的過長標題）不是 h2 時整體上移，
    避免 h1 → h3／h4 跳級（例：/faculty/executives、/contact）。回傳 (html, 上移層數)。"""
    levels = [int(m.group(1)) for m in HEADING_RE.finditer(html)
              if len(heading_text(m.group(2))) <= HEADING_MAX_CHARS]
    shift = (min(levels) - 2) if levels else 0
    if shift <= 0:
        return html, 0
    return HEADING_TAG_RE.sub(lambda m: f"<{m.group(1)}h{max(2, int(m.group(2)) - shift)}", html), shift


def text_of(nodes) -> str:
    out = []
    for n in nodes:
        out.append(n.get_text() if isinstance(n, Tag) else str(n))
    return "".join(out)


class Sanitizer:
    def __init__(self, mapper: Mapper, assets: AssetStore, report: Report):
        self.mapper = mapper
        self.assets = assets
        self.report = report
        self.factory = BeautifulSoup("", "html.parser")
        self.ctx: Ctx | None = None
        self.in_th = 0
        self.base_path = ""
        self.anchor_ids: dict[str, str] = {}    # 原站錨點名稱 → 新 id（只含同頁連結的目標）
        self.anchor_placed: set[str] = set()
        self.doc_anchor_ids: dict[str, set] = {}   # 文件（ctx.where）→ 已配出的錨點 id（併入別名頁時跨片段不重複）
        self.aspect_adjusted = 0                # 原站寬高比例與實際檔案不同、height 依實際比例改寫的 <img>
        self.text_srcs: dict[str, str] = {}     # <img> src → IMAGE_TEXT_OVERRIDES 的鍵（依原始檔路徑對應到者）

    def new(self, name: str, **attrs) -> Tag:
        t = self.factory.new_tag(name)
        for k, v in attrs.items():
            t[k] = v
        return t

    # ---- 入口 ----
    def fragment(self, editors: list, title: str, ctx: Ctx, before=(), after=()) -> str:
        """內文（.meditor）＋相片輯（before／after：內文前／後的 figure，與原站 DOM 順序相同）。"""
        self.ctx = ctx
        self.prepare_anchors(editors, ctx)
        g_before = self.gallery(before)
        root = self.new("div")
        for ed in editors:
            for n in self.group_inline(self.conv_children(ed, False), force=True):
                root.append(n)
        self.place_anchors(root)
        self.cleanup(root)
        self.strip_duplicate_title(root, title)
        ids = [t["id"] for t in root.find_all(id=True)]
        if ids:
            self.report.anchors.setdefault(ctx.where, []).extend(ids)
        g_after = self.gallery(after)
        self.accessibility(g_before, root, g_after, title)
        self.redact_table_columns((g_before, root, g_after))
        parts = []
        for r in (g_before, root, g_after):
            for ch in r.contents:
                if isinstance(ch, NavigableString):
                    if not is_blank(ch):
                        parts.append(_entities(str(ch)))
                    continue
                parts.append(ch.decode(formatter=FORMATTER))
        return "\n".join(parts)

    def gallery(self, units) -> Tag:
        """相片輯 → <figure><img><figcaption>（說明文字取自原站 figcaption；空白說明省略）。"""
        root = self.new("div")
        for unit in units:
            imgs = [unit] if unit.name == "img" else unit.find_all("img")
            fig = self.new("figure")
            for img in imgs:
                for n in self.conv_img(img):
                    fig.append(n)
                    if n.get("src", "").startswith("/legacy/img/"):
                        self.ctx.gallery_imgs.append(n["src"])
            if not fig.contents:
                continue
            cap = unit.find("figcaption") if unit.name != "img" else None
            if cap is not None:
                kids = self.conv_children(cap, True)
                if not is_blank(text_of(kids)):
                    fig.append(self.append_all(self.new("figcaption"), kids))
            root.append(fig)
        n = len(root.find_all("img"))
        if n:
            rec = self.report.galleries.setdefault(self.ctx.where, {"images": 0, "captions": 0})
            rec["images"] += n
            rec["captions"] += len(root.find_all("figcaption"))
        self.cleanup(root)
        return root

    # ---- 頁內錨點（目錄／回到頂端） ----
    def same_page_fragment(self, href: str | None) -> str | None:
        """同頁錨點連結（"#x"，或指向本頁的網址加 #x）→ 錨點名稱（"#" 本身回傳 ""）；其他回傳 None。"""
        href = (href or "").strip()
        if href.startswith("#"):
            return unquote(href[1:]).strip()
        if "#" not in href or not self.ctx:
            return None
        sp = urlsplit(urljoin(self.ctx.base, href))
        if sp.scheme in ("http", "https") and is_legacy_host(sp.hostname) and sp.path == self.base_path:
            return unquote(sp.fragment).strip()
        return None

    def prepare_anchors(self, editors: list, ctx: Ctx) -> None:
        """找出同頁連結指到的錨點（<a name>／id），配給 legacy-<文件代號>- 前綴的安全 id（同一文件中不重複）。"""
        self.base_path = urlsplit(ctx.base).path
        self.anchor_ids, self.anchor_placed = {}, set()
        wanted: set[str] = set()
        for ed in editors:
            for a in ed.find_all("a", href=True):
                name = self.same_page_fragment(a["href"])
                if name:
                    wanted.add(name)
        if not wanted:
            return
        key = doc_anchor_key(ctx.where)
        used = self.doc_anchor_ids.setdefault(ctx.where, set())
        for ed in editors:
            for t in ed.find_all(True):
                for raw in (t.get("id"), t.get("name") if t.name == "a" else None):
                    raw = (raw or "").strip()
                    if raw in wanted and raw not in self.anchor_ids:
                        base = anchor_id(raw, key)
                        nid, n = base, 2
                        while nid in used:
                            nid, n = f"{base}-{n}", n + 1
                        used.add(nid)
                        self.anchor_ids[raw] = nid

    def take_anchor(self, node: Tag) -> str | None:
        """node 若是錨點目標（且尚未放置）→ 回傳新 id。"""
        if not self.anchor_ids:
            return None
        for raw in (node.get("id"), node.get("name") if node.name == "a" else None):
            raw = (raw or "").strip()
            nid = self.anchor_ids.get(raw)
            if nid and nid not in self.anchor_placed:
                self.anchor_placed.add(nid)
                return nid
        return None

    def attach_anchor(self, nid: str, out: list) -> list:
        """轉換結果若是單一可放 id 的元素就直接加上 id；否則在前面放一個空的 <a id> 標記，稍後再移到所屬區塊。"""
        tags = [n for n in out if isinstance(n, Tag)]
        loose = [n for n in out if isinstance(n, NavigableString) and not is_blank(n)]
        if len(tags) == 1 and not loose and not tags[0].get("id") and (
                tags[0].name in ANCHOR_ID_TAGS or (tags[0].name == "a" and tags[0].get("href"))):
            tags[0]["id"] = nid
            return out
        return [self.new("a", id=nid)] + out

    def place_anchors(self, root: Tag) -> None:
        """空的 <a id> 標記 → 把 id 移到最近的 h2–h4／p／td（該元素已有 id 時保留 <a id>）。"""
        for a in root.find_all("a", id=True):
            if a.get("href") or not is_blank(a.get_text()) or a.find(["img", "iframe"]):
                continue
            block = a.find_parent(list(ANCHOR_BLOCKS))
            if block is not None and block.name in ANCHOR_ID_TAGS and not block.get("id"):
                block["id"] = a["id"]
                a.decompose()

    @staticmethod
    def move_id_forward(tag: Tag) -> bool:
        """即將移除的空元素若帶有錨點 id：移到下一個可放 id 的同層元素；成功（或沒有 id）回傳 True。"""
        ids = ([tag] if tag.get("id") else []) + tag.find_all(id=True)
        if not ids:
            return True
        nxt = tag.find_next_sibling()
        if len(ids) == 1 and nxt is not None and nxt.name in ANCHOR_ID_TAGS and not nxt.get("id"):
            nxt["id"] = ids[0]["id"]
            return True
        return False

    def heading(self, text: str, level: str = "h2") -> str:
        h = self.new(level)
        h.append(NavigableString(text))
        return h.decode(formatter=FORMATTER)

    def link_paragraph(self, href: str, label: str) -> str:
        p = self.new("p")
        a = self.new("a", href=href)
        a.append(NavigableString(label))
        p.append(a)
        return p.decode(formatter=FORMATTER)

    # ---- 轉換 ----
    def conv_children(self, node: Tag, inline: bool) -> list:
        out = []
        for ch in list(node.children):
            out.extend(self.conv(ch, inline))
        return out

    def append_all(self, tag: Tag, nodes) -> Tag:
        for n in nodes:
            tag.append(n)
        return tag

    def conv(self, node, inline: bool) -> list:
        if isinstance(node, Tag):
            if is_hidden(node):
                # 以行內樣式 display:none 隱藏的內容在原站看不到（例：92909 重複的學生姓名），不搬移
                self.report.dropped["hidden(display:none)"] += 1
                self.report.hidden_element(self.ctx.where, node.get_text(" "))
                return []
            nid = self.take_anchor(node)
            out = self._conv(node, inline)
            return self.attach_anchor(nid, out) if nid else out
        return self._conv(node, inline)

    def _conv(self, node, inline: bool) -> list:
        if isinstance(node, (Comment, Doctype, CData, ProcessingInstruction, Declaration)):
            return []
        if isinstance(node, NavigableString):
            t = WS_RE.sub(" ", ZW_RE.sub("", str(node)))
            return [NavigableString(t)] if t else []
        if not isinstance(node, Tag):
            return []
        name = (node.name or "").lower()
        name = RENAME.get(name, name)

        if name in ("input", "button"):
            # 連結裡的按鈕（例：<a><input type=button value="招生簡章下載"></a>）保留按鈕文字，避免連結消失
            if node.find_parent("a") is not None:
                label = node.get("value") if name == "input" else node.get_text(" ")
                if name == "button" or (node.get("type") or "").lower() in ("button", "submit", "reset", ""):
                    label = clean_text(label)
                    if label:
                        return [NavigableString(label)]
            self.report.dropped[name] += 1
            return []
        if name in DROP_TAGS:
            self.report.dropped[name] += 1
            return []
        if name == "br":
            return [self.new("br")]
        if name == "hr":
            return [self.new("br")] if inline else [self.new("hr")]
        if name == "img":
            return self.conv_img(node)
        if name == "iframe":
            return self.conv_iframe(node, inline)
        if name == "a":
            return self.conv_a(node, inline)
        if name in INLINE_FORMAT:
            return [self.append_all(self.new(name), self.conv_children(node, True))]
        if name in HEADINGS or name == "p":
            if inline or (name in HEADINGS and self.in_th):
                # 行內情境中的區塊、或表頭格中的標題：展開內容（表頭本身已是標題）
                tail = [] if self.in_th and not inline else [self.new("br")]
                return self.conv_children(node, True) + tail
            if name == "p" and has_block(node):
                return self.block_wrapper(node)
            return [self.append_all(self.new(name), self.conv_children(node, True))]
        if name in ("ul", "ol"):
            lst = self.new(name)
            if name == "ol" and int_attr(node.get("start")):
                lst["start"] = int_attr(node.get("start"))
            loose: list = []

            def flush():
                if loose and not is_blank(text_of(loose)) or any(isinstance(n, Tag) for n in loose):
                    lst.append(self.append_all(self.new("li"), list(loose)))
                loose.clear()

            for ch in self.conv_children(node, False):
                if isinstance(ch, Tag) and ch.name in ("li", "ul", "ol"):
                    flush()
                    lst.append(ch)
                else:
                    loose.append(ch)
            flush()
            return [lst]
        if name == "li":
            return [self.append_all(self.new("li"), self.conv_children(node, False))]
        if name in ("table", "thead", "tbody", "tfoot", "tr"):
            t = self.new(name)
            for ch in self.conv_children(node, False):
                if isinstance(ch, Tag):
                    t.append(ch)
            return [t]
        if name in ("td", "th"):
            cell = self.new(name)
            for attr in ("colspan", "rowspan"):
                v = int_attr(node.get(attr))
                if v and int(v) > 1:
                    cell[attr] = v
            scope = (node.get("scope") or "").lower()
            if scope in ("row", "col", "rowgroup", "colgroup"):
                cell["scope"] = scope
            if name == "th":
                self.in_th += 1
            try:
                kids = self.conv_children(node, False)
            finally:
                if name == "th":
                    self.in_th -= 1
            return [self.append_all(cell, self.group_inline(kids, force=False))]
        if name in ("caption", "figcaption"):
            return [self.append_all(self.new(name), self.conv_children(node, True))]
        if name == "blockquote":
            if inline:
                return self.conv_children(node, True) + [self.new("br")]
            return [self.append_all(self.new(name), self.group_inline(self.conv_children(node, False), force=False))]
        if name == "figure":
            if inline:
                return self.conv_children(node, True)
            return [self.append_all(self.new("figure"), self.conv_children(node, False))]
        if name in BLOCK_WRAPPERS:
            if inline:
                return self.conv_children(node, True) + [self.new("br")]
            return self.block_wrapper(node)
        # span／font／label 與未知標籤：展開，保留子節點
        return self.conv_children(node, inline)

    def block_wrapper(self, node: Tag) -> list:
        """div 等外框：含區塊子元素就展開；只含行內內容就改成 <p>。"""
        if has_block(node):
            return self.conv_children(node, False)
        return [self.append_all(self.new("p"), self.conv_children(node, True))]

    def group_inline(self, kids: list, force: bool) -> list:
        """容器內同時有區塊與行內內容時，把連續的行內內容包成 <p>（根層一律包）。"""
        if not force and not any(isinstance(k, Tag) and k.name in OUT_BLOCKS for k in kids):
            return kids
        out, run = [], []

        def flush():
            meaningful = any(
                (isinstance(n, Tag) and n.name != "br") or (isinstance(n, NavigableString) and not is_blank(n))
                for n in run)
            if meaningful:
                out.append(self.append_all(self.new("p"), list(run)))
            run.clear()

        for k in kids:
            if isinstance(k, Tag) and k.name in OUT_BLOCKS:
                flush()
                out.append(k)
            else:
                run.append(k)
        flush()
        return out

    def conv_img(self, node: Tag) -> list:
        ctx = self.ctx
        src = img_src(node)
        rec = None
        if src.lower().startswith("data:"):
            # 內嵌 data: 圖片（例：Skype 表情 data-emoji="shiny"）：解碼存檔，保留原站的小裝飾
            rec = self.assets.store_data_uri(src, node.get("data-emoji") or node.get("alt") or "", ctx.where)
            if not rec:
                self.report.dropped["img(無法解碼的 data: src)"] += 1
                return []
            new_src = rec["path"]
        elif not src or url_scheme(src) not in ("", "http", "https"):
            self.report.dropped["img(無效 src)"] += 1
            return []
        else:
            absu = urljoin(ctx.base, src)
            sp = urlsplit(absu)
            host = (sp.hostname or "").lower()
            rule = privacy_removed(absu)
            if rule:
                # 個資保護：不搬移的圖片（例：學分抵免審核清單）改為說明文字（附在內文最後）
                ctx.add_privacy_note(rule["note"])
                self.report.privacy_change("removedImage", {"where": ctx.where, "url": asset_key(absu)})
                return []
            if absu in DROPPED_EXTERNAL_IMAGES:
                self.report.image_change("droppedExternal", ctx.where, absu, DROPPED_EXTERNAL_IMAGES[absu])
                return []
            text_prefix = TEXT_IMAGE_HOSTS.get(host)
            if text_prefix and (sp.path or "").startswith(text_prefix):
                # 外站小圖（Facebook 表情、LINE 加入好友按鈕）改為其 alt 文字，不熱連結外站
                text = clean_text(node.get("alt") or "")
                self.report.image_change("externalToText", ctx.where, absu, text)
                return [NavigableString(text)] if text else []
            if is_legacy_host(host):
                rec = self.assets.local_record(absu)
            elif self.assets.downloadable(absu):
                # www.emrd.tw（客戶自有）／Weebly 預覽主機的圖片已下載時改用本地檔；仍無法取得時保留原網址並列入報告
                rec = self.assets.local_record(absu)
            if rec:
                new_src = rec["path"]
            elif is_legacy_host(host):
                new_src = legacy_key(absu)
            else:
                new_src = absu
                self.report.external_image(absu, ctx.where)
        img = self.new("img", src=new_src)
        img["alt"] = self.image_alt(node, new_src, rec)
        style = node.get("style") or ""
        legacy: dict[str, int] = {}
        for dim in ("width", "height"):
            v = int_attr(node.get(dim))
            if not v:
                m = re.search(rf"(?<![-\w]){dim}\s*:\s*(\d+(?:\.\d+)?)px", style, re.I)
                v = str(round(float(m.group(1)))) if m and round(float(m.group(1))) > 0 else None
            if v:
                legacy[dim] = int(v)
        iw, ih = (rec or {}).get("width"), (rec or {}).get("height")
        if new_src.startswith("/legacy/") and iw and ih:
            # 本地圖片一律帶 width／height：比例取自實際檔案（縮圖後），前端不必讀檔。
            # 原站有設定顯示寬（或只設高）時沿用為顯示尺寸，另一邊依實際比例換算（與前端以往的計算相同）；
            # 縮圖後原站顯示寬大於檔案寬（原站寫的是原圖寬）時改為檔案寬。
            w, h = legacy.get("width"), legacy.get("height")
            if w:
                if rec.get("resized") and w > iw:
                    w = iw
                nh = max(1, round(w * ih / iw))
                if h and abs(h - nh) > 1:
                    self.aspect_adjusted += 1
                h = nh
            elif h:
                if rec.get("resized") and h > ih:
                    h = ih
                w = max(1, round(h * iw / ih))
            else:
                w, h = iw, ih
            img["width"], img["height"] = str(w), str(h)
        else:
            for dim in ("width", "height"):
                if dim in legacy:
                    img[dim] = str(legacy[dim])
        return [img]

    def conv_iframe(self, node: Tag, inline: bool) -> list:
        ctx = self.ctx
        src = (node.get("src") or "").strip()
        if not src:
            return []
        absu = urljoin(ctx.base, src)
        norm = normalize_iframe_src(absu)
        title = clean_text(node.get("title"))
        sp = urlsplit(absu)
        if not norm and is_legacy_host(sp.hostname) and is_asset_url(sp):
            # 站內檔案的嵌入（例：<iframe src=".../276503075.mp4">）：下載後仍以 iframe 嵌入（與原站相同）
            norm = self.assets.local(absu)
        if norm:
            f = self.new("iframe", src=norm)
            if title:
                f["title"] = title
            if node.has_attr("allowfullscreen") or "youtube" in norm or norm.startswith("/legacy/files/"):
                f["allowfullscreen"] = ""
            return [f]
        # 不在白名單的嵌入（如 Google 表單）：改成連結（連結文字為 iframe 標題或網址），內容不遺失
        href, _ = self.mapper.rewrite(absu, ctx)
        if not href:
            return []
        self.report.iframes_to_links.setdefault(absu, set()).add(ctx.where)
        a = self.new("a", href=href)
        a.append(NavigableString(title or href))
        return [a] if inline else [self.append_all(self.new("p"), [a])]

    def conv_a(self, node: Tag, inline: bool) -> list:
        ctx = self.ctx
        kids = self.conv_children(node, True)
        label = clean_text(text_of(kids))
        if label == ":::":
            return []
        if node.get("href") is None:          # <a name="..."> 錨點：只保留內容（是連結目標時由 conv 加上 id 標記）
            return kids
        frag = self.same_page_fragment(node.get("href"))
        if frag is not None:
            # 頁內連結（目錄、回到頂端）：目標存在就保留為 #legacy-…，否則改為純文字
            nid = self.anchor_ids.get(frag)
            has_img = any(isinstance(k, Tag) and (k.name == "img" or k.find("img") is not None) for k in kids)
            if not nid or (is_blank(label) and not has_img):
                self.report.fragment_links += 1     # 沒有目標、或沒有文字（原站看不到）的頁內連結
                return kids
            return [self.append_all(self.new("a", href=f"#{nid}"), kids)]
        href, _external = self.mapper.rewrite(node.get("href"), ctx)
        if href is None:
            return kids
        a = self.new("a", href=href)
        title = clean_text(node.get("title"))
        if title and title not in GENERIC_LINK_TITLES and title != label:
            a["title"] = title
        self.append_all(a, kids)
        # 內文中的檔案連結只留在內文；attachments 只來自原站附件區塊（.module-ptattach）
        return [a]

    # ---- 無障礙 ----
    def image_alt(self, node: Tag, src: str, rec: dict | None) -> str:
        """<img> 的 alt：依本地路徑指定者優先（文字版圖片／IMAGE_ALT_OVERRIDES），其次原站 alt；
        沒有意義的原站 alt（「圖片」「1」「pic」「(shiny)」…）改為空字串。"""
        where = self.ctx.where if self.ctx else ""
        for key in dict.fromkeys(k for k in (src, (rec or {}).get("originalPath")) if k):
            if key in IMAGE_TEXT_OVERRIDES:
                self.text_srcs[src] = key
                return IMAGE_TEXT_OVERRIDES[key]["alt"]
            if key in IMAGE_ALT_OVERRIDES:
                alt = IMAGE_ALT_OVERRIDES[key]
                self.report.image_change("altOverride", where, src,
                                         f"{clean_text(node.get('alt') or '')} → {alt}")
                return alt
        alt = clean_text(node.get("alt") or "")
        if alt and JUNK_ALT_RE.fullmatch(alt):
            self.report.image_change("junkAltCleared", where, src, alt)
            return ""
        return alt

    def accessibility(self, g_before: Tag, root: Tag, g_after: Tag, title: str) -> None:
        """清洗後的無障礙調整（皆依規則產生，重跑結果相同）。"""
        roots = (g_before, root, g_after)
        self.promote_section_paragraphs(root)
        self.promote_label_paragraphs(root)
        for r in roots:
            self.insert_image_texts(r)
        self.label_single_image(roots, title)
        for r in roots:
            self.mark_table_headers(r)
            self.mark_english(r)

    def redact_table_columns(self, roots) -> None:
        """個資保護（table_columns）：本文件的表格中，表頭文字為指定文字的欄整欄移除（依 colspan／rowspan
        計算欄位置；跨欄的儲存格只減少 colspan）。"""
        rule = PRIVACY_REDACTIONS["table_columns"].get(self.ctx.where) if self.ctx else None
        if not rule:
            return
        headers = {norm_compare(h) for h in rule["headers"]}
        for r in roots:
            for table in r.find_all("table"):
                rows = [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]
                grid, carry = [], set()          # grid：每列 [(儲存格, 起始欄, 跨欄數)]；carry：被上方 rowspan 佔用的格
                for ri, tr in enumerate(rows):
                    x, cells = 0, []
                    for c in tr.find_all(["td", "th"], recursive=False):
                        while (ri, x) in carry:
                            x += 1
                        span = int(c.get("colspan") or 1)
                        for dr in range(1, int(c.get("rowspan") or 1)):
                            carry.update((ri + dr, x + dx) for dx in range(span))
                        cells.append((c, x, span))
                        x += span
                    grid.append(cells)
                cols = next((cs for cs in ({x for c, x, span in cells
                                            if span == 1 and norm_compare(c.get_text()) in headers}
                                           for cells in grid) if cs), set())
                if not cols:
                    continue
                removed = 0
                for cells in grid:
                    for c, x, span in cells:
                        hit = sum(1 for col in cols if x <= col < x + span)
                        if not hit:
                            continue
                        removed += 1
                        if span - hit <= 0:
                            c.decompose()
                        elif span - hit == 1:
                            del c["colspan"]
                        else:
                            c["colspan"] = str(span - hit)
                self.report.privacy_change("tableColumnRemoved", {
                    "where": self.ctx.where, "headers": list(rule["headers"]), "cellsRemoved": removed})

    def insert_image_texts(self, root: Tag) -> None:
        """IMAGE_TEXT_OVERRIDES 的圖片：在圖片所屬的根層區塊之後插入文字版 HTML。"""
        done: set[str] = set()
        for img in root.find_all("img"):
            key = self.text_srcs.get(img.get("src", "")) or img.get("src", "")
            spec = IMAGE_TEXT_OVERRIDES.get(key)
            if spec is None or key in done:
                continue
            done.add(key)
            block = img
            while block.parent is not None and block.parent is not root:
                block = block.parent
            if block.parent is None:
                continue
            anchor = block
            for n in list(BeautifulSoup(spec["html"], "html.parser").contents):
                n = n.extract()
                anchor.insert_after(n)
                anchor = n
            self.report.image_change("textVersion", self.ctx.where, img["src"], img.get("alt", ""))

    def label_single_image(self, roots, title: str) -> None:
        """文章只有一張大圖（顯示寬 ≥ SINGLE_IMAGE_MIN_WIDTH）且沒有 alt：以文章標題（去掉 [活動] 等分類標籤）為 alt，
        並列入報告（a11y.singleImageAlt）待人工轉寫圖片內容。"""
        if not self.ctx or not self.ctx.where.startswith("post:") or not title:
            return
        imgs = [i for r in roots for i in r.find_all("img")
                if i.get("src", "").startswith("/legacy/img/") and not i["src"].startswith("/legacy/img/inline-")]
        if len(imgs) != 1:
            return
        img = imgs[0]
        if img.get("alt") or int(img.get("width") or 0) < SINGLE_IMAGE_MIN_WIDTH:
            return
        alt = clean_text(re.sub(r"^\s*[\[【［][^\]】］]{1,20}[\]】］]\s*", "", title)) or title
        img["alt"] = alt
        self.report.image_change("singleImageAlt", self.ctx.where, img["src"], alt)

    def promote_section_paragraphs(self, root: Tag) -> None:
        """頁內目錄連結的目標若是以粗體開頭的段落（例：論文 108／109 學年度、演講嘉賓「產業界 I」），
        改為 h2（第一個 <br> 之前的文字為標題，其餘留在段落）；其後表格中的標題（例：講者姓名）降一級。"""
        targets = {a["href"][1:] for a in root.find_all("a", href=True) if a["href"].startswith("#")}
        promoted = []
        for p in root.find_all("p", id=True, recursive=False):
            if p["id"] not in targets:
                continue
            kids = [c for c in p.contents if not (isinstance(c, NavigableString) and is_blank(c))]
            if not kids or not (isinstance(kids[0], Tag) and kids[0].name == "strong"):
                continue
            head, rest, seen_br = [], [], False
            for c in list(p.contents):
                if not seen_br and self._is_br(c):
                    seen_br = True
                    continue
                (rest if seen_br else head).append(c)
            text = clean_text(text_of(head))
            if not text or len(text) > 40:
                continue
            h = self.new("h2", id=p["id"])
            for c in head:
                h.append(c.extract())
            p.insert_before(h)
            del p["id"]
            for c in list(p.contents):              # 剩餘內容開頭的 <br>／空白
                if self._is_br(c) or (isinstance(c, NavigableString) and is_blank(c)):
                    c.extract()
                else:
                    break
            if not self.meaningful(p):
                p.decompose()
            promoted.append(h)
            self.report.a11y_change("headingPromoted", {"where": self.ctx.where, "id": h["id"], "text": text,
                                                        "to": "h2"})
        if not promoted:
            return
        for h in promoted[0].find_all_next(["h2", "h3"]):
            if h.find_parent("table") is not None:
                old = h.name
                h.name = "h3" if old == "h2" else "h4"
                self.report.a11y_change("headingDemoted", {"where": self.ctx.where, "text": clean_text(h.get_text(" ")),
                                                           "from": old, "to": h.name})

    def promote_label_paragraphs(self, root: Tag) -> None:
        """開頭的標籤段落（例：/contact 的 <p><u><strong>執行長</strong></u></p>）與後面的小節標題
        （<h3><u><strong>副執行長</strong></u></h3>）格式相同時，改為相同層級的標題。"""

        def chain(t: Tag) -> tuple | None:
            names = []
            while True:
                kids = [c for c in t.contents if not (isinstance(c, NavigableString) and is_blank(c))]
                if len(kids) != 1:
                    return None
                k = kids[0]
                if isinstance(k, NavigableString):
                    return tuple(names) if names else None
                if not isinstance(k, Tag) or k.name not in INLINE_FORMAT:
                    return None
                names.append(k.name)
                t = k

        tops = [c for c in root.contents if isinstance(c, Tag)]
        first_heading: dict[tuple, tuple[int, str]] = {}     # 格式鏈 → (位置, 標題層級)
        for i, t in enumerate(tops):
            c = chain(t) if t.name in HEADINGS else None
            if c and c not in first_heading:
                first_heading[c] = (i, t.name)
        if not first_heading:
            return
        for i, t in enumerate(tops):
            if t.name != "p":
                continue
            c = chain(t)
            h = first_heading.get(c) if c else None
            if h is None or len(clean_text(t.get_text())) > 20:
                continue
            if i > h[0]:
                continue                            # 只處理出現在第一個同格式標題之前的段落
            t.name = h[1]
            self.report.a11y_change("headingPromoted", {"where": self.ctx.where, "text": clean_text(t.get_text()),
                                                        "to": h[1]})

    def mark_table_headers(self, root: Tag) -> None:
        """資料表格（≥2 列、≥2 欄、沒有巢狀表格與圖片／嵌入）的標題列改為 <th scope="col">：
        * 第一列是跨滿整列的單一儲存格（表格標題）→ <caption>；有多個這種列（分組標題）→ 各組拆成 <tbody>、
          分組標題為 <th scope="rowgroup">；
        * 欄標題列（每格都有文字、不跨欄列、每格 ≤ 12 字且不含數字）→ <th scope="col">；
        * 已有 <th> 但沒有 scope 者補上 scope；兩欄的「項目｜內容」表格沒有欄標題時，第一欄為 <th scope="row">。"""
        for table in root.find_all("table"):
            if table.find("table") is not None or table.find(["img", "iframe"]) is not None:
                continue
            rows = [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]
            if len(rows) < 2:
                continue

            def cells(tr):
                return tr.find_all(["td", "th"], recursive=False)

            def span(c, attr="colspan"):
                return int(c.get(attr) or 1)

            maxc = max(sum(span(c) for c in cells(r)) for r in rows)
            if maxc < 2:
                continue
            where = self.ctx.where if self.ctx else ""
            ths = [c for r in rows for c in cells(r) if c.name == "th"]
            if ths:
                for r in rows:
                    cs = cells(r)
                    all_th = all(c.name == "th" for c in cs)
                    for i, c in enumerate(cs):
                        if c.name == "th" and not c.get("scope"):
                            c["scope"] = "col" if all_th else ("row" if i == 0 else "col")
                continue

            def is_title(tr):
                cs = cells(tr)
                return len(cs) == 1 and span(cs[0]) >= maxc and not is_blank(cs[0].get_text())

            def is_header(tr):
                cs = cells(tr)
                if len(cs) != maxc or any(c.get("colspan") or c.get("rowspan") for c in cs):
                    return False
                texts = [re.sub(r"[\s　\xa0]+", "", c.get_text()) for c in cs]
                return all(t and len(t) <= 12 and not re.search(r"\d", t) for t in texts)

            def to_th(c, scope):
                c.name = "th"
                c["scope"] = scope

            # 以 id() 比對列（bs4 的 Tag 相等比較的是內容，內容相同的兩列會被視為同一列）
            title_pos = [i for i, r in enumerate(rows) if is_title(r)]
            titles = [rows[i] for i in title_pos]
            changes = []
            if titles and titles[0] is rows[0] and len(titles) == 1:
                cell = cells(rows[0])[0]
                cap = self.new("caption")
                for ch in list(cell.contents):
                    cap.append(ch.extract())
                rows[0].decompose()
                rows = rows[1:]
                table.insert(0, cap)
                changes.append("caption")
                if is_header(rows[0]):
                    for c in cells(rows[0]):
                        to_th(c, "col")
                    changes.append("header-row")
            elif titles and titles[0] is rows[0] and all(
                    i + 1 < len(rows) and is_header(rows[i + 1]) for i in title_pos) \
                    and len({id(r.parent) for r in rows}) == 1:
                body = rows[0].parent
                starts = set(title_pos)
                groups: list[list] = []
                for i, r in enumerate(rows):
                    if i in starts:
                        groups.append([])
                    groups[-1].append(r)
                for g in groups:
                    to_th(cells(g[0])[0], "rowgroup")
                    for c in cells(g[1]):
                        to_th(c, "col")
                if body.name == "tbody":
                    for g in groups:
                        tb = self.new("tbody")
                        body.insert_before(tb)
                        for r in g:
                            tb.append(r.extract())
                    body.decompose()
                changes.append(f"rowgroups×{len(groups)}")
            elif is_header(rows[0]):
                for c in cells(rows[0]):
                    to_th(c, "col")
                changes.append("header-row")
            if not table.find("th") and maxc == 2 and all(
                    len(cells(r)) == 2 and not is_blank(cells(r)[0].get_text()) for r in rows):
                for r in rows:
                    to_th(cells(r)[0], "row")
                changes.append("row-headers")
            if changes:
                first = rows[0] if rows else None
                self.report.a11y_change("tableHeaders", {
                    "where": where, "changes": changes,
                    "firstRow": [clean_text(c.get_text(" "))[:30] for c in cells(first)] if first is not None else []})

    def mark_english(self, root: Tag) -> None:
        """全為英文的最內層區塊（不含中日韓文字、至少 EN_MIN_WORDS 個英文單字；例：英文論文名稱、英文講題）加上 lang="en"
        （WCAG 3.1.2；頁面語言為 zh-Hant-TW）。"""
        inner_blocks = ["p", "li", "ul", "ol", "table", "td", "th", "h2", "h3", "h4", "blockquote", "figure",
                        "caption", "figcaption"]
        for el in root.find_all(["p", "li", "td", "th", "h2", "h3", "h4", "caption", "figcaption", "blockquote"]):
            if el.find(inner_blocks) is not None or el.get("lang"):
                continue
            if any(isinstance(a, Tag) and a.get("lang") for a in el.parents):
                continue
            text = el.get_text(" ")
            words = EN_WORD_RE.findall(URL_TEXT_RE.sub(" ", text))     # 網址、Email 不算英文單字
            if CJK_RE.search(text) or len(words) < EN_MIN_WORDS:
                continue
            el["lang"] = "en"
            self.report.a11y_change("langEn", {"where": self.ctx.where if self.ctx else "", "tag": el.name,
                                               "text": clean_text(text)[:80]})

    # ---- 清理 ----
    @staticmethod
    def meaningful(tag: Tag) -> bool:
        if not is_blank(tag.get_text()):
            return True
        return tag.find(["img", "iframe", "hr"]) is not None

    def cleanup(self, root: Tag) -> None:
        # 移除 ":::" 無障礙定位點文字
        for s in list(root.find_all(string=True)):
            if ":::" in s:
                new = ACCESS_ANCHOR_RE.sub("", str(s))
                if new != str(s):
                    s.replace_with(NavigableString(new))
        for h in root.find_all(list(HEADINGS)):
            if is_blank(h.get_text()) and h.find("img") is not None:
                h.name = "p"                    # 只有圖片的標題（例：83957 的橫幅）不是標題，改為段落
        for _ in range(3):
            self.hoist_br(root)
            self.remove_empty_inline(root)
            self.split_paragraphs(root)
            self.collapse_br(root)
            self.remove_empty_blocks(root)
            self.trim_blocks(root)
            self.unwrap_single_p(root)

    def hoist_br(self, root: Tag) -> None:
        """行內標籤開頭／結尾的 <br> 移到標籤外，方便後續合併。"""
        for t in reversed(root.find_all(list(INLINE_FORMAT | {"a"}))):
            while True:
                last = next((c for c in reversed(t.contents) if not (isinstance(c, NavigableString) and is_blank(c))), None)
                if isinstance(last, Tag) and last.name == "br":
                    t.insert_after(last.extract())
                else:
                    break
            while True:
                first = next((c for c in t.contents if not (isinstance(c, NavigableString) and is_blank(c))), None)
                if isinstance(first, Tag) and first.name == "br":
                    t.insert_before(first.extract())
                else:
                    break

    def remove_empty_inline(self, root: Tag) -> None:
        for t in reversed(root.find_all(list(INLINE_FORMAT | {"a"}))):
            if t.parent is None:
                continue
            if t.find(["img", "iframe"]) is not None:
                continue
            if t.name == "a" and t.get("id") and not t.get("href"):
                continue                        # 頁內錨點（空的 <a id>）
            if t.find("a", id=True) is not None:
                if is_blank(t.get_text()):
                    t.unwrap()                  # 只包著錨點的空格式標籤：移除格式、保留錨點
                continue
            if is_blank(t.get_text()):
                if t.name == "a" or not t.contents:
                    if t.name == "a" and t.find("br"):
                        t.unwrap()
                    else:
                        t.decompose()
                else:
                    t.unwrap()                  # 只剩空白或 <br>：保留內容、移除格式

    @staticmethod
    def _is_br(n) -> bool:
        return isinstance(n, Tag) and n.name == "br"

    def split_paragraphs(self, root: Tag) -> None:
        """<p> 內連續兩個以上 <br> 視為段落分隔，拆成多個 <p>。"""
        for p in root.find_all("p"):
            if p.parent is None:
                continue
            segs: list[list] = [[]]
            pending: list = []
            brs = 0
            for ch in list(p.contents):
                if self._is_br(ch):
                    brs += 1
                    pending.append(ch)
                    continue
                if isinstance(ch, NavigableString) and is_blank(ch) and pending:
                    pending.append(ch)
                    continue
                if brs >= 2:
                    segs.append([])
                elif pending:
                    segs[-1].extend(pending)
                pending, brs = [], 0
                segs[-1].append(ch)
            if len(segs) == 1:
                continue
            anchor = p
            for i, seg in enumerate(segs):
                np_ = self.new("p")
                if i == 0 and p.get("id"):
                    np_["id"] = p["id"]         # 頁內錨點 id 留在第一段
                for n in seg:
                    np_.append(n.extract())
                anchor.insert_after(np_)
                anchor = np_
            p.decompose()

    def collapse_br(self, root: Tag) -> None:
        for br in root.find_all("br"):
            if br.parent is None:
                continue
            nxt = br.next_sibling
            while nxt is not None and isinstance(nxt, NavigableString) and is_blank(nxt):
                nxt = nxt.next_sibling
            while self._is_br(nxt):
                after = nxt.next_sibling
                nxt.decompose()
                nxt = after
                while nxt is not None and isinstance(nxt, NavigableString) and is_blank(nxt):
                    nxt = nxt.next_sibling

    def remove_empty_blocks(self, root: Tag) -> None:
        for t in reversed(root.find_all(["p", "h2", "h3", "h4", "li", "blockquote", "figure", "figcaption", "caption"])):
            if t.parent is not None and not self.meaningful(t) and self.move_id_forward(t):
                t.decompose()
        for t in reversed(root.find_all(["ul", "ol"])):
            if t.parent is not None and not t.find("li"):
                t.decompose()
        for t in reversed(root.find_all(["tr"])):
            if t.parent is not None and not t.find(["td", "th"]):
                t.decompose()
        for t in reversed(root.find_all(["thead", "tbody", "tfoot"])):
            if t.parent is not None and not t.find("tr"):
                t.decompose()
        for t in reversed(root.find_all("table")):
            if t.parent is not None and not self.meaningful(t):
                t.decompose()                     # 只有空白格的排版表格
        # 根層多餘的 <br>／<hr> 連續出現
        for hr in root.find_all("hr"):
            prev = hr.find_previous_sibling()
            if prev is not None and prev.name == "hr":
                hr.decompose()

    def trim_blocks(self, root: Tag) -> None:
        """去除區塊開頭／結尾的 <br> 與一般空白。"""
        for t in root.find_all(list(TEXT_BLOCKS)):
            for edge in (0, -1):
                while t.contents:
                    c = t.contents[edge]
                    if self._is_br(c) or (isinstance(c, NavigableString) and not str(c).strip(" \t\n\r\f\v")):
                        c.extract()
                    else:
                        break
            if t.contents and isinstance(t.contents[0], NavigableString):
                s = t.contents[0]
                s.replace_with(NavigableString(str(s).lstrip(" \t\n\r\f\v")))
            if t.contents and isinstance(t.contents[-1], NavigableString):
                s = t.contents[-1]
                s.replace_with(NavigableString(str(s).rstrip(" \t\n\r\f\v")))

    def unwrap_single_p(self, root: Tag) -> None:
        """表格儲存格／清單項目裡只有單一 <p> 時，去掉多餘的 <p>。"""
        for cell in root.find_all(["td", "th", "li"]):
            elems = [c for c in cell.contents if isinstance(c, Tag)]
            loose = [c for c in cell.contents if isinstance(c, NavigableString) and not is_blank(c)]
            if len(elems) == 1 and elems[0].name == "p" and not loose:
                pid = elems[0].get("id")
                if pid and (cell.name not in ANCHOR_ID_TAGS or cell.get("id")):
                    continue                    # 保留帶錨點 id 的 <p>
                if pid:
                    cell["id"] = pid
                elems[0].unwrap()

    def strip_duplicate_title(self, root: Tag, title: str) -> None:
        """內文開頭若是與頁面標題相同的標題（或粗體段落），移除以免重複（錨點 id 移到下一個元素）。"""
        if not title:
            return
        first = next((c for c in root.contents if isinstance(c, Tag)), None)
        if first is not None and first.name in ("h2", "h3", "h4", "p") and \
                not first.find(["img", "iframe"]) and norm_compare(first.get_text()) == norm_compare(title) \
                and self.move_id_forward(first):
            first.decompose()


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

@dataclass
class PostInfo:
    id: str
    fetch_url: str
    variants: set = field(default_factory=set)      # 所有出現過的原站路徑（轉址用）
    sources: set = field(default_factory=set)       # 在哪裡被發現
    list_title: str = ""


class Migration:
    def __init__(self, args):
        self.args = args
        self.http = Http(args.refresh, args.workers, args.delay)
        restore = bool(getattr(args, "original_images", False))
        self.assets = AssetStore(self.http, args.refresh, 0 if restore else args.max_image_width,
                                 args.weebly_mirror, convert_bmp=not restore)
        self.report = Report()
        self.mapper = Mapper(self)
        self.sanitizer = Sanitizer(self.mapper, self.assets, self.report)

        self.ia = json.loads(IA_PATH.read_text("utf-8"))
        self.page_specs: list[dict] = []
        self.collection_specs: list[dict] = []
        self.code_map: dict[str, str] = {}
        self.group_first: dict[str, str] = {}
        self.unit_slug: dict[str, str] = {}
        self.post_page: dict[str, str] = {}

        self.page_docs: dict[str, RawDoc] = {}
        self.list_pages: dict[str, int] = {}        # 有分頁清單的原站代碼 → 頁數
        self.collection_entries: dict[str, list] = {}
        self.collection_docs: dict[str, RawDoc] = {}
        self.extra_units: dict[str, dict] = {}      # ia.json 未列入的列表單元
        self.skipped_units: dict[str, dict] = {}
        self.aux_docs: dict[str, RawDoc] = {}       # 群組首頁／別名頁（不搬移，但收集文章）
        self.posts: dict[str, PostInfo] = {}
        self.post_docs: dict[str, RawDoc] = {}
        self.alive_posts: set[str] = set()
        self.dead_posts: dict[str, dict] = {}
        self.page_post_variants: dict[str, set] = {}  # 404 型頁面的文章變體網址
        self.links450: dict[str, Link450] = {}
        self._pending450: dict[str, str] = {}
        self.link450_sources: dict[str, set] = {}   # 450 編號 → 在哪裡被連結（失效時的轉址依據）
        self.unknown_pages: dict[str, dict] = {}    # 連結到、但 ia.json 未列入的原站頁面／單元（代碼 → 檢查結果）
        self.print_docs: dict[str, RawDoc] = {}     # 連結紀錄編號 → 有內文的友善列印版本（目標已下架時改用）
        self.print_checks: dict[str, dict] = {}     # 檢查過的列印版本（報告用）

    # ---- ia.json ----
    def load_ia(self) -> None:
        ia = self.ia
        entries = [(g, p) for g in ia["groups"] for p in g["pages"]] + [(None, p) for p in ia.get("standalone", [])]
        for _g, p in entries:
            (self.collection_specs if p.get("collection") else self.page_specs).append(p)
            self.code_map[p["legacy"]] = "/" + p["slug"]
        for g in ia["groups"]:
            if g.get("legacy") and g["pages"]:
                first = "/" + g["pages"][0]["slug"]
                self.group_first[g["legacy"]] = first
                self.code_map.setdefault(g["legacy"], first)
        for code, path in ia.get("aliases", {}).items():
            if not code.startswith("$"):
                self.code_map.setdefault(code, path)
        for p in self.collection_specs:
            parts = p["legacy"].split("-")
            if parts[0] == "403" and len(parts) >= 3:
                self.unit_slug[parts[2]] = "/" + p["slug"]
        for code, path in self.code_map.items():
            parts = code.split("-")
            if parts[0] == "404" and len(parts) >= 3:
                self.post_page[parts[2]] = path

    # ---- 抓取 ----
    def fetch_docs(self, urls) -> dict[str, RawDoc]:
        resps = self.http.get_many(urls)
        docs = {}
        for u, r in resps.items():
            d = parse_doc(r, u)
            if d.error or (d.status != 200 and d.status not in (301, 302, 303, 307, 308)):
                self.report.fetch_failures[u] = d.error or f"HTTP {d.status}"
            docs[u] = d
        return docs

    @staticmethod
    def pagination_url(doc: RawDoc, code: str, n: int) -> str:
        if doc.page_prefix and "PAGE" in doc.page_prefix:
            return doc.page_prefix.replace("PAGE", str(n))
        return page_url(code, n)

    def crawl_list(self, code: str) -> tuple[RawDoc, list]:
        """抓取列表（含所有分頁）；回傳第一頁與依序的全部條目。"""
        first = self.fetch_docs([page_url(code)])[page_url(code)]
        items = list(first.items)
        if first.ok and first.has_list and first.total_pages > 1:
            urls = [self.pagination_url(first, code, n) for n in range(2, first.total_pages + 1)]
            docs = self.fetch_docs(urls)
            for u in urls:
                items.extend(docs[u].items)
        self.list_pages[code] = first.total_pages if first.has_list else 0
        return first, items

    def crawl_pages(self) -> None:
        log(f"抓取 {len(self.page_specs)} 個頁面…")
        urls = {p["slug"]: page_url(p["legacy"]) for p in self.page_specs}
        docs = self.fetch_docs(urls.values())
        more = []
        for p in self.page_specs:
            doc = docs[urls[p["slug"]]]
            self.page_docs[p["slug"]] = doc
            self.list_pages[p["legacy"]] = doc.total_pages if doc.has_list else 0
            if doc.ok and doc.has_list and doc.total_pages > 1:
                for n in range(2, doc.total_pages + 1):
                    more.append((p["slug"], self.pagination_url(doc, p["legacy"], n)))
        if more:
            extra = self.fetch_docs(u for _, u in more)
            for slug, u in more:
                self.page_docs[slug].items.extend(extra[u].items)

    def crawl_collections(self) -> None:
        log(f"抓取 {len(self.collection_specs)} 個文章列表（含分頁）…")
        for p in self.collection_specs:
            first, items = self.crawl_list(p["legacy"])
            self.collection_docs[p["slug"]] = first
            self.collection_entries[p["slug"]] = items
            log(f"  {p['slug']}: {first.total_pages} 頁、{len(items)} 筆")

    def crawl_aux(self) -> None:
        """群組首頁、別名頁（不另外搬移）與首頁上未列入 ia.json 的列表單元：收集其中的文章。"""
        aux_codes = sorted({c for c in self.group_first} |
                           {c for c in self.ia.get("aliases", {}) if c.startswith("412-")})
        log(f"檢查 {len(aux_codes)} 個群組首頁／別名頁…")
        for code in aux_codes:
            first, items = self.crawl_list(code)
            first.items = items
            self.aux_docs[code] = first

        home_url = f"{BASE}/index.php{LANG_QUERY}"
        try:
            home = self.http.get(home_url).text()
        except FetchError as e:
            self.report.fetch_failures[home_url] = str(e)
            home = ""
        banner = set(re.findall(r"mobile_rcg_mstr&Nbr=(\d+)[\"'],\s*'#banner'", home))
        units = set(re.findall(r"mobile_rcg_mstr&Nbr=(\d+)", home))
        units |= set(re.findall(r"/p/403-1039-(\d+)(?:-\d+)?\.php", home))
        for doc in list(self.page_docs.values()) + list(self.aux_docs.values()):
            for ed in doc.editors:
                units |= set(re.findall(r"/p/403-1039-(\d+)(?:-\d+)?\.php", str(ed)))
        for unit in sorted(units - set(self.unit_slug), key=int):
            code = f"403-{SITE_ID}-{unit}"
            first, items = self.crawl_list(code)
            info = {"unit": unit, "title": first.title, "legacyUrl": page_url(code),
                    "items": items, "pages": first.total_pages}
            if unit in banner:
                self.skipped_units[unit] = info
                log(f"  略過首頁輪播單元 {unit}（{first.title}，{len(items)} 筆）")
            elif first.ok:
                self.extra_units[unit] = info
                log(f"  發現 ia.json 未列入的列表單元 {unit}（{first.title}，{len(items)} 筆）")

    def add_post_ref(self, url: str, source: str, title: str = "") -> str | None:
        """登記一篇文章（405／406／404 文章、友善列印頁）；回傳文章編號。"""
        ref = parse_legacy(url)
        if ref is None or not ref.id:
            return None
        if ref.type == "404" and not ref.preview and ref.code in self.code_map:
            return None                              # ia.json 中的 404 型頁面
        if ref.type not in ("405", "406", "404", "16"):
            return None
        if ref.id in self.post_page:                 # 例：405-1039-119872,c7720 → /alumni-hall
            if ref.type in ("405", "406"):
                self.page_post_variants.setdefault(ref.id, set()).add(ref.path)
            return None
        info = self.posts.get(ref.id)
        if info is None:
            fetch = legacy_page_url(ref.path) if ref.type in ("405", "406") and not ref.preview \
                else page_url(f"404-{SITE_ID}-{ref.id}")
            info = self.posts[ref.id] = PostInfo(ref.id, fetch)
        if ref.type in ("405", "406", "404") and not ref.preview:
            info.variants.add(ref.path)
        if ref.type in ("405", "406") and not ref.preview:
            if not info.fetch_url.split("/p/")[1].startswith(("405-", "406-")):
                info.fetch_url = legacy_page_url(ref.path)
        info.sources.add(source)
        if title and not info.list_title:
            info.list_title = title
        return ref.id

    def note_link(self, url: str, source: str, title: str = "") -> None:
        ref = parse_legacy(url)
        if ref is None:
            return
        if ref.type == "450" and ref.id:
            self.link450_sources.setdefault(ref.id, set()).add(source)
            if ref.id not in self.links450 and ref.id not in self._pending450:
                self._pending450[ref.id] = ref.path
        elif (ref.type == "412" and ref.code not in self.code_map) or (
                ref.type == "403" and ref.id not in self.unit_slug
                and ref.id not in self.extra_units and ref.id not in self.skipped_units):
            self.unknown_pages.setdefault(ref.code, {"foundIn": set()})["foundIn"].add(source)
        else:
            self.add_post_ref(url, source, title)

    def scan_editor_links(self, doc: RawDoc, source: str) -> None:
        for ed in doc.editors:
            for a in ed.find_all("a", href=True):
                self.note_link(urljoin(doc.url, a["href"].strip()), source)

    def resolve_450s(self) -> None:
        while self._pending450:
            batch = dict(self._pending450)
            self._pending450.clear()
            urls = {i: legacy_page_url(p) for i, p in batch.items()}
            resps = self.http.get_many(urls.values())
            for i, path in batch.items():
                r = resps[urls[i]]
                rec = Link450(i, path, urls[i])
                if isinstance(r, FetchError):
                    rec.error = str(r)
                    self.report.fetch_failures[urls[i]] = str(r)
                else:
                    rec.status = r.status
                    if r.status in (301, 302, 303, 307, 308) and r.location:
                        rec.target = r.location
                self.links450[i] = rec
                if rec.target:
                    tref = parse_legacy(rec.target)
                    if tref is not None and tref.type == "450" and tref.id and tref.id not in self.links450:
                        self._pending450[tref.id] = tref.path
                    else:
                        self.note_link(rec.target, f"450:{i}")

    def crawl_posts(self) -> None:
        # 文章的 legacyUrl／抓取網址取第一個看到的網址：條目最多的列表（主公告欄）優先，
        # 同一篇文章在其他列表的網址（例：,r1782）只作為轉址，避免新增列表時改變既有的 legacyUrl
        by_size = sorted(self.collection_entries.items(), key=lambda kv: -len(kv[1]))
        for slug, items in by_size:
            for it in items:
                self.note_link(it.href, f"collection:{slug}", it.title)
        for slug, doc in self.page_docs.items():
            for it in doc.items:
                self.note_link(it.href, f"page:{slug}", it.title)
            self.scan_editor_links(doc, f"page:{slug}")
        for code, doc in self.aux_docs.items():
            for it in doc.items:
                self.note_link(it.href, f"aux:{code}", it.title)
            self.scan_editor_links(doc, f"aux:{code}")
        for unit, info in self.extra_units.items():
            for it in info["items"]:
                self.note_link(it.href, f"unit:{unit}", it.title)
        for unit, info in self.skipped_units.items():
            for it in info["items"]:                 # 首頁輪播的 450 連結紀錄：不搬移內容，只解析目標以便轉址
                ref = parse_legacy(it.href)
                if ref is not None and ref.type == "450":
                    self.note_link(it.href, f"banner:{unit}", it.title)
        self.crawl_post_rounds()
        self.verify_unknown_pages()
        if self.crawl_print_views():                 # 列印版本中的連結可能指到新的文章
            self.crawl_post_rounds()
            self.verify_unknown_pages()

    def crawl_post_rounds(self) -> None:
        rnd = 0
        while True:
            self.resolve_450s()
            todo = [p for i, p in self.posts.items() if i not in self.post_docs]
            if not todo:
                break
            rnd += 1
            log(f"抓取文章（第 {rnd} 輪）：{len(todo)} 篇…")
            docs = self.fetch_docs(p.fetch_url for p in todo)
            for p in todo:
                doc = docs[p.fetch_url]
                self.post_docs[p.id] = doc
                if doc.ok:
                    self.alive_posts.add(p.id)
                    self.scan_editor_links(doc, f"post:{p.id}")
                else:
                    self.dead_posts[p.id] = {"url": p.fetch_url, "status": doc.status,
                                             "location": doc.location, "foundIn": sorted(p.sources)}

    def crawl_print_views(self) -> bool:
        """列表中的 450 連結紀錄若目標已下架（原站轉回首頁），檢查其友善列印版本（16-1039-<id>.php）：
        列印版本仍保有公告內文時（例：83957），改由列印版本搬移完整內文。回傳是否有新的連結需要追蹤。"""
        cands: dict[str, str] = {}
        for slug, items in self.collection_entries.items():
            for it in items:
                ref = parse_legacy(it.href)
                if ref is None or ref.type != "450" or not ref.id or ref.id in cands:
                    continue
                rec = self.links450.get(ref.id)
                if rec is None:
                    continue
                if not rec.target:
                    cands[ref.id] = "連結紀錄沒有目標"
                elif self.mapper.dead_destination(rec.target) is not None:
                    cands[ref.id] = "連結紀錄的目標已下架"
        if not cands:
            return False
        urls = {lid: page_url(f"16-{SITE_ID}-{lid}") for lid in cands}
        docs = self.fetch_docs(urls.values())
        before = (len(self.posts), len(self._pending450), len(self.unknown_pages))
        for lid in sorted(cands, key=int):
            doc = docs[urls[lid]]
            has = doc.ok and (bool(doc.gallery_before or doc.gallery_after) or any(
                not is_blank(ed.get_text()) or ed.find(["img", "iframe", "table"]) is not None for ed in doc.editors))
            self.print_checks[lid] = {"url": urls[lid], "status": doc.status, "reason": cands[lid],
                                      "title": doc.title, "hasContent": has}
            if has:
                self.print_docs[lid] = doc
                self.scan_editor_links(doc, f"post:{lid}")
                log(f"  連結紀錄 {lid} 的目標已下架，改由列印版本搬移內文（{doc.title}）")
        return (len(self.posts), len(self._pending450), len(self.unknown_pages)) != before

    def verify_unknown_pages(self) -> None:
        """檢查被連結到、但 ia.json 未列入的原站頁面：已下架（轉址首頁）或仍存在（需決定是否搬移）。"""
        if not self.unknown_pages:
            return
        urls = {code: page_url(code) for code in self.unknown_pages}
        docs = self.fetch_docs(urls.values())
        for code, info in self.unknown_pages.items():
            doc = docs[urls[code]]
            info.update(url=urls[code], status=doc.status, location=doc.location, title=doc.title,
                        alive=doc.ok)

    # ---- 資產 ----
    def collect_assets(self) -> None:
        def visible(t: Tag, root: Tag) -> bool:
            """不在丟棄的標籤內、本身與祖先（到 root 為止）都不是 display:none。"""
            if t.find_parent(list(DROP_TAGS)) is not None:
                return False
            node = t
            while node is not None and node is not root:
                if is_hidden(node):
                    return False
                node = node.parent
            return True

        def want_img(img: Tag, base: str, where: str):
            src = img_src(img)
            if src and not src.lower().startswith("data:"):
                u = urljoin(base, src)
                if self.assets.downloadable(u):
                    self.assets.want(u, "img", where)

        def scan_editor(ed: Tag, base: str, where: str):
            for img in ed.find_all("img"):
                if visible(img, ed):
                    want_img(img, base, where)
            for a in ed.find_all("a", href=True):
                if visible(a, ed):
                    want_link(urljoin(base, a["href"].strip()), where)
            for f in ed.find_all("iframe", src=True):
                u = urljoin(base, f["src"].strip())
                if visible(f, ed) and not normalize_iframe_src(u):
                    want_link(u, where)

        def scan(doc: RawDoc, where: str):
            for unit in doc.gallery_before + doc.gallery_after:        # 相片輯
                for img in ([unit] if unit.name == "img" else unit.find_all("img")):
                    want_img(img, doc.url, where)
            for ed in doc.editors:
                scan_editor(ed, doc.url, where)
            for att in doc.attachments:
                want_link(att.href, where, attachment=True)
            for it in doc.items:
                want_link(it.href, where)

        def want_link(u: str, where: str, attachment: bool = False):
            sp = urlsplit(u)
            ref = parse_legacy(u)
            if ref is not None and ref.type == "450":
                rec = self.links450.get(ref.id)
                if rec and rec.target:
                    u, sp = rec.target, urlsplit(rec.target)
            if self.assets.downloadable(u, link=True):
                kind = "img" if url_ext(sp.path) in IMAGE_EXTS and not attachment else "file"
                self.assets.want(u, kind, where)

        for slug, doc in self.page_docs.items():
            scan(doc, f"page:{slug}")
        for code, slug in self.alias_merges().items():
            scan(self.aux_docs[code], f"page:{slug}")
        for pid in sorted(self.alive_posts, key=int):
            scan(self.post_docs[pid], f"post:{pid}")
        for lid, doc in sorted(self.print_docs.items()):
            scan(doc, f"post:{lid}")
        for slug, items in self.collection_entries.items():
            for it in items:
                want_link(it.href, f"collection:{slug}")
                if it.body is not None:                 # 列表條目本身的內文（影音專區）
                    scan_editor(it.body, it.base or it.href, f"collection:{slug}")
        log(f"下載 {len(self.assets.wanted)} 個檔案（站內圖片／附件、www.emrd.tw 圖片）…")
        self.assets.download_all()

    # ---- 組裝輸出 ----
    def attachment_from(self, raw: RawItem, ctx: Ctx) -> None:
        ref = parse_legacy(raw.href)
        target = (self.links450[ref.id].target if ref and ref.type == "450" and ref.id in self.links450 else None) \
            or raw.href
        rule = privacy_removed(target)
        if rule:
            # 個資保護：不搬移的附件不列出，改為說明文字（附在內文最後）
            ctx.add_privacy_note(rule["note"])
            self.report.privacy_change("removedAttachment", {"where": ctx.where, "url": asset_key(target),
                                                             "label": raw.title})
            return
        href, _ = self.mapper.rewrite(raw.href, ctx)
        if not href:
            return
        meta = None
        rec = None
        if href.startswith("/legacy/"):
            ref = parse_legacy(raw.href)
            target = self.links450[ref.id].target if ref and ref.type == "450" and ref.id in self.links450 else raw.href
            rec = self.assets.record(target or raw.href)
        if rec:
            ext = url_ext(href).lstrip(".").upper()
            meta = f"{ext} · {human_size(rec['bytes'])}" if ext else human_size(rec["bytes"])
        label = raw.title or (rec or {}).get("filename") or href.rsplit("/", 1)[-1]
        ctx.add_attachment(label, href, meta)

    def build_item(self, raw: RawItem, ctx: Ctx) -> dict:
        href, external = self.mapper.rewrite(raw.href, ctx)
        item = {"title": raw.title, "href": href or legacy_key(raw.href), "external": bool(external)}
        if raw.date:
            item["date"] = raw.date
        return item

    def is_ia_page(self, url: str) -> bool:
        """是否為 ia.json 中的頁面或列表（選單頁的子頁連結）。"""
        ref = parse_legacy(url)
        return ref is not None and ref.type in ("412", "403") and ref.code in self.code_map

    def alias_merges(self) -> dict[str, str]:
        """ia.json 中有自己內容的 412 別名頁 → 要併入的目標頁 slug（只列子頁的選單頁不併入）。

        例：412-1039-7707（EMRD 校友會：Google 日曆＋4 個條目）→ study/alumni-update。
        """
        out: dict[str, str] = {}
        page_slugs = {p["slug"] for p in self.page_specs}
        for code, path in self.ia.get("aliases", {}).items():
            if not code.startswith("412-"):
                continue
            doc, slug = self.aux_docs.get(code), path.lstrip("/")
            if doc is None or not doc.ok or slug not in page_slugs:
                continue
            has_html = bool(doc.gallery_before or doc.gallery_after) or any(
                not is_blank(ed.get_text()) or ed.find(["img", "iframe", "table"]) is not None for ed in doc.editors)
            content_items = [it for it in doc.items if not self.is_ia_page(it.href)]
            if has_html or content_items or doc.attachments:
                out[code] = slug
        return out

    def merge_alias(self, code: str, slug: str, html: str, items: list, ctx: Ctx) -> tuple[str, list]:
        """把別名頁的內容接在目標頁之後：原站標題作為小節標題、內文（含相片輯）、條目、附件。"""
        aux = self.aux_docs[code]
        actx = Ctx(aux.url, ctx.where)
        part = self.sanitizer.fragment(aux.editors, aux.title, actx, aux.gallery_before, aux.gallery_after)
        if part:
            heading = self.sanitizer.heading(aux.title) if aux.title else ""
            html = "\n".join(x for x in (html, heading, part) if x)
        known = {it["href"] for it in items}
        added = []
        for it in aux.items:
            item = self.build_item(it, actx)
            if item["href"] not in known:
                items.append(item)
                known.add(item["href"])
                added.append(item["href"])
        for att in aux.attachments:
            self.attachment_from(att, actx)
        for a in actx.attachments:
            ctx.add_attachment(a["label"], a["href"], a.get("meta"))
        for note in actx.privacy_notes:
            ctx.add_privacy_note(note)
        ctx.post_links |= actx.post_links
        self.merged_aliases.append({
            "code": code, "title": aux.title, "legacyUrl": page_url(code), "into": "/" + slug,
            "htmlMerged": bool(part), "itemsAdded": added, "attachmentsAdded": len(actx.attachments),
        })
        return html, items

    def post_title(self, pid: str) -> str:
        doc = self.post_docs.get(pid)
        return (doc.title if doc else "") or self.posts[pid].list_title

    def with_privacy_notes(self, html: str, ctx: Ctx) -> str:
        """個資保護（remove_assets）：被移除的圖片／附件改為一段說明文字，附在內文最後（同一段只出現一次）。"""
        parts = [html] if html else []
        for note in ctx.privacy_notes:
            if f"<p>{_entities(note)}</p>" in html:
                continue
            parts.append(f"<p>{_entities(note)}</p>")
            self.report.privacy_change("noteAdded", {"where": ctx.where, "note": note})
        return "\n".join(parts)

    def build(self) -> None:
        log("清洗內容、改寫連結…")
        self.out_pages: dict[str, dict] = {}
        self.out_posts: dict[str, dict] = {}
        self.out_collections: dict[str, dict] = {}
        self.link_posts: dict[str, dict] = {}
        self.merged_aliases: list[dict] = []
        self.collection_dupes: list[dict] = []
        referenced: set[str] = set()

        merges: dict[str, list] = {}
        for code, slug in sorted(self.alias_merges().items()):
            merges.setdefault(slug, []).append(code)

        for p in self.page_specs:
            slug = p["slug"]
            doc = self.page_docs[slug]
            ctx = Ctx(doc.url, f"page:{slug}")
            title = doc.title or p.get("label", "")
            html = self.sanitizer.fragment(doc.editors, title, ctx, doc.gallery_before, doc.gallery_after) \
                if doc.ok else ""
            items = [self.build_item(it, ctx) for it in doc.items]
            for att in doc.attachments:            # 附件只取原站附件區塊
                self.attachment_from(att, ctx)
            for code in merges.get(slug, []):
                html, items = self.merge_alias(code, slug, html, items, ctx)
            html = self.with_privacy_notes(html, ctx)
            referenced |= ctx.post_links
            self.out_pages[slug] = {
                "slug": slug, "title": title, "legacyUrl": page_url(p["legacy"]),
                "html": html, "items": items, "attachments": ctx.attachments,
            }

        for p in self.collection_specs:
            slug = p["slug"]
            ctx = Ctx(page_url(p["legacy"]), f"collection:{slug}")
            ids: list[str] = []
            for it in self.collection_entries.get(slug, []):
                pid = self.entry_post_id(it, slug, ctx, ids)
                if not pid:
                    continue
                if pid in ids:
                    self.collection_dupes.append({"collection": slug, "id": pid, "title": it.title, "href": it.href})
                    continue
                ids.append(pid)
            referenced |= set(ids) | ctx.post_links
            doc = self.collection_docs[slug]
            self.out_collections[slug] = {
                "slug": slug, "title": doc.title or p.get("label", ""),
                "legacyUrl": page_url(p["legacy"]), "postIds": ids,
            }

        memberships: dict[str, list] = {}
        for p in self.collection_specs:
            for pid in self.out_collections[p["slug"]]["postIds"]:
                memberships.setdefault(pid, []).append(p["slug"])

        for pid in sorted(self.alive_posts, key=int):
            info, doc = self.posts[pid], self.post_docs[pid]
            ctx = Ctx(doc.url, f"post:{pid}")
            title = doc.title or info.list_title
            html = self.sanitizer.fragment(doc.editors, title, ctx, doc.gallery_before, doc.gallery_after)
            for att in doc.attachments:            # 附件只取原站附件區塊
                self.attachment_from(att, ctx)
            html = self.with_privacy_notes(html, ctx)
            referenced |= (ctx.post_links - {pid})
            post = {"id": pid, "title": title, "legacyUrl": info.fetch_url}
            if doc.date:
                post["date"] = doc.date
            post["collections"] = memberships.get(pid, [])
            post["html"] = html
            post["attachments"] = ctx.attachments
            cover = self.cover_of(ctx, html)
            if cover:
                post["cover"] = cover
            self.out_posts[pid] = post

        for lid, lp in self.link_posts.items():
            post = {"id": lid, "title": lp["title"], "legacyUrl": lp["legacyUrl"],
                    "collections": memberships.get(lid, []), "html": "", "attachments": []}
            pdoc = self.print_docs.get(lid)
            if pdoc is not None:
                # 目標已下架、但友善列印版本仍有完整內文（例：83957）：搬移列印版本的內文、相片輯與附件
                ctx = Ctx(pdoc.url, f"post:{lid}")
                post["title"] = pdoc.title or lp["title"]
                post["legacyUrl"] = pdoc.url
                if pdoc.date:
                    post["date"] = pdoc.date
                    post = {k: post[k] for k in ("id", "title", "legacyUrl", "date", "collections", "html", "attachments")}
                post["html"] = self.sanitizer.fragment(pdoc.editors, post["title"], ctx,
                                                       pdoc.gallery_before, pdoc.gallery_after)
                for att in pdoc.attachments:
                    self.attachment_from(att, ctx)
                post["html"] = self.with_privacy_notes(post["html"], ctx)
                post["attachments"] = ctx.attachments
                cover = self.cover_of(ctx, post["html"])
                if cover:
                    post["cover"] = cover
                referenced |= (ctx.post_links - {lid})
                lp["kind"] = "printView"
                self.out_posts[lid] = post
                continue
            if lp["body"] is not None:
                # 影音專區：列表條目本身的內文（YouTube 播放器＋日期）；條目標題原本連到的相關文章保留為連結
                ctx = Ctx(lp["bodyBase"] or lp["legacyUrl"], f"post:{lid}")
                parts = [self.sanitizer.fragment([lp["body"]], lp["title"], ctx)]
                if lp["href"].startswith("/posts/"):
                    tid = lp["href"].rsplit("/", 1)[1]
                    parts.append(self.sanitizer.link_paragraph(lp["href"], self.post_title(tid) or lp["title"]))
                elif lp["href"]:
                    parts.append(self.sanitizer.link_paragraph(lp["href"], lp["title"]))
                post["html"] = self.with_privacy_notes("\n".join(p for p in parts if p), ctx)
                cover = self.cover_of(ctx, post["html"])
                if cover:
                    post["cover"] = cover
                referenced |= (ctx.post_links - {lid})
                lp["kind"] = "listBody"
            else:
                post["html"] = self.sanitizer.link_paragraph(lp["href"], lp["title"])
                lp["kind"] = "link"
            if lp["href"].startswith("/legacy/files/"):
                rec = self.assets.record(lp["target"]) or {}
                ext = url_ext(lp["href"]).lstrip(".").upper()
                att = {"label": lp["title"], "href": lp["href"]}
                if rec.get("bytes"):
                    att["meta"] = f"{ext} · {human_size(rec['bytes'])}"
                post["attachments"].append(att)
            if lp["href"].startswith("/posts/"):
                referenced.add(lp["href"].rsplit("/", 1)[1])
            self.out_posts[lid] = post

        self.referenced = referenced
        self.finalize_html()

    def finalize_html(self) -> None:
        """整份文件層級的調整（片段合併之後）：標題層級從 h2 開始、嵌入影片的標題。"""
        docs = [(f"page:{s}", p) for s, p in self.out_pages.items()] + \
               [(f"post:{i}", p) for i, p in self.out_posts.items()]
        for where, obj in docs:
            html, shift = normalize_heading_levels(obj["html"])
            if shift:
                obj["html"] = html
                self.report.a11y_change("headingLevelsShifted", {"where": where, "by": shift})
        self.fix_video_titles(docs)

    def fix_video_titles(self, docs: list) -> None:
        """YouTube 嵌入的 title（前端作為 iframe 的無障礙名稱）：原站常見通用標題（YouTube video player、影片 MV）
        或複製自其他影片的標題（例：烤肉會影片標為「新生破冰營」）改為該影片的明確標題。

        原站標題「可信」：非通用，且只用在這一部影片上（或包含在所屬文章標題中）。替代標題依序取：同一影片在其他
        文件中的可信標題（影音專區條目優先）→ 影音專區列表標題 → 影片前最近的小節標題或文件標題（「影片：…」）。
        同一文件中標題重複時加上（2）、（3）。"""
        iframe_re = re.compile(r"<iframe\b[^>]*>")
        listbody = {f"post:{lid}" for lid, lp in self.link_posts.items() if lp.get("kind") == "listBody"}
        occ: dict[str, list] = {}               # where → [(tag, vid, 原標題, 小節標題)]
        title_ids: dict[str, set] = {}
        for where, obj in docs:
            html = obj["html"]
            for m in iframe_re.finditer(html):
                tag = BeautifulSoup(m.group(0), "html.parser").find("iframe")
                vid = youtube_id(urlsplit(tag.get("src", "")))[0] if tag is not None else None
                if not vid:
                    occ.setdefault(where, []).append(None)
                    continue
                title = clean_text(tag.get("title"))
                if title and not GENERIC_VIDEO_TITLE_RE.fullmatch(title):
                    title_ids.setdefault(title, set()).add(vid)
                prev = [h for h in HEADING_RE.finditer(html, 0, m.start())]
                section = re.sub(r"^[\s●•■◆◇★☆▲▶►○◎※]+", "", heading_text(prev[-1].group(2))) if prev else ""
                occ.setdefault(where, []).append((tag, vid, title, section))
        titles = {where: obj["title"] for where, obj in docs}

        def trusted(title: str, vid: str, where: str) -> bool:
            if not title or GENERIC_VIDEO_TITLE_RE.fullmatch(title):
                return False
            return len(title_ids.get(title, ())) == 1 or norm_compare(title) in norm_compare(titles.get(where, ""))

        best: dict[str, str] = {}               # 影片 → 可信標題（影音專區條目優先）
        list_title: dict[str, str] = {}         # 影片 → 影音專區列表標題
        for where in sorted(occ, key=lambda w: (w not in listbody, w)):
            for o in occ[where]:
                if o is None:
                    continue
                tag, vid, title, _section = o
                if trusted(title, vid, where):
                    best.setdefault(vid, title)
                if where in listbody:
                    list_title.setdefault(vid, titles[where])

        for where, obj in docs:
            items = occ.get(where)
            if not items or all(o is None for o in items):
                continue
            new_titles: list[str | None] = []
            used: Counter = Counter()
            for o in items:
                if o is None:
                    new_titles.append(None)
                    continue
                tag, vid, title, section = o
                if trusted(title, vid, where):
                    new = title
                else:
                    ctx_title = section or titles[where]
                    new = best.get(vid) or list_title.get(vid) or (
                        ctx_title if "影片" in ctx_title else f"影片：{ctx_title}")
                used[new] += 1
                if used[new] > 1:
                    new = f"{new}（{used[new]}）"
                new_titles.append(new)
            it = iter(zip(items, new_titles))

            def repl(m, it=it, where=where):
                o, new = next(it)
                if o is None or new == o[2]:
                    return m.group(0)
                tag = o[0]
                tag["title"] = new
                self.report.a11y_change("videoTitle", {"where": where, "video": o[1], "from": o[2], "to": new})
                return tag.decode(formatter=FORMATTER).removesuffix("</iframe>")

            obj["html"] = iframe_re.sub(repl, obj["html"])

    @staticmethod
    def cover_of(ctx: Ctx, html: str) -> str | None:
        """封面：原站列表縮圖取自相片輯第一張；沒有相片輯時用內文第一張顯示寬度 ≥ 200 px（或未設寬度）的本地圖片
        （不含 data: 表情小圖；略過 130 px 的 LINE 群組 QR code 等小圖），都沒有時才用第一張本地圖片。
        沒有圖片（例：只有 YouTube 播放器的影音條目，原站列表也沒有縮圖）時不設定，不自行產生。"""
        if ctx.gallery_imgs:
            return ctx.gallery_imgs[0]
        first = None
        for m in re.finditer(r'<img\b([^>]*)\ssrc="(/legacy/img/[^"]+)"([^>]*)>', html):
            src = m.group(2)
            if src.startswith("/legacy/img/inline-"):
                continue
            first = first or src
            w = re.search(r'\swidth="(\d+)"', " " + m.group(1) + m.group(3))
            if not w or int(w.group(1)) >= COVER_MIN_WIDTH:
                return src
        return first

    def entry_post_id(self, it: RawItem, slug: str, ctx: Ctx, ids: list) -> str | None:
        """列表條目 → 文章編號。

        450 連結紀錄：目標為站內文章、列表標題與文章標題相同且此列表尚未列出該文章時，直接使用該文章；
        否則建立「連結型文章」（編號＝450 代碼、標題＝原站列表標題），讓條目數與標題與原站一致。
        """
        ref = parse_legacy(it.href)
        if ref is None:
            return self.make_link_post(None, it, slug, ctx)
        if ref.type in ("405", "406", "404", "16") and ref.id:
            if ref.id in self.alive_posts:
                return ref.id
            if ref.id in self.post_page:
                return self.make_link_post(ref.id, it, slug, ctx)
            self.report.unresolved_link(it.href, ctx.where, "列表中的文章已下架（轉址至首頁）")
            return None
        if ref.type == "450" and ref.id:
            rec = self.links450.get(ref.id)
            if rec and rec.target:
                tref = parse_legacy(rec.target)
                if tref is not None and tref.type in ("405", "406", "404") and tref.id in self.alive_posts \
                        and tref.id not in ids and norm_compare(it.title) == norm_compare(self.post_title(tref.id)):
                    return tref.id
            return self.make_link_post(ref.id, it, slug, ctx)
        return self.make_link_post(None, it, slug, ctx)

    def make_link_post(self, lid: str | None, it: RawItem, slug: str, ctx: Ctx) -> str | None:
        if lid is None:
            self.report.unresolved_link(it.href, ctx.where, "列表條目無法對應文章")
            return None
        href, external = self.mapper.rewrite(it.href, ctx)
        ref = parse_legacy(it.href)
        target = self.links450[ref.id].target if ref and ref.type == "450" and ref.id in self.links450 else it.href
        lp = self.link_posts.setdefault(lid, {
            "id": lid, "title": it.title, "legacyUrl": legacy_page_url(ref.path) if ref else it.href,
            "href": href or legacy_key(it.href), "external": bool(external), "target": target or it.href,
            "collections": [], "body": None, "bodyBase": "",
        })
        if lp["body"] is None and it.body is not None:     # 列表條目本身的內文（影音專區）
            lp["body"], lp["bodyBase"] = it.body, it.base
        if slug not in lp["collections"]:
            lp["collections"].append(slug)
        return lid

    # ---- 轉址 ----
    def internal_destination(self, target: str, depth: int = 0) -> str | None:
        """站內目標網址 → 新網站路徑（存在的文章、ia.json 頁面、已下載的檔案）；其他回傳 None。"""
        tsp = urlsplit(target)
        if not is_legacy_host(tsp.hostname) or depth > 5:
            return None
        if is_asset_url(tsp):
            return self.assets.local(target)
        tref = parse_legacy(target)
        if tref is not None and tref.type == "450":
            hop = self.links450.get(tref.id)
            return self.internal_destination(hop.target, depth + 1) if hop and hop.target else None
        return self.mapper.map_legacy(target)

    def link450_destination(self, lid: str, rec: Link450) -> tuple[str, str]:
        """450 連結紀錄的轉址目標與依據（原站以 302 轉到 rec.target）。"""
        if rec.target:
            dst = self.internal_destination(rec.target)
            if dst:
                return dst, "原站 302 的站內目標"
        if lid in self.link_posts:
            return f"/posts/{lid}", "連結型文章"
        if rec.target:
            if not is_legacy_host(urlsplit(rec.target).hostname):
                if url_scheme(rec.target) not in ("http", "https"):
                    return "/", "原站 302 的目標不是 http(s) 網址，改連到首頁"
                return rec.target, "原站 302 的站外目標（絕對網址）"
            dead = self.mapper.dead_destination(rec.target)
            return (dead[0], dead[1]) if dead else ("/", "原站 302 的站內目標無對應頁面")
        for src in sorted(self.link450_sources.get(lid, ())):   # 原站已失效：導向列出它的頁面
            kind, _, val = src.partition(":")
            if kind in ("page", "collection"):
                return "/" + val, "原站連結紀錄失效，導向列出它的頁面"
            if kind == "post" and val in self.alive_posts:
                return f"/posts/{val}", "原站連結紀錄失效，導向列出它的文章"
        return "/", "原站連結紀錄失效"

    def build_redirects(self) -> list[dict]:
        r: dict[str, str] = {}

        def add(src: str, dst: str):
            r.setdefault(src, dst)

        add("/index.php", "/")
        for p in self.page_specs + self.collection_specs:
            dst = "/" + p["slug"]
            add(f"/p/{p['legacy']}.php", dst)
            n = self.list_pages.get(p["legacy"], 0)
            if p["legacy"].startswith("403-"):
                n = max(n, 1)
            for k in range(1, n + 1):
                add(f"/p/{p['legacy']}-{k}.php", dst)
        for code, dst in sorted(self.group_first.items()):
            add(f"/p/{code}.php", dst)
            for k in range(1, self.list_pages.get(code, 0) + 1):
                add(f"/p/{code}-{k}.php", dst)
        for code, dst in sorted(self.code_map.items()):
            add(f"/p/{code}.php", dst)
            for k in range(1, self.list_pages.get(code, 0) + 1):
                add(f"/p/{code}-{k}.php", dst)
        for pid in sorted(self.alive_posts, key=int):
            dst = f"/posts/{pid}"
            for v in sorted(self.posts[pid].variants):
                add(v, dst)
            add(f"/p/16-{SITE_ID}-{pid}.php", dst)
        for pid, dst in sorted(self.post_page.items()):
            add(f"/p/16-{SITE_ID}-{pid}.php", dst)
            for v in sorted(self.page_post_variants.get(pid, ())):
                add(v, dst)
        # 每一筆 450 連結紀錄（站內目標 → 新路徑；連結型文章 → /posts/<id>；站外 → 原站 302 的 Location）
        self.redirect_450: dict[str, dict] = {}
        for lid, rec in sorted(self.links450.items(), key=lambda kv: int(kv[0])):
            dst, why = self.link450_destination(lid, rec)
            add(rec.path, dst)
            self.redirect_450[lid] = {"source": rec.path, "destination": dst, "basis": why}
        # 已下架文章（原站 302 回首頁）：依原站行為導向首頁
        for pid, d in sorted(self.dead_posts.items(), key=lambda kv: int(kv[0])):
            dst = (self.mapper.dead_destination(d["url"]) or ("/",))[0]
            for v in sorted(self.posts[pid].variants) or [urlsplit(d["url"]).path]:
                add(v, dst)
        # 被連結到、但已下架的原站頁面（例：412-1039-7708 → LEGACY_SUCCESSORS）
        for code, info in sorted(self.unknown_pages.items()):
            dead = self.mapper.dead_destination(info.get("url") or page_url(code))
            if dead:
                add(f"/p/{code}.php", dead[0])
        # ia.json 未列入的列表單元（例：首頁「招生資訊」1782）與首頁輪播單元
        for unit, info in sorted(self.extra_units.items(), key=lambda kv: int(kv[0])):
            dst = UNIT_SUCCESSORS.get(unit, UNMAPPED_UNIT_FALLBACK)
            code = f"403-{SITE_ID}-{unit}"
            add(f"/p/{code}.php", dst)
            for k in range(1, max(1, info["pages"]) + 1):
                add(f"/p/{code}-{k}.php", dst)
        for unit, info in sorted(self.skipped_units.items(), key=lambda kv: int(kv[0])):
            code = f"403-{SITE_ID}-{unit}"
            add(f"/p/{code}.php", "/")
            add(f"/p/{code}-1.php", "/")
        # 連結型文章（含影音專區、列印版本內文）的友善列印版本
        for lid in sorted(self.link_posts, key=int):
            add(f"/p/16-{SITE_ID}-{lid}.php", f"/posts/{lid}")
        # 已搬移的站內檔案：原站路徑（/var/file/...）→ /legacy/...（目前檔案；縮圖／轉檔後的路徑）。
        # 依賴查詢字串的 downloadfile 網址：source 為完整的原站「路徑＋查詢字串」（next.config 以 has 條件比對）。
        self.asset_redirects = 0
        self.query_redirects: list[dict] = []
        for key in sorted(self.assets.used):
            rec = self.assets.records.get(key)
            sp = urlsplit(key)
            if not rec or not is_legacy_host(sp.hostname):
                continue
            if sp.query and not (sp.path or "").lower().startswith("/var/file/"):
                src = f"{sp.path}?{sp.query}"
                # path／query 欄位沿用舊格式（src/proxy.ts 仍會讀取；與 redirects.json 重複時以 redirects.json 為準）
                self.query_redirects.append({"url": key, "source": src, "path": sp.path, "query": sp.query,
                                             "destination": rec["path"]})
                add(src, rec["path"])
                continue
            if sp.path not in r:
                self.asset_redirects += 1
            add(sp.path, rec["path"])
        # 個資保護（remove_assets）：不搬移的站內檔案，原站網址轉址到說明它的文章（不轉到檔案）
        self.privacy_redirects: list[dict] = []
        for key in sorted(self.assets.privacy_skipped):
            rule, sp = privacy_removed(key), urlsplit(key)
            if not rule or not is_legacy_host(sp.hostname):
                continue
            src = f"{sp.path}?{sp.query}" if sp.query and not (sp.path or "").lower().startswith("/var/file/") \
                else sp.path
            add(src, f"/posts/{rule['post']}")
            self.privacy_redirects.append({"url": key, "source": src, "destination": r[src]})
        return [{"source": s, "destination": d} for s, d in sorted(r.items())]

    def verify_redirects(self) -> dict:
        """轉址完整性檢查（寫入報告）：已搬移的 /var/file/ 檔案、查詢字串檔案網址、隱藏分類鏡像頁中的文章網址、
        ia.json 列表單元的分頁網址，都必須有 redirects.json 的明確轉址。"""
        r = {x["source"]: x["destination"] for x in self.redirects}
        missing_assets = []
        for key in sorted(self.assets.used):
            rec = self.assets.records.get(key)
            sp = urlsplit(key)
            if not rec or not is_legacy_host(sp.hostname):
                continue
            src = sp.path if (sp.path or "").lower().startswith("/var/file/") or not sp.query else f"{sp.path}?{sp.query}"
            if r.get(src) != rec["path"]:
                missing_assets.append({"source": src, "expected": rec["path"], "actual": r.get(src)})
        mirrors = []
        for code in sorted(c for c in self.ia.get("aliases", {}) if c.startswith("412-")):
            doc = self.aux_docs.get(code)
            if doc is None:
                continue
            posts, missing = 0, []
            for it in doc.items:
                ref = parse_legacy(it.href)
                if ref is None or ref.type not in ("405", "406", "404") or ref.preview:
                    continue
                posts += 1
                if ref.path not in r:
                    missing.append(ref.path)
            pages = [f"/p/{code}.php"] + [f"/p/{code}-{k}.php" for k in range(1, self.list_pages.get(code, 0) + 1)]
            mirrors.append({"code": code, "destination": self.code_map.get(code), "postUrls": posts,
                            "postUrlsMissing": missing, "pageUrls": len(pages),
                            "pageUrlsMissing": [p for p in pages if p not in r]})
        units = []
        for p in self.collection_specs:
            if not p["legacy"].startswith("403-"):
                continue
            n = max(1, self.list_pages.get(p["legacy"], 0))
            pages = [f"/p/{p['legacy']}.php"] + [f"/p/{p['legacy']}-{k}.php" for k in range(1, n + 1)]
            units.append({"code": p["legacy"], "destination": "/" + p["slug"], "pages": n,
                          "missing": [x for x in pages if r.get(x) != "/" + p["slug"]]})
        return {"assetRedirectsMissing": missing_assets, "aliasMirrors": mirrors, "collectionUnits": units}

    # ---- 外站圖片檢查 ----
    def check_external(self) -> None:
        """外站圖片（fbcdn、facebook、LINE、editmysite…）只檢查能否存取、不下載；www.emrd.tw 失效的圖片／
        檔案連結另檢查同一 Weebly 網站預覽主機上是否仍有相同檔案（供 --weebly-mirror 參考）。"""
        rep = self.report
        urls = []
        for src in sorted(rep.external_images):
            urls.append(mirror_url(src) or src if is_owned_host(urlsplit(src).hostname) else src)
        for href in sorted(rep.owned_links):
            urls.append(mirror_url(href) or mirror_page_url(href))
        self.assets.probe_all(u for u in urls if u)

    # ---- 寫檔 ----
    def write_outputs(self) -> None:
        log("寫出 JSON…")
        written: dict[str, set] = {"pages": set(), "collections": set(), "posts": set()}

        def fname(slug: str) -> str:
            return slug.replace("/", "__") + ".json"

        for slug, obj in self.out_pages.items():
            write_json(DATA_DIR / "pages" / fname(slug), obj)
            written["pages"].add(fname(slug))
        for slug, obj in self.out_collections.items():
            write_json(DATA_DIR / "collections" / fname(slug), obj)
            written["collections"].add(fname(slug))
        for pid, obj in self.out_posts.items():
            write_json(DATA_DIR / "posts" / f"{pid}.json", obj)
            written["posts"].add(f"{pid}.json")
        # 移除本次未產生的舊 JSON（這三個資料夾完全由本腳本產生）
        for sub, keep in written.items():
            for f in (DATA_DIR / sub).glob("*.json"):
                if f.name not in keep:
                    f.unlink()
                    log(f"  移除過時檔案 {sub}/{f.name}")
        self.redirects = self.build_redirects()
        write_json(DATA_DIR / "redirects.json", self.redirects)
        self.redirect_checks = self.verify_redirects()
        self.assets.write_originals_manifest(restore_mode=bool(getattr(self.args, "original_images", False)))

        if self.args.prune:
            used_paths = {self.assets.records[k]["path"] for k in self.assets.used if k in self.assets.records}
            for sub in ("img", "files"):
                for f in (ASSET_DIR / sub).glob("*"):
                    if f.is_file() and f"/legacy/{sub}/{f.name}" not in used_paths:
                        f.unlink()
                        log(f"  --prune 刪除未使用檔案 {sub}/{f.name}")

        self.report_obj = self.build_report()
        write_json(DATA_DIR / "report.json", self.report_obj)

    def build_report(self) -> dict:
        rep = self.report
        used: dict[str, dict] = {}              # 本地路徑 → 紀錄（內容相同而共用的檔案只算一次）
        for k in sorted(self.assets.used):
            if k in self.assets.records:
                used.setdefault(self.assets.records[k]["path"], self.assets.records[k])
        imgs = [r for r in used.values() if r["path"].startswith("/legacy/img/")]
        files = [r for r in used.values() if r["path"].startswith("/legacy/files/")]

        def where_sorted(s):
            return sorted(s)

        empty_pages = [s for s, p in self.out_pages.items() if not p["html"] and not p["items"] and not p["attachments"]]
        empty_posts = [i for i, p in self.out_posts.items() if not p["html"] and not p["attachments"]]
        in_collections = {pid for c in self.out_collections.values() for pid in c["postIds"]}
        orphans = []
        for pid in sorted(self.alive_posts, key=int):
            if pid not in in_collections and pid not in self.referenced:
                orphans.append({"id": pid, "title": self.out_posts[pid]["title"],
                                "legacyUrl": self.out_posts[pid]["legacyUrl"],
                                "foundIn": sorted(self.posts[pid].sources)})
        unmapped_units = []
        for unit, info in sorted(self.extra_units.items(), key=lambda kv: int(kv[0])):
            ids = []
            for it in info["items"]:
                ref = parse_legacy(it.href)
                pid = None
                if ref and ref.type == "450" and ref.id in self.links450 and self.links450[ref.id].target:
                    ref = parse_legacy(self.links450[ref.id].target)
                if ref and ref.id in self.alive_posts:
                    pid = ref.id
                ids.append(pid or it.href)
            unmapped_units.append({"unit": unit, "title": info["title"], "legacyUrl": info["legacyUrl"],
                                   "pages": info["pages"], "entries": ids,
                                   "note": "原站首頁使用的列表單元，ia.json 未列入；文章已搬移，若要提供列表請在 ia.json 加入 collection 後重跑"})
        dated_items = sum(1 for p in self.out_pages.values() for it in p["items"] if it.get("date"))
        dated_posts = sum(1 for p in self.out_posts.values() if p.get("date"))
        aux = []
        for code, doc in sorted(self.aux_docs.items()):
            has_text = any(not is_blank(ed.get_text()) or ed.find(["img", "iframe"]) for ed in doc.editors)
            aux.append({"code": code, "title": doc.title, "redirectTo": self.code_map.get(code),
                        "hasEditorContent": bool(has_text), "items": len(doc.items)})
        legacy_failed = {k: e for k, e in self.assets.failed.items() if is_legacy_host(urlsplit(k).hostname)}
        probes = self.assets.probes
        owned_used = sorted(k for k in self.assets.used
                            if (urlsplit(k).hostname or "").lower() in OWNED_HOSTS | WEEBLY_MIRROR_HOSTS)
        owned_dead, ext_checks = [], []
        for src, where in sorted(rep.external_images.items()):
            if is_owned_host(urlsplit(src).hostname):
                rec = {"src": src, "error": self.assets.failed.get(asset_key(src), "未下載"),
                       "foundIn": where_sorted(where)}
                m = mirror_url(src)
                if m:
                    rec["mirror"] = dict(url=m, **probes.get(m, {}))
                owned_dead.append(rec)
            else:
                ext_checks.append(dict(src=src, **probes.get(src, {}), foundIn=where_sorted(where)))
        owned_links = []
        for href, where in sorted(rep.owned_links.items()):
            rec = {"href": href, "foundIn": where_sorted(where)}
            m = mirror_url(href)
            if m:
                rec["mirror"] = dict(url=m, **probes.get(m, {}))
            else:
                mp = mirror_page_url(href)
                if mp:
                    rec["mirrorPage"] = dict(url=mp, **probes.get(mp, {}))
            owned_links.append(rec)
        unrecoverable = (
            [{"url": x["src"], "kind": "image", "reason": x["error"], "foundIn": x["foundIn"]} for x in owned_dead]
            + [{"url": x["href"], "kind": "link",
                "reason": ("Weebly 頁面（非 /uploads/ 檔案），不屬於圖片／檔案搬移範圍；連結保留原網址"
                           if "mirror" not in x else "預覽主機上也無法取得此檔案"),
                "foundIn": x["foundIn"]} for x in owned_links]
        )
        img_tags = [m.group(0) for h in (x["html"] for x in list(self.out_pages.values()) + list(self.out_posts.values()))
                    for m in re.finditer(r"<img\b[^>]*>", h)]
        local_tags = [t for t in img_tags if re.search(r'\ssrc="/legacy/', t)]
        local_sized = [t for t in local_tags if re.search(r'\swidth="\d+"', t) and re.search(r'\sheight="\d+"', t)]
        used_img_paths = {r["path"] for r in imgs}
        derived = [e for k, e in sorted(self.assets.derived.items()) if e["current"] in used_img_paths]
        try:
            backup_bytes = sum(f.stat().st_size for f in (ORIGINALS_DIR / "img").iterdir() if f.is_file())
        except OSError:
            backup_bytes = 0
        dead_ext = [c for c in ext_checks if not c.get("ok")]
        kinds = Counter(lp.get("kind", "link") for lp in self.link_posts.values())
        html_all = [x["html"] for x in list(self.out_pages.values()) + list(self.out_posts.values())]
        frag_kept = sum(h.count('href="#legacy-') for h in html_all)
        special = [x["source"] for x in self.redirects if re.search(r"[(){}:*+?]", x["source"])]
        # 個資保護：所有輸出（頁面、文章、列表）中仍符合學號樣式者（只列位置與次數，不列內容）
        id_hits = []
        for where, obj in ([(f"page:{s}", p) for s, p in self.out_pages.items()]
                           + [(f"post:{i}", p) for i, p in self.out_posts.items()]
                           + [(f"collection:{s}", c) for s, c in self.out_collections.items()]):
            n = len(STUDENT_ID_RE.findall(json.dumps(obj, ensure_ascii=False)))
            if n:
                id_hits.append({"where": where, "count": n})
        privacy_redirect_of = {x["url"]: x for x in self.privacy_redirects}
        privacy = {
            "note": ("個資保護（scripts/migrate_legacy.py 的 PRIVACY_REDACTIONS）：removedAssets＝不搬移的檔案（原處改為說明"
                     "文字、原站網址轉址到 post 文章）；pdfPages＝只保留部分頁面的 PDF；changes＝各文件中的處理紀錄"
                     "（removedImage／removedAttachment／removedLink／noteAdded／tableColumnRemoved）；"
                     "studentIdPatternHits＝輸出中仍符合學號樣式者（應為空）。移除或修改前的原始檔只留在本機 "
                     ".private-originals/（不進版控、不部署）。"),
            "removedAssets": [{"url": k, "what": privacy_removed(k)["what"], "post": privacy_removed(k)["post"],
                               "foundIn": where_sorted(w),
                               "redirect": (privacy_redirect_of[k]["destination"] if k in privacy_redirect_of else None)}
                              for k, w in sorted(self.assets.privacy_skipped.items())],
            "pdfPages": [dict(url=k, **v) for k, v in sorted(self.assets.privacy_pdf.items())],
            "changes": {k: rep.privacy[k] for k in sorted(rep.privacy)},
            "studentIdPatternHits": id_hits,
            "errors": list(self.assets.privacy_errors),
        }
        label_mismatch = []                     # 原站標題（title）與 ia.json 標籤不同者（前端顯示時請留意）
        for p in self.page_specs + self.collection_specs:
            out = self.out_pages.get(p["slug"]) or self.out_collections.get(p["slug"]) or {}
            if out.get("title") and p.get("label") and norm_compare(out["title"]) != norm_compare(p["label"]):
                label_mismatch.append({"slug": p["slug"], "legacyTitle": out["title"], "iaLabel": p["label"]})
        counts = {
            "pages": len(self.out_pages),
            "collections": len(self.out_collections),
            "posts": len(self.out_posts),
            "linkPosts": kinds.get("link", 0),
            "listBodyPosts": kinds.get("listBody", 0),
            "printViewPosts": kinds.get("printView", 0),
            "linkRecordPosts": len(self.link_posts),
            "orphanPosts": len(orphans),
            "redirects": len(self.redirects),
            "assetRedirects": self.asset_redirects,
            "queryRedirects": len(self.query_redirects),
            "images": len(imgs),
            "files": len(files),
            "resizedImages": sum(1 for r in imgs if r.get("resized")),
            "convertedImages": sum(1 for r in imgs if r.get("converted")),
            "localImgTags": len(local_tags),
            "localImgTagsWithSize": len(local_sized),
            "imgAspectAdjusted": self.sanitizer.aspect_adjusted,
            "externalImages": len(rep.external_images),
            "ownedImagesDownloaded": sum(1 for k in owned_used if self.assets.records[k].get("kind") == "img"),
            "ownedFilesDownloaded": sum(1 for k in owned_used if self.assets.records[k].get("kind") != "img"),
            "ownedImagesDead": len(owned_dead),
            "ownedUnrecoverable": len(unrecoverable),
            "deadExternalImages": len(dead_ext),
            "unresolvedLinks": len(rep.unresolved),
            "failedDownloads": len(legacy_failed),
            "linkItems404": len(rep.link_items_404),
            "deadPosts": len(self.dead_posts),
            "datedListItems": dated_items,
            "datedPosts": dated_posts,
            "galleryImages": sum(g["images"] for g in rep.galleries.values()),
            "galleryCaptions": sum(g["captions"] for g in rep.galleries.values()),
            "docsWithGallery": len(rep.galleries),
            "inlineDataImages": sum(1 for r in imgs if r.get("source") == "data-uri"),
            "deadLinksRewritten": len(rep.dead_links),
            "mergedAliasPages": len(self.merged_aliases),
            "duplicateContentAssets": len(self.assets.duplicates),
            "attachments": sum(len(x["attachments"]) for x in list(self.out_pages.values()) + list(self.out_posts.values())),
            "hiddenElementsDropped": sum(h["elements"] for h in rep.hidden.values()),
            "anchors": sum(len(v) for v in rep.anchors.values()),
            "fragmentLinksKept": frag_kept,
            "collectionSizes": {s: len(c["postIds"]) for s, c in self.out_collections.items()},
            "a11y": dict(sorted(rep.a11y_counts.items())),
            "privacyRemovedAssets": len(self.assets.privacy_skipped),
            "privacyPdfRedacted": len(self.assets.privacy_pdf),
            "privacyStudentIdHits": sum(x["count"] for x in id_hits),
        }
        return {
            "counts": counts,
            "assetBytes": {
                "total": sum(r["bytes"] for r in used.values()),
                "images": sum(r["bytes"] for r in imgs),
                "files": sum(r["bytes"] for r in files),
                "originalTotal": sum(r.get("originalBytes", r["bytes"]) for r in used.values()),
                "originalImages": sum(r.get("originalBytes", r["bytes"]) for r in imgs),
            },
            "imageProcessing": {
                "mode": "original-images" if getattr(self.args, "original_images", False) else "default",
                "maxWidth": self.assets.max_width,
                "convertBmp": self.assets.convert_bmp,
                "encoder": {"resample": "LANCZOS", "jpeg": f"quality {JPEG_QUALITY}, progressive, optimize",
                            "png": "optimize", "exif": "先依 EXIF 方向轉正（縮圖時）"},
                "backupDir": "legacy-originals/",
                "backupManifest": "legacy-originals/manifest.json",
                "backupBytes": backup_bytes,
                "rollback": "python -X utf8 scripts/migrate_legacy.py --original-images（說明見 legacy-originals/README.md）",
                "modified": len(derived),
                "bytesBefore": sum(e["bytesBefore"] for e in derived),
                "bytesAfter": sum(e["bytesAfter"] for e in derived),
                "items": derived,
                "errors": [{"path": k, "error": v} for k, v in sorted(self.assets.derive_errors.items())],
            },
            "redirectChecks": self.redirect_checks,
            "unresolved": [{"url": u, "reason": v["reason"], "foundIn": where_sorted(v["foundIn"])}
                           for u, v in sorted(rep.unresolved.items())],
            "failedDownloads": [{"url": u, "error": e, "foundIn": where_sorted(self.assets.found_in.get(u, ()))}
                                for u, e in sorted(legacy_failed.items())],
            "emptyPages": empty_pages,
            "emptyPosts": empty_posts,
            "externalImageHosts": dict(Counter(urlsplit(s).hostname or "" for s in rep.external_images).most_common()),
            "externalImages": [{"src": s, "foundIn": where_sorted(w)} for s, w in sorted(rep.external_images.items())],
            "ownedImages": {
                "hosts": sorted(OWNED_HOSTS),
                "downloaded": [{"url": k, "path": self.assets.records[k]["path"],
                                **({"fetchedFrom": self.assets.records[k]["fetchedFrom"]}
                                   if self.assets.records[k].get("fetchedFrom") else {})} for k in owned_used],
                "dead": owned_dead,
                "deadLinks": owned_links,
                "mirrorAvailable": sum(1 for x in owned_dead + owned_links if x.get("mirror", {}).get("ok")),
                "unrecoverable": unrecoverable,
                "note": ("www.emrd.tw 網域已無法解析（NXDOMAIN）；客戶（網站所有者）同意 1:1 搬移，其 /uploads/ 圖片與檔案"
                         "由同一個 Weebly 網站（站台 115637951）的預覽主機下載到 public/legacy/（downloaded 的 fetchedFrom）。"
                         "dead／deadLinks／unrecoverable 為仍無法取得而保留原網址者。"
                         if self.assets.weebly_mirror else
                         "已停用 Weebly 預覽主機下載（--no-weebly-mirror）：www.emrd.tw 失效的圖片保留原網址；"
                         "mirror 為預覽主機上相同檔案的 HEAD 檢查結果。"),
            },
            "externalImageChecks": ext_checks,
            "deadExternalImages": dead_ext,
            "queryRedirects": self.query_redirects,
            "redirectSourcesNeedingEscape": special,
            "labelMismatches": label_mismatch,
            "unknownLegacyPages": [{"code": c, "url": v.get("url"), "status": v.get("status"),
                                    "title": v.get("title", ""), "alive": bool(v.get("alive")),
                                    "foundIn": where_sorted(v["foundIn"])}
                                   for c, v in sorted(self.unknown_pages.items())],
            "linkItems404": [{"id": i, "url": v["url"], "status": v["status"], "foundIn": where_sorted(v["foundIn"])}
                             for i, v in sorted(rep.link_items_404.items())],
            "linkPosts": [{"id": i, "title": lp["title"], "kind": lp.get("kind", "link"), "href": lp["href"],
                           "external": lp["external"], "collections": lp["collections"], "legacyTarget": lp["target"]}
                          for i, lp in sorted(self.link_posts.items(), key=lambda kv: int(kv[0]))],
            "printViews": [dict(id=i, **v) for i, v in sorted(self.print_checks.items(), key=lambda kv: int(kv[0]))],
            "anchors": [{"where": w, "ids": ids} for w, ids in sorted(rep.anchors.items())],
            "hiddenElementsDropped": [dict(where=w, **h) for w, h in sorted(rep.hidden.items())],
            "galleries": [{"where": w, **g} for w, g in sorted(rep.galleries.items())],
            "deadLinksRewritten": [{"url": u, "rewrittenTo": v["rewrittenTo"], "reason": v["reason"],
                                    "foundIn": where_sorted(v["foundIn"])}
                                   for u, v in sorted(rep.dead_links.items())],
            "mergedAliasPages": self.merged_aliases,
            "redirects450": [dict(id=i, **v) for i, v in sorted(self.redirect_450.items(), key=lambda kv: int(kv[0]))],
            "duplicateContentAssets": [{"url": k, "duplicateOf": v["duplicateOf"], "path": self.assets.records[k]["path"],
                                        "droppedPath": v.get("droppedPath")}
                                       for k, v in sorted(self.assets.duplicates.items())],
            "collectionDuplicatesDropped": self.collection_dupes,
            "deadPosts": [dict(id=i, **v) for i, v in sorted(self.dead_posts.items(), key=lambda kv: int(kv[0]))],
            "orphanPosts": orphans,
            "unmappedUnits": unmapped_units,
            "skippedUnits": [{"unit": u, "title": i["title"], "legacyUrl": i["legacyUrl"], "entries": len(i["items"]),
                              "note": "首頁輪播（banner）單元，不屬於內容頁，未搬移；其 450 連結紀錄已加入轉址（見 redirects450）"}
                             for u, i in sorted(self.skipped_units.items())],
            "auxPages": aux,
            "iframesConvertedToLinks": [{"src": s, "foundIn": where_sorted(w)}
                                        for s, w in sorted(rep.iframes_to_links.items())],
            "fetchFailures": [{"url": u, "error": e} for u, e in sorted(rep.fetch_failures.items())],
            "accessibility": {
                "note": ("搬遷時的無障礙調整（規則見 migrate_legacy.py；重跑結果相同）：textVersion＝圖片後加上逐字轉寫的"
                         "「文字版」（IMAGE_TEXT_OVERRIDES）；altOverride＝依路徑指定的 alt；junkAltCleared＝無意義的原站 alt"
                         "改為空字串；singleImageAlt＝文章唯一的大圖以文章標題為 alt（圖片內容仍待人工轉寫為文字）；"
                         "externalToText＝外站表情／LINE 按鈕改為文字；droppedExternal＝已失效的外站圖片移除；"
                         "tableHeaders＝資料表格的標題列／caption；langEn＝英文區塊 lang=\"en\"；headingPromoted／"
                         "headingDemoted／headingLevelsShifted＝標題層級；videoTitle＝YouTube 嵌入的標題。"),
                **{k: rep.a11y[k] for k in sorted(rep.a11y)},
                "needsTranscription": [{"where": x["where"], "src": x["src"], "alt": x["detail"]}
                                       for x in rep.a11y.get("singleImageAlt", [])],
            },
            "privacy": privacy,
            "droppedElements": dict(sorted(rep.dropped.items())),
            "fragmentLinksUnwrapped": rep.fragment_links,
            "notes": [
                "原站列表與文章頁均未顯示發布日期，依規則不從標題推測，date 欄位因此省略（影音專區條目內文中的"
                "民國日期行保留為內文文字）。",
                "450 連結紀錄只讀取原站 302 的 Location，不連線到外站（Google Drive 等），因此外站目標是否失效無法由本腳本驗證。",
                "頁內目錄／回到頂端：同頁 \"#...\" 連結的目標保留為 id=\"legacy-<文件代號>-<名稱>\"（文件代號＝頁面 slug"
                "〔/ 改 -〕或文章編號，避免 React Activity 同時保留多個頁面時 id 衝突；見 anchors），連結改為對應的 "
                "href=\"#legacy-…\"；找不到目標或沒有文字的頁內連結改為純文字或移除（fragmentLinksUnwrapped）。",
                "www.emrd.tw 為 EMRD 舊 Weebly 網站（客戶自有、要求 1:1 搬移）：網域已失效，其 /uploads/ 圖片與檔案由同一"
                "Weebly 網站（站台 115637951）的預覽主機下載到 public/legacy/（見 ownedImages.downloaded）；"
                "仍無法取得者保留原網址並列在 ownedImages.unrecoverable。",
                "外站圖片不熱連結：Facebook 表情圖示（fbcdn、facebook.com/images/emoji.php）與 LINE「加入好友」按鈕改為其 alt "
                "文字（accessibility.externalToText），已失效的 ce.ntust.edu.tw 照片移除（accessibility.droppedExternal）。"
                "其餘外站圖片只檢查能否存取、不下載（見 externalImageChecks、deadExternalImages；結果快取於 "
                ".legacy-cache/probes.json，--refresh 重新檢查）。",
                "連結只允許 http(s)、mailto、tel 與站內相對網址（先移除控制字元再判斷 scheme，java\\tscript: 等寫法也會被擋下）；"
                "其他 scheme 的連結改為純文字（droppedElements 的 link(不允許的 scheme …)）。屬性值一律以雙引號輸出、"
                "值中的 \" 寫成 &quot;。",
                "列表中的 450 連結紀錄：目標為站內文章、標題相同且未重複時直接使用該文章；否則以文章保留條目"
                "（編號＝450 代碼、標題＝原站列表標題，見 linkPosts）。kind＝link：html 只有一個連結；"
                "listBody：影音專區條目本身的內文（YouTube 播放器＋日期）＋相關文章連結；"
                "printView：目標已下架，改用友善列印版本 16-1039-<id>.php 的完整內文（見 printViews）。",
                "影音專區條目在原站列表沒有縮圖，因此這些文章不設 cover（不自行產生縮圖）。",
                "以行內樣式 display:none 隱藏的元素不搬移（見 hiddenElementsDropped）。",
                "相片輯（.mcarousel figure）位於 .mpgdetail 之外，已依原站 DOM 順序輸出為 <figure><img><figcaption>（見 galleries）；"
                "隱藏的手機版副本（display:none）依 src 去重。原站列表縮圖取自相片輯第一張，因此有相片輯的文章以其第一張為 cover。",
                "attachments 只來自原站附件區塊（.module-ptattach）；內文中的檔案連結保留在內文。",
                "圖片（客戶同意）：寬度超過 2000 px 者縮成 2000 px 寬（先依 EXIF 轉正、LANCZOS、JPEG 品質 85 漸進式、"
                "PNG optimize、格式不變），BMP 無損轉成 PNG；其餘圖片保留原始檔（位元組相同、保留 EXIF）。被修改的原始檔"
                "逐位元組備份在 legacy-originals/img/（不部署；對照表 legacy-originals/manifest.json，見 imageProcessing）。"
                "還原：python -X utf8 scripts/migrate_legacy.py --original-images。附件（/legacy/files/）保留原檔"
                "（個資保護的例外見 privacy）。",
                "html 中每個本地 <img> 都有 width／height：比例取自實際檔案（縮圖後、已依 EXIF 方向）；原站有設定顯示寬"
                "（或只設高）時沿用為顯示尺寸、另一邊依實際比例換算，沒有設定時為實際檔案的像素尺寸。前端不需讀檔取得尺寸。"
                "cover 欄位的型別（types.ts）沒有尺寸欄位，因此 cover 不另附尺寸。",
                "不同原站網址但內容完全相同的檔案共用一個本地檔（見 duplicateContentAssets）。",
                "已下架的原站網址（302 回首頁）在內文中改寫為首頁或明確的後繼頁面，並加入轉址（見 deadLinksRewritten）。",
                "redirects.json 的 destination 可能是站外絕對網址（450 連結紀錄的原站 302 目標，例如 Google Drive）。",
                "redirects.json 也包含已搬移檔案的原站路徑（/var/file/... → /legacy/...）；source 含 ( ) 等 path-to-regexp "
                "特殊字元者列在 redirectSourcesNeedingEscape，寫入 next.config 的 redirects 時須在字元前加反斜線跳脫。",
                "依賴查詢字串的 downloadfile 網址（/app/index.php?Action=downloadfile&file=…&fname=…）已寫入 redirects.json"
                "（source 為完整的原站路徑＋查詢字串，next.config 轉成 has 查詢條件；queryRedirects 僅供對照）。"
                "redirectChecks 列出轉址完整性檢查（/var/file/ 檔案、隱藏分類鏡像頁的文章網址、列表單元分頁）。",
                "collections/*.json 的 title 保留原站列表標題（例：admissions/news 原站為「招生資訊」，與 IA 標籤「招生公告」"
                "不同，見 labelMismatches）；前端顯示列表名稱一律使用 ia.json 的 label（src/lib/legacy.ts collectionsForPost "
                "先取 IA 標籤、列表頁標題用 page.label），因此資料不改。",
                "ia.json 中有自己內容的 412 別名頁已併入別名目標頁（原站標題為小節標題，見 mergedAliasPages）；"
                "隱藏的分類鏡像頁（412-1039-7696／7721／7723／7724）只轉址，其中的文章網址（,c7696 等）都已加入轉址。",
            ],
        }

    def run(self) -> None:
        t0 = time.time()
        self.load_ia()
        self.crawl_pages()
        self.crawl_collections()
        self.crawl_aux()
        self.crawl_posts()
        self.collect_assets()
        self.build()
        self.check_external()
        self.write_outputs()
        c = self.report_obj["counts"]
        b = self.report_obj["assetBytes"]
        log("")
        log("=== 搬遷完成 ===")
        log(f"頁面 {c['pages']}、列表 {c['collections']}、文章 {c['posts']}（連結紀錄 {c['linkRecordPosts']}："
            f"純連結 {c['linkPosts']}、列表內文 {c['listBodyPosts']}、列印版本內文 {c['printViewPosts']}；孤立 {c['orphanPosts']}）")
        log(f"轉址 {c['redirects']} 筆（檔案 {c['assetRedirects']}、含查詢字串 {c['queryRedirects']}）；"
            f"圖片 {c['images']}（縮圖 {c['resizedImages']}、BMP→PNG {c['convertedImages']}）、附件 {c['files']}，"
            f"共 {human_size(b['total'])}（原始檔 {human_size(b['originalTotal'])}）")
        ip = self.report_obj["imageProcessing"]
        log(f"圖片處理（{ip['mode']}）：修改 {ip['modified']} 張，{human_size(ip['bytesBefore'])} → "
            f"{human_size(ip['bytesAfter'])}；原始檔備份 legacy-originals/ {human_size(ip['backupBytes'])}"
            + (f"；本次移除 public/ 中 {len(self.assets.removed)} 個不再使用的檔案" if self.assets.removed else ""))
        log(f"本地 <img> {c['localImgTags']}（帶 width／height {c['localImgTagsWithSize']}；依實際比例改寫 height "
            f"{c['imgAspectAdjusted']}）")
        log(f"相片輯 {c['galleryImages']} 張（{c['docsWithGallery']} 頁／篇）、改寫下架連結 {c['deadLinksRewritten']}、"
            f"併入別名頁 {c['mergedAliasPages']}、附件 {c['attachments']}")
        log(f"頁內錨點 {c['anchors']}（保留連結 {c['fragmentLinksKept']}、改純文字 {self.report.fragment_links}）、"
            f"移除隱藏元素 {c['hiddenElementsDropped']}")
        log(f"外站圖片 {c['externalImages']}（www.emrd.tw 已下載圖片 {c['ownedImagesDownloaded']}、檔案 "
            f"{c['ownedFilesDownloaded']}／仍失效 {c['ownedImagesDead']}、無法搬移 {c['ownedUnrecoverable']}；"
            f"其他外站無法存取 {c['deadExternalImages']}）、未解析站內連結 {c['unresolvedLinks']}、"
            f"下載失敗 {c['failedDownloads']}、失效連結紀錄 {c['linkItems404']}、已下架文章 {c['deadPosts']}")
        pv = self.report_obj["privacy"]
        log(f"個資保護：不搬移檔案 {c['privacyRemovedAssets']}、PDF 刪頁 {c['privacyPdfRedacted']}、"
            f"移除表格欄 {len(pv['changes'].get('tableColumnRemoved', []))}；輸出中符合學號樣式 {c['privacyStudentIdHits']}"
            + (f"；錯誤 {len(pv['errors'])}：" + "；".join(pv["errors"]) if pv["errors"] else ""))
        if c["privacyStudentIdHits"]:
            log("  警告：輸出中仍有符合學號樣式的文字，見 report.json 的 privacy.studentIdPatternHits")
        log(f"HTTP：網路請求 {self.http.network}、快取命中 {self.http.cached}；耗時 {time.time() - t0:.0f} 秒")
        log(f"報告：{(DATA_DIR / 'report.json').relative_to(ROOT)}")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="將 emrd.ntust.edu.tw 舊站內容搬遷為新網站資料（src/content/legacy/data）")
    ap.add_argument("--refresh", action="store_true", help="略過 .legacy-cache/ 的 HTTP 快取，重新抓取頁面並重新下載檔案")
    ap.add_argument("--prune", action="store_true", help="刪除 public/legacy/ 中本次未使用的檔案")
    ap.add_argument("--workers", type=int, default=MAX_WORKERS, help=f"並行連線數（上限 {MAX_WORKERS}）")
    ap.add_argument("--delay", type=float, default=0.3, help="兩個請求起始時間的最小間隔（秒）")
    ap.add_argument("--max-image-width", type=int, default=MAX_IMAGE_WIDTH,
                    help=f"把寬度超過此值的 JPEG／PNG／WebP／BMP 縮圖（先依 EXIF 轉正、重新壓縮）；預設 {MAX_IMAGE_WIDTH}，"
                         "0＝不縮圖（BMP 仍轉成 PNG）。原始檔備份於 legacy-originals/")
    ap.add_argument("--original-images", action="store_true",
                    help="還原：所有圖片改回原始檔（不縮圖、BMP 不轉檔），由 legacy-originals/ 取回原檔並改回引用；"
                         "legacy-originals/ 保持不動")
    ap.add_argument("--weebly-mirror", action=argparse.BooleanOptionalAction, default=True,
                    help="www.emrd.tw（客戶自有的舊 Weebly 網站，網域已失效）的 /uploads/ 圖片與檔案改由同一個 Weebly "
                         "網站的預覽主機（*.preview.editmysite.com）下載（預設啟用；--no-weebly-mirror 改為只檢查能否存取）")
    args = ap.parse_args(argv)
    if args.original_images and args.max_image_width not in (0, MAX_IMAGE_WIDTH):
        ap.error("--original-images 不可與 --max-image-width 同時使用")
    sys.setrecursionlimit(10000)
    Migration(args).run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
