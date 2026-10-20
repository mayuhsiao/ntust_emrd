#!/usr/bin/env python3
"""
EMRD「學員與校友任職企業」Logo 牆動畫渲染器 —— 以程式生成 10 秒 1920×1080 影片。

畫面不使用任何第三方商標圖檔：每家企業預設以 Noto Sans TC 排成一致的「字標磚」
（半透明海軍藍玻璃磚＋髮絲邊框＋白色／香檳金字），整面牆風格統一。

分鏡（10 秒）：
  0–2.5 秒   字標磚自深空分三波飛入，帶動態模糊；柔和光軌畫在磚塊「後方」，落定瞬間閃現香檳金星芒
  2.5–5.5 秒 磚塊鎖定為大型弧面牆，鏡頭沿牆滑行（此段磚塊不做動態模糊，字標全程銳利）；
             約 1.5 磚寬的香檳金光帶於 3.3–5.4 秒斜掃過「畫面中看得到的」牆面，掠過玻璃磚面；
             任職人數最多的企業以香檳金字與金色邊框居中，知名企業排在鏡頭滑行路徑上
  5.3–7.7 秒 弧面先展平（5.3–6.35 秒，角落空位原地淡出），再以最短路徑配對（匈牙利演算法）
             移到馬賽克位置：所有磚同時出發、先上下撐開空隙再左右滑入，路徑互不交錯；
             移動中的磚依移動距離前浮到各自的深度並提高不透明度，不會互相透字
  7.3–8.3 秒 中央浮現標題「EMRD 學員與校友任職企業」與企業家數（由資料計算）及資料來源小字
  8.3–10 秒  收尾：臺科大白色橫式標誌＋研發碩士在職專班＋金色細線＋標題，牆面在後方柔和發光後定格；
             馬賽克左右對稱（最外圈多出的企業於上下列各自置中）
動態模糊一律依「磚塊本身的移動速度」連續漸增（smoothstep），不會在相鄰兩格之間突然由清晰變糊。

資料來源：scripts/data/alumni-companies.json，格式為
  [{"name": "<資料中的正式名稱>", "display": "<畫面顯示名稱>", "count": <人數>}, ...]
可由班級網站的 js/data.js 重新產生（只讀取成員資料中的 company／company_label 欄位，
姓名、職稱等其他個人欄位一律不讀取、不輸出）：
  python -X utf8 scripts/render_logo_wall.py --extract <班級網站網址>/js/data.js
自動清理規則：去除前後空白、合併被換行切斷的英文名稱、以「/、；」拆分多家公司、
排除「待業」等非任職值與標示為「前服務單位」者、去除「股份有限公司／有限公司」與
「美商／荷商」等字樣、合併同一企業的不同寫法（見 ALIASES）。

官方 Logo：若 scripts/logos/ 內有 <display>.png（透明背景，可由 SVG 轉出），
該企業改以此圖呈現，並自動轉為單色白（重點企業為香檳金）以維持整面牆一致。
詳見 scripts/logos/README.md。

用法（於專案根目錄）：
  python -X utf8 scripts/render_logo_wall.py --preview              # 960×540 關鍵格預覽＋縮圖總表
  python -X utf8 scripts/render_logo_wall.py --preview 1.2,4,9.8    # 指定秒數
  python -X utf8 scripts/render_logo_wall.py                        # 正式輸出 1920×1080
  python -X utf8 scripts/render_logo_wall.py --companies 其他名單.json --out 其他.mp4
  python -X utf8 scripts/render_logo_wall.py --title "EMRD 學員任職企業"   # 改標題（需客戶確認用語）
  python -X utf8 scripts/render_logo_wall.py --program "高階科技研發碩士在職專班"
  python -X utf8 scripts/render_logo_wall.py --count-plus                   # 家數後加「+」（僅在確認名單不完整時使用）

輸出：media/videos/emrd-logo-wall-10s.mp4（H.264 High、yuv420p、+faststart、無音軌）
      media/videos/emrd-logo-wall-poster.jpg（收尾定格畫面）
      （網站未使用的成品，放在 public/ 之外，不隨網站部署）
需求：Python 3.10+、numpy、opencv-python、Pillow，以及 PATH 上的 ffmpeg。
共用 render_hero_video.py 的數學工具、色票、色調映射與影像輸出函式（不修改該檔）。
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from dataclasses import dataclass
from functools import lru_cache
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SCRIPTS = Path(__file__).resolve().parent
ROOT = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

import render_hero_video as hv  # noqa: E402  共用工具（該檔有 __main__ 防護，匯入不會執行渲染）
from render_hero_video import (  # noqa: E402
    GOLD,
    GOLD_GLOW,
    ICE,
    ICE_WHITE,
    NAVY_DEEP,
    NAVY_LIFT,
    NTUST_BLUE,
    STEEL,
    ease,
    hex_bgr,
    rot_y,
    smoothstep,
    write_image,
)

COMPANIES_JSON = SCRIPTS / "data" / "alumni-companies.json"
LOGO_DIR = SCRIPTS / "logos"
NTUST_LOGO_WHITE = ROOT / "src" / "assets" / "ntust-logo-white.png"
# 網站未使用的影片成品：放在 public/ 之外，不會被部署或公開存取
VIDEO_DIR = ROOT / "media" / "videos"
OUT_VIDEO = VIDEO_DIR / "emrd-logo-wall-10s.mp4"
OUT_POSTER = VIDEO_DIR / "emrd-logo-wall-poster.jpg"

FPS = 30
DURATION = 10.0
TITLE = "EMRD 學員與校友任職企業"
PROGRAM = "研發碩士在職專班"
NOTE = "資料：114–115 級學員目前服務單位"
PREVIEW_TIMES = "0.5,1.2,2.0,2.9,3.7,4.4,5.1,6.0,6.6,7.1,8.0,9.8"
# 同分（任職人數 1）時優先排在鏡頭滑行路徑與標題旁的知名企業（依序）
FEATURED = ("台積電", "Google", "微軟", "AMD 超微", "美光科技", "鴻海精密", "廣達電腦", "聯詠科技")

GLASS_TOP = hex_bgr("#17366E")
GLASS_BOTTOM = hex_bgr("#0B1D42")
GLASS_BACK = hex_bgr("#0A1838")  # 移動中提高不透明度時墊在磚後的深色玻璃
CHAMPAGNE_TEXT = hex_bgr("#E8D5AA")  # 磚上香檳金字：比 #DCC392 略亮，深底上更易讀
NOTE_COLOR = hex_bgr("#B8C2D3")  # 資料來源小字：深底上仍清楚可讀
WARM = hex_bgr("#FFF6E3")

tonemap = hv.Scene.tonemap


# ---------------------------------------------------------------------------
# 資料：由班級網站 data.js 擷取「服務單位」並正規化
# ---------------------------------------------------------------------------

# 非任職狀態（整格等於下列字樣才排除）
NOT_EMPLOYED = re.compile(
    r"^(待業中?|待職中?|求職中|無|暫無|尚無|退休|自由業?|學生|在學|家管|n/?a|none|nil|[-—－–_.]+)$", re.I
)
# 一格內列出多家公司時的分隔符號
COMPANY_SEP = re.compile(r"\s*[/／、;；|｜]\s*")
LEGAL_SUFFIXES = ("股份有限公司", "有限公司", "公司")
EN_SUFFIX = re.compile(r"[\s,]*(Taiwan Branch|Taiwan|Co\.,?\s*Ltd\.?|Inc\.?|Ltd\.?|Corp\.?|Corporation)$", re.I)
DISPLAY_PREFIXES = ("美商", "荷商", "日商", "英商", "德商", "韓商", "法商", "瑞士商", "新加坡商", "香港商")
# 資料中明顯的筆誤（只修正法定字尾）
NAME_FIXES = {"股份有公司": "股份有限公司", "股份有線公司": "股份有限公司"}
# 同一企業的不同寫法 → 統一顯示名稱（鍵：去空白、小寫後的名稱）
ALIASES = {
    "緯創": "緯創資通",
    "貿聯": "貿聯 BizLink",
    "貿聯國際": "貿聯 BizLink",
    "貿聯bizlink": "貿聯 BizLink",
    "bizlink": "貿聯 BizLink",
    "超微半導體amd": "AMD 超微",
    "超微半導體": "AMD 超微",
    "超微": "AMD 超微",
    "amd": "AMD 超微",
    "安智銀行ingbank": "ING 安智銀行",
    "安智銀行": "ING 安智銀行",
    "谷歌": "Google",
    "google": "Google",
    "鴻海": "鴻海精密",
    "鴻海精密工業": "鴻海精密",
    "仁寶電腦工業": "仁寶電腦",
    "仁寶": "仁寶電腦",
    "台灣積體電路製造": "台積電",
    "台積公司": "台積電",
    "tsmc": "台積電",
    "和碩": "和碩聯合科技",
}


def _key(s: str) -> str:
    return re.sub(r"\s+", "", s).casefold()


def read_source(src: str) -> str:
    """讀取 data.js：可為網址（http/https）或本機檔案路徑。"""
    if re.match(r"^https?://", src, re.I):
        req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0 (EMRD logo-wall renderer)"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8")
    return Path(src).read_text(encoding="utf-8")


def member_company_fields(js: str):
    """逐筆回傳 (屆別, company, company_label)；其餘個人欄位完全不讀取。"""
    dec = json.JSONDecoder()
    for m in re.finditer(r"\b(?:const|let|var)\s+MEMBERS_(\d+)\s*=\s*", js):
        arr, _ = dec.raw_decode(js, m.end())
        for member in arr:
            if isinstance(member, dict):
                yield m.group(1), member.get("company"), member.get("company_label")


def split_companies(raw: str) -> list[str]:
    """清理一格服務單位：合併被換行切斷的名稱，再依分隔符號拆成多家公司。"""
    lines = [ln.strip() for ln in str(raw).replace("\r", "").split("\n") if ln.strip()]
    merged: list[str] = []
    for ln in lines:
        if merged:
            prev = merged[-1]
            if prev[-1].isascii() and prev[-1].isalnum() and ln[0].isascii() and ln[0].isalnum():
                merged[-1] = f"{prev} {ln}"  # 英文名稱被換行切斷
                continue
            if len(ln) <= 2 or ln.startswith(("股份", "有限", "公司")):
                merged[-1] = prev + ln  # 中文名稱被換行切斷（例如「…股份\n有限公司」）
                continue
        merged.append(ln)
    out = []
    for m in merged:
        out += [p.strip() for p in COMPANY_SEP.split(m) if p.strip()]
    return out


def normalise(raw: str) -> tuple[str, str]:
    """回傳 (正式名稱, 顯示名稱)。"""
    name = re.sub(r"\s+", " ", raw).strip()
    for bad, good in NAME_FIXES.items():
        name = name.replace(bad, good)
    disp = name
    for suf in LEGAL_SUFFIXES:
        if disp.endswith(suf) and len(disp) > len(suf) + 1:
            disp = disp[: -len(suf)]
            break
    disp = EN_SUFFIX.sub("", disp).strip(" ,")
    for pre in DISPLAY_PREFIXES:
        if disp.startswith(pre) and len(disp) > len(pre) + 1:
            disp = disp[len(pre) :]
            break
    disp = ALIASES.get(_key(disp), disp)
    return name, disp


def extract_companies(js: str) -> tuple[list[dict], dict]:
    groups: dict[str, dict] = {}
    stats = dict(cohorts=set(), members=0, skipped_former=0, skipped_not_employed=0, skipped_empty=0)
    for cohort, company, label in member_company_fields(js):
        stats["cohorts"].add(cohort)
        stats["members"] += 1
        if not company or not str(company).strip():
            stats["skipped_empty"] += 1
            continue
        if label and "前" in str(label):  # 標示為「前服務單位」：非目前任職，不列入
            stats["skipped_former"] += 1
            continue
        seen_here: set[str] = set()
        for part in split_companies(company):
            if NOT_EMPLOYED.match(part):
                stats["skipped_not_employed"] += 1
                continue
            name, disp = normalise(part)
            k = _key(disp)
            g = groups.setdefault(k, dict(display=disp, names=[], count=0))
            g["names"].append(name)
            if k not in seen_here:
                g["count"] += 1
                seen_here.add(k)
    out = []
    for g in groups.values():
        names = g["names"]
        legal = [n for n in names if n.endswith(("股份有限公司", "有限公司"))]
        official = max(legal or names, key=lambda n: (len(n), names.count(n)))
        out.append(dict(name=official, display=g["display"], count=g["count"]))
    out.sort(key=lambda c: (-c["count"], c["display"]))
    stats["cohorts"] = sorted(stats["cohorts"])
    return out, stats


# ---------------------------------------------------------------------------
# 字型與文字
# ---------------------------------------------------------------------------

_FONT_PATH: str | None = None


@lru_cache(maxsize=256)
def load_font(size_px: int, weight: int) -> ImageFont.FreeTypeFont:
    windir = os.environ.get("WINDIR", "C:/Windows")
    candidates = [_FONT_PATH] if _FONT_PATH else []
    candidates += [
        f"{windir}/Fonts/NotoSansTC-VF.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        f"{windir}/Fonts/msjhbd.ttc" if weight >= 600 else f"{windir}/Fonts/msjh.ttc",
    ]
    for c in candidates:
        if c and Path(c).exists():
            f = ImageFont.truetype(c, max(6, int(size_px)))
            try:
                f.set_variation_by_axes([weight])
            except Exception:
                pass
            return f
    sys.exit("找不到中文字型，請以 --font 指定 Noto Sans TC 或微軟正黑體路徑。")


def text_mask(text: str, size: float, weight: int, tracking: float = 0.0) -> np.ndarray:
    """單行文字的 alpha 遮罩（float32 0–1），已裁切至字墨範圍。"""
    f = load_font(int(round(size)), weight)
    widths = [f.getlength(ch) for ch in text]
    total = sum(widths) + tracking * f.size * (len(text) - 1)
    pad = int(f.size * 0.6) + 4
    im = Image.new("L", (int(math.ceil(total)) + 2 * pad, int(f.size * 1.6) + 2 * pad), 0)
    dr = ImageDraw.Draw(im)
    x = float(pad)
    for ch, w in zip(text, widths):
        dr.text((x, pad), ch, font=f, fill=255)
        x += w + tracking * f.size
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    return np.asarray(im).astype(np.float32) / 255.0


# ---------------------------------------------------------------------------
# 字標磚材質（多層 mip，各層各自排版以保持文字銳利）
# ---------------------------------------------------------------------------

TILE_W, TILE_H = 1.0, 0.40  # 世界座標
GAP = 0.09
PITCH_X, PITCH_Y = TILE_W + GAP, TILE_H + GAP
MIP_WIDTHS = (512, 360, 256, 180, 128, 90, 64)

KIND_NORMAL, KIND_TOP, KIND_GHOST = 0, 1, 2


def _round_mask(w: int, h: int, r: float, inset: float, outline: float | None = None, ss: int = 4) -> np.ndarray:
    im = Image.new("L", (w * ss, h * ss), 0)
    d = ImageDraw.Draw(im)
    box = (inset * ss, inset * ss, (w - inset) * ss - 1, (h - inset) * ss - 1)
    if outline is None:
        d.rounded_rectangle(box, radius=r * ss, fill=255)
    else:
        d.rounded_rectangle(box, radius=r * ss, outline=255, width=max(1, int(round(outline * ss))))
    return np.asarray(im.resize((w, h), Image.LANCZOS)).astype(np.float32) / 255.0


def _split_candidates(text: str) -> list[tuple[str, str]]:
    """可換行的位置：英文於空白處，中文於字與字之間（不拆開英文單字）。"""
    out = []
    for i in range(1, len(text)):
        a, b = text[i - 1], text[i]
        if a == " " or b == " ":
            if b == " ":
                continue
            out.append((text[: i - 1].strip(), text[i:].strip()))
        elif not (a.isascii() and a.isalnum() and b.isascii() and b.isalnum()):
            out.append((text[:i].strip(), text[i:].strip()))
    return [(x, y) for x, y in out if x and y]


def fit_lines(text: str, tw: int, th: int, weight: int) -> tuple[list[str], int]:
    """決定字級與是否換成兩行：長名稱先縮字，仍過長則換行。"""
    ref = load_font(100, weight)
    avail_w, avail_h = tw * 0.82, th * 0.66
    base = th * 0.31
    w1 = ref.getlength(text) / 100
    s1 = min(base, avail_w / max(w1, 1e-6))
    if s1 >= th * 0.235 or not _split_candidates(text):
        return [text], max(6, int(s1))
    best = None
    for a, b in _split_candidates(text):
        w = max(ref.getlength(a), ref.getlength(b)) / 100
        if best is None or w < best[0]:
            best = (w, [a, b])
    s2 = min(th * 0.255, avail_w / best[0], avail_h / 2.3)
    if s2 <= s1:
        return [text], max(6, int(s1))
    return best[1], max(6, int(s2))


def load_override(logo_dir: Path | None, company: dict) -> np.ndarray | None:
    """scripts/logos/<display>.png（或 <name>.png）→ 單色遮罩；無檔案時回傳 None。"""
    if not logo_dir or not logo_dir.is_dir():
        return None
    files = {p.stem.casefold(): p for p in logo_dir.iterdir() if p.suffix.lower() == ".png"}
    for cand in (company["display"], company["name"], company["display"].replace(" ", "")):
        p = files.get(cand.casefold())
        if p is None:
            continue
        im = Image.open(p).convert("RGBA")
        arr = np.asarray(im).astype(np.float32) / 255.0
        a = arr[..., 3]
        if a.min() > 0.98:  # 不透明底：以與四角底色的亮度差作為遮罩
            lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            corners = np.array([lum[0, 0], lum[0, -1], lum[-1, 0], lum[-1, -1]])
            a = np.clip(np.abs(lum - np.median(corners)) * 2.5, 0, 1)
        else:
            lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            # 透明底的深色 logo 與淺色 logo 皆轉為實心單色
            a = a * np.clip(0.55 + 0.45 * np.where(lum < 0.5, 1 - lum, lum) * 1.2, 0, 1)
        ys, xs = np.nonzero(a > 0.02)
        if len(xs) == 0:
            return None
        return a[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    return None


def make_tile(label: str | None, kind: int, tw: int, override: np.ndarray | None = None):
    """回傳 (premultiplied BGRA uint8, 輔助遮罩 uint8 [發光, 磚面])。

    磚面遮罩用於移動中提高不透明度（在磚後墊一層深色玻璃），讓前方的磚完全遮住後方的字。
    """
    th = max(8, int(round(tw * TILE_H / TILE_W)))
    k = tw / 512
    border_w = max(1.0, 1.5 * k)
    radius = th * 0.13
    fill = _round_mask(tw, th, radius, border_w * 0.5)
    border = _round_mask(tw, th, radius, border_w * 0.5, outline=border_w)

    yy = np.linspace(0, 1, th, dtype=np.float32)[:, None]
    xx = np.linspace(0, 1, tw, dtype=np.float32)[None, :]
    glass = GLASS_TOP * (1 - yy[..., None]) + GLASS_BOTTOM * yy[..., None]
    glass = glass + 0.05 * ((1 - xx) * (1 - yy))[..., None] * ICE  # 左上角微弱反光
    a_fill = (0.64 - 0.14 * yy) * np.ones_like(xx)
    if kind == KIND_GHOST:
        a_fill = a_fill * 0.5
    # 上緣內側高光線
    hl = np.zeros((th, tw), np.float32)
    y_hl = int(round(border_w * 1.8))
    if y_hl < th:
        hl[y_hl, :] = np.clip(np.sin(np.linspace(0, math.pi, tw)) * 1.4, 0, 1) * 0.16
    hl *= fill

    if kind == KIND_TOP:
        b_col, b_alpha, t_col, t_alpha, weight = GOLD, 0.85, CHAMPAGNE_TEXT, 1.0, 600
    elif kind == KIND_GHOST:
        b_col, b_alpha, t_col, t_alpha, weight = ICE, 0.22, ICE_WHITE, 0.0, 500
    else:
        b_col, b_alpha, t_col, t_alpha, weight = ICE, 0.42, ICE_WHITE, 0.96, 500

    txt = np.zeros((th, tw), np.float32)
    if override is not None:
        mh, mw = override.shape
        sc = min(tw * 0.78 / mw, th * 0.60 / mh)
        nw, nh = max(1, int(mw * sc)), max(1, int(mh * sc))
        m = cv2.resize(override, (nw, nh), interpolation=cv2.INTER_AREA)
        x0, y0 = (tw - nw) // 2, (th - nh) // 2
        txt[y0 : y0 + nh, x0 : x0 + nw] = m
    elif label and kind != KIND_GHOST:
        lines, size = fit_lines(label, tw, th, weight)
        f = load_font(size, weight)
        im = Image.new("L", (tw, th), 0)
        dr = ImageDraw.Draw(im)
        lh = size * 1.24
        boxes = [f.getbbox(ln) for ln in lines]
        top = boxes[0][1]
        bottom = (len(lines) - 1) * lh + boxes[-1][3]
        y0 = (th - (bottom - top)) / 2 - top
        for i, (ln, bb) in enumerate(zip(lines, boxes)):
            x = (tw - (bb[2] - bb[0])) / 2 - bb[0]
            dr.text((x, y0 + i * lh), ln, font=f, fill=255)
        txt = np.asarray(im).astype(np.float32) / 255.0

    # 依序合成：玻璃 → 高光 → 邊框 → 文字（premultiplied）
    A = fill * a_fill
    C = glass * A[..., None]
    for col, a in ((ICE_WHITE, hl), (b_col, border * b_alpha), (t_col, txt * t_alpha)):
        C = col * a[..., None] + C * (1 - a[..., None])
        A = a + A * (1 - a)
    bgra = np.concatenate([C, A[..., None]], axis=2)
    emit = np.clip(border + 0.3 * txt * (t_alpha > 0), 0, 1)  # 文字只微微發光，避免高光時糊字
    aux = np.stack([emit, fill], axis=2)
    return (
        np.clip(bgra * 255 + 0.5, 0, 255).astype(np.uint8),
        np.clip(aux * 255 + 0.5, 0, 255).astype(np.uint8),
    )


# ---------------------------------------------------------------------------
# 攝影機（Catmull-Rom 平滑插值，關鍵格之間不會停頓）
# ---------------------------------------------------------------------------


@dataclass
class CamKey:
    t: float
    target: tuple[float, float, float]
    dist: float
    el: float  # 仰角（度）
    az: float  # 方位角（度）
    stop: bool = False  # 於此關鍵格速度歸零


class SplineCamera:
    def __init__(self, keys: list[CamKey]):
        self.keys = keys
        self.T = np.array([k.t for k in keys])
        self.P = np.array([[*k.target, math.log(k.dist), k.el, k.az] for k in keys], np.float64)

    def _tangent(self, j: int) -> np.ndarray:
        if j == 0 or j == len(self.keys) - 1 or self.keys[j].stop:
            return np.zeros(6)
        return (self.P[j + 1] - self.P[j - 1]) / (self.T[j + 1] - self.T[j - 1])

    def params(self, t: float) -> np.ndarray:
        if t <= self.T[0]:
            return self.P[0]
        if t >= self.T[-1]:
            return self.P[-1]
        i = int(np.searchsorted(self.T, t, side="right") - 1)
        h = self.T[i + 1] - self.T[i]
        u = (t - self.T[i]) / h
        h00, h10 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u
        h01, h11 = -2 * u**3 + 3 * u**2, u**3 - u**2
        return h00 * self.P[i] + h10 * h * self._tangent(i) + h01 * self.P[i + 1] + h11 * h * self._tangent(i + 1)

    def at(self, t: float):
        p = self.params(t)
        target, dist = p[:3], math.exp(p[3])
        el, az = math.radians(p[4]), math.radians(p[5])
        pos = target + dist * np.array([math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)])
        fwd = target - pos
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        return pos, right, up, fwd


# ---------------------------------------------------------------------------
# 場景
# ---------------------------------------------------------------------------

R_WALL = 6.5  # 弧面牆半徑（鏡頭位於弧心附近，呈 IMAX 般的環抱感）
FLY = 1.0  # 單一磚塊飛行時間
FLAT_T0, FLAT_T1 = 5.3, 6.35  # 弧面展平（先展平再移動）
MOVE_T0 = 6.25  # 弧面 → 馬賽克 開始移動（展平後所有磚同時出發，路徑才不會交錯）
TRANS = 1.2  # 重新排列時間（垂直分量）
LAG_X = 0.15  # 水平分量延後比例：先上下撐開空隙，再左右滑入，相鄰磚不互相穿越
SWEEP_T0, SWEEP_T1 = 3.25, 5.45  # 光帶掃過畫面的時間
SWEEP_SIG = 0.8  # 光帶寬度（世界單位，約 1.5 磚寬的半高寬）
SWEEP_TILT = 0.8  # 光帶斜度：上緣領先
END_PUSH = 0.965  # 收尾 1.5 秒的緩慢推近幅度
SHUTTER = 0.5 / FPS  # 動態模糊快門（180°）
NEAR = 0.1


def min_cost_assignment(cost: np.ndarray) -> np.ndarray:
    """匈牙利演算法（O(n²m)）：cost 為 n×m 且 n ≤ m，回傳每一列配到的行索引，使總成本最小。

    以「距離平方」為成本時，所有磚同時沿直線移動的路徑互不交會（最佳傳輸的位移內插性質），
    因此弧面牆 → 馬賽克 的重新排列不會互相穿越。
    """
    cost = np.asarray(cost, np.float64)
    n, m = cost.shape
    if n > m:
        raise ValueError("min_cost_assignment 需要 n ≤ m")
    u = np.zeros(n + 1)
    v = np.zeros(m + 1)
    p = np.zeros(m + 1, np.int64)  # p[j]：配到第 j 行的列（1 起算，0 為未配對）
    way = np.zeros(m + 1, np.int64)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = np.full(m + 1, np.inf)
        used = np.zeros(m + 1, bool)
        while True:
            used[j0] = True
            i0 = p[j0]
            free = ~used
            free[0] = False
            cur = cost[i0 - 1] - u[i0] - v[1:]
            idx = np.nonzero(free[1:] & (cur < minv[1:]))[0] + 1
            minv[idx] = cur[idx - 1]
            way[idx] = j0
            cand = np.where(free, minv, np.inf)
            j1 = int(np.argmin(cand))
            delta = cand[j1]
            uj = np.nonzero(used)[0]
            u[p[uj]] += delta
            v[uj] -= delta
            minv[free] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    out = np.full(n, -1, np.int64)
    for j in range(1, m + 1):
        if p[j]:
            out[p[j] - 1] = j - 1
    return out


def wall_point(s: float, y: float, k: float):
    """弧面牆上弧長 s、高度 y 的位置與切線方向（k 為曲率，0 時為平面）。"""
    if abs(k) < 1e-6:
        return np.array([s, y, 0.0]), np.array([1.0, 0.0, 0.0])
    th = s * k
    return np.array([math.sin(th) / k, y, (1 - math.cos(th)) / k]), np.array([math.cos(th), 0.0, math.sin(th)])


def ease_out_quint(x: float) -> float:
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 5


def glint_env(d: float) -> float:
    if d <= 0 or d > 1.6:
        return 0.0
    return min(1.0, d / 0.05) * math.exp(-max(0.0, d - 0.05) / 0.24)


class LogoWall:
    def __init__(
        self,
        companies: list[dict],
        width: int,
        height: int,
        logo_dir: Path | None,
        note: str,
        title: str = TITLE,
        program: str = PROGRAM,
        count_plus: bool = False,
    ):
        self.W, self.H = width, height
        self.S = width / 1920
        self.F = 1500 * self.S
        self.cx, self.cy = width / 2, height / 2
        self.companies = companies
        self.N = len(companies)
        self.note = note
        self.title = title
        self.program = program
        self.count_plus = count_plus
        rng = np.random.default_rng(20261020)

        self._build_textures(logo_dir)
        self._layout(rng)
        self._build_camera()
        self._build_sweep()
        self._build_particles(rng)
        self._build_floor()
        self._build_background()
        self._build_text()

    # ---- 建構 ---------------------------------------------------------------

    def _build_textures(self, logo_dir):
        counts = [c["count"] for c in self.companies]
        top_n = max(counts) if counts else 0
        # 任職人數 ≥ 2 的企業為重點企業（香檳金）
        self.kind = [KIND_TOP if (top_n >= 2 and c["count"] >= 2) else KIND_NORMAL for c in self.companies]
        widths = sorted({max(24, int(round(w * self.S))) for w in MIP_WIDTHS}, reverse=True)
        self.mip_widths = np.array(widths)
        self.tex = []
        self.override_count = 0
        for c, kind in zip(self.companies, self.kind):
            ov = load_override(logo_dir, c)
            self.override_count += ov is not None
            self.tex.append([make_tile(c["display"], kind, w, ov) for w in widths])
        self.ghost_tex = len(self.tex)
        self.tex.append([make_tile(None, KIND_GHOST, w) for w in widths])

    def _mosaic(self, N: int) -> dict:
        """B：環繞中央標題的馬賽克。

        先放滿收尾畫面內「完整可見」的內圈（環），剩下的企業放在下一圈的上、下兩列並各自置中：
        奇數塊對齊格線、偶數塊錯開半格跨在中線兩側，所以整面馬賽克左右對稱、不會有一邊空著。
        """
        S = self.S
        cols_b = rows_b = 11
        while True:
            px_unit = self.W * 1.03 / (cols_b * PITCH_X)
            hole_c = int(math.ceil(880 * S / (px_unit * PITCH_X)))
            hole_r = int(math.ceil(400 * S / (px_unit * PITCH_Y)))
            hole_c += 1 - hole_c % 2
            hole_r += 1 - hole_r % 2
            hole_r = min(hole_r, rows_b - 4)
            hole_c = min(hole_c, cols_b - 4)
            hc, hr = (hole_c - 1) // 2, (hole_r - 1) // 2
            half_c, half_r = (cols_b - 1) // 2, (rows_b - 1) // 2
            vis = np.array([self.W / 2, self.H / 2]) / (px_unit / END_PUSH)  # 收尾畫面可見的半寬／半高
            vis_c = min(half_c, int(math.floor((vis[0] - TILE_W / 2) / PITCH_X + 1e-6)))
            vis_r = min(half_r, int(math.floor((vis[1] - TILE_H / 2) / PITCH_Y + 1e-6)))
            full_k = max(0, min(vis_c - hc, vis_r - hr))
            cap = (2 * (hc + full_k) + 1) * (2 * (hr + full_k) + 1) - hole_c * hole_r
            if hr + full_k + 1 <= vis_r:
                cap += 2 * (2 * min(vis_c, hc + full_k + 1))
            if cap >= N:
                break
            cols_b += 2
            rows_b += 2

        def centred(m: int, fixed: float, along: float, vertical: bool):
            pts = [((i - (m - 1) / 2) * along, fixed) for i in range(m)]
            return [(b, a) for a, b in pts] if vertical else pts

        comp: list[tuple[float, float]] = []
        offset_rows: dict[float, int] = {}  # 偶數塊置中的列 → 該列格線錯開半格
        remaining, k = N, 1
        while remaining > 0:
            ring = []
            for r in range(-half_r, half_r + 1):
                for c in range(-half_c, half_c + 1):
                    dc, dr = max(0, abs(c) - hc), max(0, abs(r) - hr)
                    if max(dc, dr) == k:
                        ring.append((c * PITCH_X, r * PITCH_Y))
            fully_vis = hc + k <= vis_c and hr + k <= vis_r
            if fully_vis and len(ring) <= remaining:
                comp += ring
                remaining -= len(ring)
                k += 1
                continue
            # 最外圈只放一部分：先上、下兩列（各自置中），仍放不下才放左右兩欄
            row_cap = 2 * min(vis_c, hc + k) + 1
            y_row = (hr + k) * PITCH_Y
            m_top = min(row_cap, (remaining + 1) // 2)
            m_bot = min(row_cap, remaining - m_top)
            comp += centred(m_top, y_row, PITCH_X, False) + centred(m_bot, -y_row, PITCH_X, False)
            for m, y in ((m_top, y_row), (m_bot, -y_row)):
                if m and m % 2 == 0:
                    offset_rows[round(y, 6)] = m
            remaining -= m_top + m_bot
            if remaining > 0:
                col_cap = 2 * (hr + k - 1) + 1
                x_col = (hc + k) * PITCH_X
                m_l = min(col_cap, (remaining + 1) // 2)
                m_r = min(col_cap, remaining - m_l)
                comp += centred(m_l, -x_col, PITCH_Y, True) + centred(m_r, x_col, PITCH_Y, True)
                remaining -= m_l + m_r
            k += 1
        comp_arr = np.array(comp[:N])
        taken = {(round(x, 6), round(y, 6)) for x, y in comp_arr}

        ghosts = []
        for r in range(-half_r, half_r + 1):
            y = r * PITCH_Y
            if round(y, 6) in offset_rows:
                xs = [(j + 0.5) * PITCH_X for j in range(-half_c - 1, half_c + 1)]
            else:
                xs = [c * PITCH_X for c in range(-half_c, half_c + 1)]
            for x in xs:
                if abs(x) <= hc * PITCH_X + 1e-6 and abs(r) <= hr:
                    continue  # 中央留給標題
                if (round(x, 6), round(y, 6)) not in taken:
                    ghosts.append((x, y))
        return dict(
            cols=cols_b, rows=rows_b, hole=(hole_c, hole_r), px_unit=px_unit,
            comp=comp_arr, ghost=np.array(ghosts), offset_rows=offset_rows,
        )

    @staticmethod
    def _choreograph(a_tiles: list[dict]):
        """決定每塊磚「先上下、先左右或同時」移動，使重新排列時磚與磚的重疊面積最小。

        預設先上下撐開空隙、再左右滑入（水平延後 LAG_X）；對仍會重疊的磚逐一嘗試其他順序，
        以模擬的重疊面積積分挑最好的（只在初始化時計算一次）。
        """
        if not a_tiles:
            return
        A = np.array([t["a"] for t in a_tiles])
        B = np.array([t["b"] for t in a_tiles])
        options = ((LAG_X, 0.0), (0.0, LAG_X), (0.0, 0.0))
        choice = np.zeros(len(a_tiles), int)
        ss = np.linspace(0, 1 + LAG_X, 90)

        def ease_v(x):  # 與 ease("io") 相同的三次緩入緩出（向量化）
            return np.where(x < 0.5, 4 * x**3, 1 - (-2 * x + 2) ** 3 / 2)

        def overlap(ch):
            lx = np.array([options[c][0] for c in ch])
            ly = np.array([options[c][1] for c in ch])
            total = 0.0
            per = np.zeros(len(ch))
            for s in ss:
                ux = ease_v(np.clip(s - lx, 0, 1))
                uy = ease_v(np.clip(s - ly, 0, 1))
                P = A + (B - A) * np.column_stack([ux, uy])
                dx = np.abs(P[:, None, 0] - P[None, :, 0])
                dy = np.abs(P[:, None, 1] - P[None, :, 1])
                ov = np.clip(TILE_W - dx, 0, None) * np.clip(TILE_H - dy, 0, None)
                np.fill_diagonal(ov, 0)
                per += ov.sum(1)
                total += ov.sum() / 2
            return total, per

        best, per = overlap(choice)
        for _ in range(3):
            improved = False
            for i in np.argsort(-per):
                if per[i] <= 1e-6:
                    break
                for c in range(len(options)):
                    if c == choice[i]:
                        continue
                    trial = choice.copy()
                    trial[i] = c
                    tot, p2 = overlap(trial)
                    if tot < best - 1e-6:
                        best, per, choice = tot, p2, trial
                        improved = True
            if not improved:
                break
        for t, c in zip(a_tiles, choice):
            t["lag_x"], t["lag_y"] = options[c]

    def _layout(self, rng):
        N = max(1, self.N)
        # ---- A：弧面牆（rows_A × cols_A） ----
        rows_a = int(min(8, max(3, round(math.sqrt(N / 1.9)))))
        cols_a = int(math.ceil(N / rows_a))
        self.rows_a, self.cols_a = rows_a, cols_a
        slots_a = np.array(
            [((c - (cols_a - 1) / 2) * PITCH_X, ((rows_a - 1) / 2 - r) * PITCH_Y) for r in range(rows_a) for c in range(cols_a)]
        )
        self.half_a = np.array([cols_a * PITCH_X / 2, rows_a * PITCH_Y / 2])
        na = slots_a / self.half_a
        cheb_a = np.max(np.abs(na), axis=1)
        d_ell = np.hypot(na[:, 0], na[:, 1] * 0.9)

        # 多出的空位放在牆的四個角落，以極淡的空玻璃框呈現（不像缺資料）
        n_spare = len(slots_a) - self.N
        corner = np.round(np.abs(na[:, 0]) + np.abs(na[:, 1]), 6)
        spare = [int(i) for i in np.lexsort((slots_a[:, 0], slots_a[:, 1], -corner))[:n_spare]]

        # 公司排入 A：重點企業（人數 ≥ 2）居中 → 知名企業沿鏡頭滑行路徑（中間兩列）→ 其餘以固定亂數交錯
        top_idx = sorted(
            [i for i in range(self.N) if self.kind[i] == KIND_TOP],
            key=lambda i: (-self.companies[i]["count"], self.companies[i]["display"]),
        )
        feat_keys = [_key(n) for n in FEATURED]
        feat_idx = sorted(
            [i for i in range(self.N) if self.kind[i] != KIND_TOP and _key(self.companies[i]["display"]) in feat_keys],
            key=lambda i: feat_keys.index(_key(self.companies[i]["display"])),
        )
        rest = [i for i in range(self.N) if i not in top_idx and i not in feat_idx]
        rng.shuffle(rest)
        pool = sorted((i for i in range(len(slots_a)) if i not in spare), key=lambda i: (d_ell[i], i))
        a_slot_of: dict[int, int] = {}
        for ci in top_idx:
            a_slot_of[ci] = pool.pop(0)
        glide = np.abs(slots_a[:, 1]) / PITCH_Y + 0.55 * np.abs(slots_a[:, 0]) / PITCH_X
        pool.sort(key=lambda i: (glide[i], abs(slots_a[i, 0]), i))
        for ci in feat_idx:
            a_slot_of[ci] = pool.pop(0)
        for ci, sa in zip(rest, pool):
            a_slot_of[ci] = sa

        # ---- B：馬賽克 ----
        mb = self._mosaic(N)
        self.cols_b, self.rows_b, self.hole = mb["cols"], mb["rows"], mb["hole"]
        px_unit = mb["px_unit"]
        self.dist_b = self.F / px_unit
        comp_b, ghost_b = mb["comp"], mb["ghost"]

        # A → B：以距離平方做最小成本配對（路徑互不交錯）。座標先除以磚距，
        # 讓長方形磚在配對時等同正方格，減少相鄰磚在途中擦身重疊
        pitch = np.array([PITCH_X, PITCH_Y])
        a_flat = np.array([slots_a[a_slot_of[ci]] for ci in range(self.N)]) / pitch
        cost = ((a_flat[:, None, :] - (comp_b / pitch)[None, :, :]) ** 2).sum(-1)
        b_idx = min_cost_assignment(cost)

        tiles = []
        r_a_max = max(1e-6, cheb_a.max())
        for ci in range(self.N):
            sa = a_slot_of[ci]
            tiles.append(dict(tex=ci, kind=self.kind[ci], has_a=True, a=slots_a[sa], b=comp_b[b_idx[ci]], ra=cheb_a[sa] / r_a_max))
        # 弧面牆角落的空位：原地淡出，不參與移動（避免與企業磚交錯）
        for sa in spare:
            tiles.append(dict(tex=self.ghost_tex, kind=KIND_GHOST, has_a=True, a=slots_a[sa], b=slots_a[sa], ra=cheb_a[sa] / r_a_max, spare=True))
        for g in range(len(ghost_b)):
            tiles.append(dict(tex=self.ghost_tex, kind=KIND_GHOST, has_a=False, a=None, b=ghost_b[g], ra=1.0))

        # 畫面可見範圍（收尾鏡頭）正規化後的半徑：用於外圈空白磚的漸隱與收尾光環
        vis = np.array([self.W / 2, self.H / 2]) / px_unit
        rb_ell = np.array([np.hypot(*(t["b"] / vis)) for t in tiles])
        # 三波飛入：依離中心遠近排序後平均分成三波（每波磚數相同）
        a_tiles = [t for t in tiles if t["has_a"]]
        for rank, t in enumerate(sorted(a_tiles, key=lambda t: (t["ra"], abs(t["a"][0])))):
            t["wave"] = min(2, rank * 3 // len(a_tiles))
        rmin, rmax = rb_ell.min(), rb_ell.max()
        for t, re_ in zip(tiles, rb_ell):
            t["rb"] = float((re_ - rmin) / max(1e-6, rmax - rmin))
            # 企業磚永遠完整呈現；空白磚往畫面外緣漸隱
            t["edge"] = 1.0 if t["kind"] != KIND_GHOST else float(1 - 0.7 * smoothstep(0.85, 1.2, re_))
            t["scale"] = 1.05 if t["kind"] == KIND_TOP else 1.0
            if t["has_a"]:
                # 第 1 幕：由中心向外三波飛入
                wave = int(t["wave"])
                ang = math.atan2(t["a"][1] / self.half_a[1], t["a"][0] / self.half_a[0])
                t["t_arr"] = 0.72 + wave * 0.6 + 0.2 * (0.5 + 0.5 * math.sin(ang * 2 + wave)) + rng.uniform(0, 0.06)
                pa, _ = wall_point(t["a"][0], t["a"][1], 1 / R_WALL)
                spread = rng.uniform(0.3, 0.6)
                t["p0"] = np.array(
                    [pa[0] * spread + rng.uniform(-1.2, 1.2), pa[1] * spread + rng.uniform(-0.8, 0.8), pa[2] - rng.uniform(30, 40)]
                )
                t["yaw0"] = rng.uniform(0.35, 0.75) * rng.choice([-1, 1])
                t["roll0"] = rng.uniform(-0.28, 0.28)
                # 第 3 幕：同時出發（只留極小的隨機差），最短路徑配對的直線路徑才互不交錯
                t["t_b"] = MOVE_T0 + rng.uniform(0, 0.04)
            else:
                t["t_f"] = 6.6 + 0.8 * t["rb"] + rng.uniform(0, 0.12)

        # 移動距離越長的磚前浮越多，並各有獨立深度（依移動距離排序），交錯時前後分明
        a_tiles = [t for t in tiles if t["has_a"] and not t.get("spare")]
        trav = np.array([np.hypot(*(t["a"] - t["b"])) for t in a_tiles])
        tmax = max(1e-6, float(trav.max()))
        order = np.argsort(np.argsort(trav, kind="stable"), kind="stable")
        for t, tr, rk in zip(a_tiles, trav, order):
            t["travel"] = float(tr)
            t["pop"] = 0.06 + 0.32 * tr / tmax + 0.12 * rk / max(1, len(a_tiles) - 1)
            t["opq"] = float(smoothstep(0.1, 0.45, tr))
        for t in tiles:
            if t.get("spare"):
                t.update(travel=0.0, pop=0.0, opq=0.0, lag_x=0.0, lag_y=0.0)
        self._choreograph(a_tiles)
        self.tiles = tiles
        self.emit_point = np.mean([t["p0"] for t in tiles if t["has_a"]], axis=0)
        self.s_range = (slots_a[:, 0].min(), slots_a[:, 0].max())
        self.y_range = (slots_a[:, 1].min(), slots_a[:, 1].max())
        self.mosaic_info = mb

    def _build_camera(self):
        d = self.dist_b
        self.cam = SplineCamera(
            [
                CamKey(0.0, (0.0, 0.15, -1.0), 9.2, 1.5, -5.0),
                CamKey(2.5, (-1.5, 0.05, 0.45), 6.5, 2.5, 8.0),
                CamKey(4.3, (0.2, 0.0, 0.25), 5.7, 0.8, 1.5),
                CamKey(6.0, (1.9, -0.05, 0.45), 5.9, -1.0, -8.5),
                CamKey(7.85, (0.0, 0.0, 0.0), d * 1.0, 0.0, 0.0),
                CamKey(10.0, (0.0, 0.0, 0.0), d * END_PUSH, 0.0, 0.0, stop=True),
            ]
        )

    def _build_sweep(self):
        """預先計算每個時間點鏡頭「看得到」的牆面弧長範圍，讓光帶確實從畫面左緣掃到右緣。"""
        ts = np.arange(SWEEP_T0 - 0.3, SWEEP_T1 + 0.31, 0.05)
        ss = np.linspace(self.s_range[0] - 2.0, self.s_range[1] + 2.0, 361)
        lo, hi = [], []
        for t in ts:
            k = self.curvature(t)
            pts = np.array([wall_point(s, 0.0, k)[0] for s in ss])
            p, z = self.project(pts, self.cam.at(t))
            ok = (z > NEAR) & (p[:, 0] >= 0) & (p[:, 0] <= self.W)
            lo.append(ss[ok].min() if ok.any() else self.s_range[0])
            hi.append(ss[ok].max() if ok.any() else self.s_range[1])
        self.sw_t, self.sw_lo, self.sw_hi = ts, np.array(lo), np.array(hi)

    def sweep_env(self, t: float) -> float:
        return float(smoothstep(SWEEP_T0 - 0.15, SWEEP_T0 + 0.25, t) * (1 - smoothstep(SWEEP_T1 - 0.25, SWEEP_T1 + 0.05, t)))

    def sweep_s(self, t: float) -> float:
        """光帶中心（於 y=0 處）的弧長位置：由可見範圍左外側緩入緩出掃到右外側。"""
        p = ease("io", (t - SWEEP_T0) / (SWEEP_T1 - SWEEP_T0))
        lo = float(np.interp(t, self.sw_t, self.sw_lo)) - 1.0
        hi = float(np.interp(t, self.sw_t, self.sw_hi)) + 1.0
        return lo + (hi - lo) * p

    def sweep_amount(self, s: float, y: float, t: float) -> float:
        env = self.sweep_env(t)
        if env <= 0:
            return 0.0
        d = (s - (self.sweep_s(t) + SWEEP_TILT * y)) / SWEEP_SIG
        return env * math.exp(-d * d)

    def _sweep_line(self, t: float, cam):
        """光帶中心線投影到畫面上的兩端點與寬度（像素）。"""
        c, k = self.sweep_s(t), self.curvature(t)
        yt = self.y_range[1] + TILE_H / 2 + 0.2
        yb = self.y_range[0] - TILE_H / 2 - 0.2
        a3, _ = wall_point(c + SWEEP_TILT * yt, yt, k)
        b3, _ = wall_point(c + SWEEP_TILT * yb, yb, k)
        m3, _ = wall_point(c, 0.0, k)
        ab, z = self.project(np.array([a3, b3, m3]), cam)
        if (z <= NEAR).any():
            return None
        return ab[0], ab[1], self.F * SWEEP_SIG / z[2]

    def _build_particles(self, rng):
        n = 520
        self.p_pos = np.column_stack(
            [rng.uniform(-16, 16, n), rng.uniform(-5.5, 6.5, n), rng.uniform(-34, 11, n)]
        )
        self.p_vel = rng.normal(0, 0.035, (n, 3))
        self.p_gold = rng.uniform(0, 1, n) < 0.35
        self.p_phase = rng.uniform(0, 2 * math.pi, n)
        self.p_size = rng.uniform(0.008, 0.02, n)

    def _build_floor(self):
        self.y_floor = self.y_range[0] - TILE_H / 2 - 0.85
        segs = []
        xs = np.arange(-18, 18.01, PITCH_X)
        zs = np.arange(-30, 12.01, 1.0)
        for x in xs:
            for z0 in zs[:-1]:
                segs.append(((x, self.y_floor, z0), (x, self.y_floor, z0 + 1.0)))
        for z in zs:
            for x0 in xs[:-1]:
                segs.append(((x0, self.y_floor, z), (x0 + PITCH_X, self.y_floor, z)))
        self.floor = np.array(segs, np.float64)

    def _build_background(self):
        H, W = self.H, self.W
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xs - W * 0.5) / W) ** 2 + ((ys - H * 0.47) / H) ** 2)
        k = smoothstep(0.0, 0.8, d).astype(np.float32)[..., None]
        self.bg = (NAVY_LIFT * 0.6 * (1 - k) + NAVY_DEEP * k).astype(np.float32)
        r = np.sqrt(((xs - W / 2) / (W / 2)) ** 2 + ((ys - H / 2) / (H / 2)) ** 2)
        self.vignette = (1 - 0.32 * smoothstep(0.55, 1.45, r)).astype(np.float32)[..., None]
        self.q = 4
        qh, qw = H // self.q, W // self.q
        qy, qx = np.mgrid[0:qh, 0:qw].astype(np.float32)
        self.qx = (qx + 0.5) * self.q
        self.qy = (qy + 0.5) * self.q
        # 標題區暗化（讓文字清楚）
        self.scrim = np.exp(-(((xs - W / 2) / (W * 0.25)) ** 2) - (((ys - H / 2) / (H * 0.20)) ** 2)).astype(np.float32)[..., None]

    def _build_text(self):
        """收尾文字沿用品牌片／校友片片尾卡的字體系統：
        金色細線 132×2 px、班別字距 0.12em（27 px），標題字級與字距同片尾標語（56 px／0.06em）。"""
        S = self.S
        self.t_title = text_mask(self.title, 56 * S, 600, 0.06)
        self.t_program = text_mask(self.program, 27 * S, 450, 0.12)
        self.t_note = text_mask(self.note, 24 * S, 400, 0.06) if self.note else None
        self.t_unit = text_mask("家企業", 30 * S, 500, 0.12)
        self.count_cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}
        logo = Image.open(NTUST_LOGO_WHITE).convert("RGBA")
        lw = int(round(500 * S))
        lh = int(round(logo.height * lw / logo.width))
        self.t_logo = np.asarray(logo.resize((lw, lh), Image.LANCZOS)).astype(np.float32)[..., 3] / 255.0
        self.line_w = int(round(132 * S))
        self.line_h = max(2, int(round(2 * S)))
        # 版面：第 3 幕（標題＋家數＋資料來源）與收尾（加上校標、班別與金色細線）
        g = lambda v: int(round(v * S))  # noqa: E731
        self.count_h = text_mask("0123456789+", 46 * S, 650).shape[0]
        hs = dict(
            logo=self.t_logo.shape[0], program=self.t_program.shape[0], title=self.t_title.shape[0],
            count=self.count_h, note=self.t_note.shape[0] if self.t_note is not None else 0, line=self.line_h,
        )
        mid = [("title", 0), ("count", g(20)), ("note", g(14))]
        final = [("logo", 0), ("program", g(22)), ("line", g(24)), ("title", g(26)), ("count", g(18)), ("note", g(14))]

        def stack(items):
            ys, y = {}, 0
            for name, gap in items:
                y += gap
                ys[name] = y
                y += hs[name]
            return ys, y

        ys_mid, tot_mid = stack(mid)
        ys_fin, tot_fin = stack(final)
        self.y_mid = {k: v + (self.H - tot_mid) / 2 - g(4) for k, v in ys_mid.items()}
        self.y_fin = {k: v + (self.H - tot_fin) / 2 for k, v in ys_fin.items()}
        self.text_block_h = tot_fin

    # ---- 投影 ---------------------------------------------------------------

    def project(self, P, cam):
        pos, right, up, fwd = cam
        v = np.asarray(P, np.float64) - pos
        x, y, z = v @ right, v @ up, v @ fwd
        zz = np.where(z > NEAR, z, NEAR)
        return np.stack([self.cx + self.F * x / zz, self.cy - self.F * y / zz], -1), z

    @staticmethod
    def _px(pts):
        return np.round(np.clip(pts, -3e4, 3e4) * 16).astype(np.int32)

    @staticmethod
    def c255(bgr, k=1.0):
        return tuple(float(x) for x in np.clip(bgr * 255 * k, 0, 255))

    # ---- 時間軸 ---------------------------------------------------------------

    @staticmethod
    def curvature(t: float) -> float:
        """弧面牆曲率：5.3–6.35 秒先展平，之後磚塊才在平面上移動到馬賽克位置。"""
        return (1 / R_WALL) * (1 - ease("io", (t - FLAT_T0) / (FLAT_T1 - FLAT_T0)))

    @staticmethod
    def locked(tile: dict, t: float) -> bool:
        """磚塊已落定在弧面牆上、牆尚未開始展平：此段完全不做動態模糊。"""
        return bool(tile["has_a"] and t < FLAT_T0 and t >= tile["t_arr"] and t < tile["t_b"])

    def tile_state(self, tile: dict, t: float):
        """回傳 (中心, 右向量, 上向量, 不透明度, 亮度, 金色發光, 冰白發光, 磚面加厚)；不可見時回傳 None。"""
        up = np.array([0.0, 1.0, 0.0])
        e_gold = e_ice = 0.0
        bright = 1.0
        opaque = 0.0
        ghost = tile["kind"] == KIND_GHOST
        if tile["has_a"]:
            tau = (t - (tile["t_arr"] - FLY)) / FLY
            if tau <= 0:
                return None
            k = self.curvature(t)
            pa, ra = wall_point(tile["a"][0], tile["a"][1], k)
            e = ease_out_quint(tau)
            P = tile["p0"] + (pa - tile["p0"]) * e
            rot = 1 - ease("out", tau)
            yaw, roll = tile["yaw0"] * rot, tile["roll0"] * rot
            alpha = float(smoothstep(0.0, 0.18, tau))
            R = ra
            if tau < 1:
                e_ice += 0.55 * (1 - e) ** 0.5
            if not ghost:
                e_gold += glint_env(t - tile["t_arr"]) * 0.95
            sb = (t - tile["t_b"]) / TRANS
            u = ease("io", sb / (1 + LAG_X))
            if u > 0:
                uy, ux = ease("io", sb - tile["lag_y"]), ease("io", sb - tile["lag_x"])
                pb = np.array([tile["b"][0], tile["b"][1], 0.0])
                arc = math.sin(math.pi * u)
                P = P + (pb - P) * np.array([ux, uy, u]) + np.array([0.0, 0.0, tile["pop"] * arc])
                R = R + (np.array([1.0, 0.0, 0.0]) - R) * u
                R /= np.linalg.norm(R)
                e_ice += 0.10 * arc
                # 移動中的磚提高不透明度（約 0.9），前方的磚會完全遮住後方的字
                opaque = tile["opq"] * float(smoothstep(0.0, 0.12, u) * (1 - smoothstep(0.86, 1.0, u)))
            if ghost:
                # 弧面牆角落的空位極淡，展平時原地淡出
                alpha *= 0.3 * (1 - float(smoothstep(FLAT_T0, FLAT_T0 + 0.6, t)))
            # 光帶掃過（第 2 幕）
            sw = self.sweep_amount(tile["a"][0], tile["a"][1], t)
            if sw > 0.002:
                e_gold += (0.45 if not ghost else 0.1) * sw
                bright *= 1 + 0.06 * sw
        else:
            v = ease("out", (t - tile["t_f"]) / 0.9)
            if v <= 0:
                return None
            P = np.array([tile["b"][0], tile["b"][1], -2.6 * (1 - v)])
            R = np.array([1.0, 0.0, 0.0])
            yaw = roll = 0.0
            alpha = v * 0.55 * tile["edge"]
        if tile["kind"] == KIND_TOP:
            e_gold += 0.10 + 0.05 * math.sin(t * 2.6 + tile["a"][0])
        # 收尾：中心向外的金色光環＋整面牆柔和發光
        ring = float(ease("out", (t - 8.45) / 1.15))
        if 0 < ring < 1 and not ghost:
            e_gold += 0.7 * math.exp(-(((tile["rb"] - (ring * 1.35 - 0.1)) / 0.1) ** 2)) * (1 - ring) ** 0.5
        if not ghost:
            e_ice += 0.1 * float(smoothstep(8.4, 9.4, t))
        bright *= 1 - 0.22 * float(smoothstep(8.3, 9.3, t))
        if roll:
            R, up = math.cos(roll) * R + math.sin(roll) * up, -math.sin(roll) * R + math.cos(roll) * up
        if yaw:
            Ry = rot_y(yaw)
            R, up = Ry @ R, Ry @ up
        return P, R, up, alpha, bright, e_gold, e_ice, opaque

    def corners(self, P, R, U, scale=1.0):
        hw, hh = TILE_W / 2 * scale, TILE_H / 2 * scale
        return np.array([P - hw * R + hh * U, P + hw * R + hh * U, P + hw * R - hh * U, P - hw * R - hh * U])

    # ---- 繪製 ---------------------------------------------------------------

    def _composite_tile(self, img, glowf, cov, samples, tex_i, opaque=0.0):
        """samples：[(四角像素座標, 不透明度, 亮度, 發光 BGR)]；多個樣本即動態模糊（取平均，不會疊加變亮）。

        opaque > 0 時先在磚後墊一層深色玻璃，使磚面整體不透明度提高到約 0.9。
        cov 記錄每個像素被磚面覆蓋的程度，供光帶「掠過玻璃」的反光使用。
        """
        allp = np.concatenate([s[0] for s in samples])
        x0 = int(max(0, math.floor(allp[:, 0].min()) - 1))
        y0 = int(max(0, math.floor(allp[:, 1].min()) - 1))
        x1 = int(min(self.W, math.ceil(allp[:, 0].max()) + 2))
        y1 = int(min(self.H, math.ceil(allp[:, 1].max()) + 2))
        if x1 <= x0 or y1 <= y0:
            return
        c0 = samples[0][0]
        pw = max(np.linalg.norm(c0[1] - c0[0]), np.linalg.norm(c0[2] - c0[3]))
        ok = self.mip_widths >= pw * 0.92
        lvl = int(np.nonzero(ok)[0][-1]) if ok.any() else 0
        tex, aux = self.tex[tex_i][lvl]
        th, tw = tex.shape[:2]
        src = np.float32([[0, 0], [tw, 0], [tw, th], [0, th]])
        w, h = x1 - x0, y1 - y0
        acc_c = np.zeros((h, w, 3), np.float32)
        acc_a = np.zeros((h, w, 1), np.float32)
        acc_e = None
        acc_b = None
        n = len(samples)
        for cpx, a, b, emit in samples:
            M = cv2.getPerspectiveTransform(src, (cpx - [x0, y0]).astype(np.float32))
            wt = cv2.warpPerspective(tex, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
            wt = wt.astype(np.float32) * (1 / 255)
            acc_c += wt[..., :3] * (a * b / n)
            acc_a += wt[..., 3:4] * (a / n)
            has_emit = float(emit.max()) > 0.004
            if has_emit or opaque > 0.002:
                wa = cv2.warpPerspective(aux, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
                wa = wa.astype(np.float32) * (1 / 255)
                if has_emit:
                    contrib = wa[..., 0:1] * (a / n) * emit.astype(np.float32)
                    acc_e = contrib if acc_e is None else acc_e + contrib
                if opaque > 0.002:
                    bk = wa[..., 1:2] * (a * opaque * 0.8 / n)
                    acc_b = bk if acc_b is None else acc_b + bk
        region = img[y0:y1, x0:x1]
        creg = cov[y0:y1, x0:x1]
        if acc_b is not None:
            region *= 1 - acc_b
            region += GLASS_BACK * acc_b
            creg *= 1 - acc_b
            creg += acc_b
        region *= 1 - acc_a
        region += acc_c
        creg *= 1 - acc_a
        creg += acc_a
        if acc_e is not None:
            glowf[y0:y1, x0:x1] += acc_e

    def _star(self, glow8, p, size, k, col):
        """香檳金星芒（十字光＋核心）。"""
        x, y = p
        for length, inten in ((size, 0.3), (size * 0.5, 0.35), (size * 0.22, 0.5)):
            for dx, dy in ((1, 0), (0, 1)):
                a = (x - dx * length, y - dy * length)
                b = (x + dx * length, y + dy * length)
                cv2.line(glow8, tuple(self._px(np.array(a))), tuple(self._px(np.array(b))), self.c255(col, inten * k), 1, cv2.LINE_AA, 4)
        cv2.circle(glow8, tuple(self._px(np.array(p))), int(16 * max(1.0, 3.4 * self.S * k)), self.c255(WARM, k), -1, cv2.LINE_AA, 4)

    def _trails(self, t: float, cam):
        """飛入光軌：半解析度繪製後高斯模糊成柔和光束，回傳全解析度 float 圖層（畫在磚塊後方）。"""
        W2, H2 = self.W // 2, self.H // 2
        buf = None
        thick = max(1, int(round(2 * self.S)))
        for tile in self.tiles:
            if not tile["has_a"] or tile["kind"] == KIND_GHOST:
                continue
            tau = (t - (tile["t_arr"] - FLY)) / FLY
            if not 0 < tau < 1:
                continue
            speed_k = (1 - ease_out_quint(tau)) ** 0.6  # 落定前約 0.25 秒已淡出
            if speed_k < 0.02:
                continue
            _, tangent = wall_point(tile["a"][0], tile["a"][1], 1 / R_WALL)
            centers = []
            for j in range(13):
                sj = self.tile_state(tile, t - j * 0.03)
                if sj is None:
                    break
                centers.append(sj[0])
            if len(centers) < 2:
                continue
            if buf is None:
                buf = np.zeros((H2, W2, 3), np.uint8)
            C = np.array(centers)
            col = GOLD if tile["kind"] == KIND_TOP else ICE_WHITE * 0.85 + GOLD * 0.15
            for lane, lk, th in ((C, 1.0, thick), (C - tangent * 0.3, 0.32, 1), (C + tangent * 0.3, 0.32, 1)):
                p2, z2 = self.project(lane, cam)
                p2 = p2 * 0.5
                for j in range(len(lane) - 1):
                    if z2[j] <= NEAR or z2[j + 1] <= NEAR:
                        continue
                    k = 0.95 * lk * speed_k * (1 - j / (len(lane) - 1)) ** 1.5
                    cv2.line(buf, tuple(self._px(p2[j])), tuple(self._px(p2[j + 1])), self.c255(col, k), th, cv2.LINE_AA, 4)
        if buf is None:
            return None
        f = cv2.GaussianBlur(buf.astype(np.float32) / 255.0, (0, 0), max(0.8, 2.0 * self.S))
        return cv2.resize(f, (self.W, self.H), interpolation=cv2.INTER_LINEAR) * 1.7

    def render(self, t: float) -> np.ndarray:
        W, H, S = self.W, self.H, self.S
        cam = self.cam.at(t)
        cam_prev = self.cam.at(t - SHUTTER * 1.6)
        sharp = np.zeros((H, W, 3), np.uint8)
        glow8 = np.zeros((H, W, 3), np.uint8)
        glowf = np.zeros((H, W, 3), np.float32)
        cov = np.zeros((H, W, 1), np.float32)
        low = np.zeros((H // self.q, W // self.q, 3), np.float32)
        bloom_extra = None

        # 牆後藍色光暈
        cp, cz = self.project(np.array([[0.0, 0.0, -1.0]]), cam)
        if cz[0] > NEAR:
            rpx = self.F * 5.5 / cz[0]
            d2 = ((self.qx - cp[0, 0]) ** 2 + ((self.qy - cp[0, 1]) * 1.6) ** 2) / rpx**2
            low += (np.exp(-d2)[..., None] * NTUST_BLUE * 0.16 * float(smoothstep(-0.5, 2.0, t))).astype(np.float32)

        # 第 1 幕：磚塊湧出的深空光源
        env = float(smoothstep(-0.6, 0.2, t) * (1 - smoothstep(1.3, 2.5, t)))
        if env > 0:
            ep, ez = self.project(self.emit_point[None], cam)
            if ez[0] > NEAR:
                rpx = self.F * 7.0 / ez[0]
                d2 = ((self.qx - ep[0, 0]) ** 2 + ((self.qy - ep[0, 1]) * 1.5) ** 2) / rpx**2
                low += ((np.exp(-d2 * 9)[..., None] * WARM * 0.55 + np.exp(-d2)[..., None] * (ICE * 0.10 + GOLD * 0.05)) * env).astype(
                    np.float32
                )

        # 光帶（第 2 幕）：牆後柔和光束＋磚面反光（反光乘上磚面覆蓋率，只出現在玻璃上）
        glare_q = spec_q = None
        sw_k = self.sweep_env(t)
        if sw_k > 0:
            line = self._sweep_line(t, cam)
            if line is not None:
                A, B, wpx = line
                d = B - A
                L2 = float(d @ d) + 1e-6
                nrm = np.array([-d[1], d[0]]) / math.sqrt(L2)
                dist = np.abs((self.qx - A[0]) * nrm[0] + (self.qy - A[1]) * nrm[1])
                along = ((self.qx - A[0]) * d[0] + (self.qy - A[1]) * d[1]) / L2
                vert = 1 - smoothstep(0.0, 0.1, np.abs(along - 0.5) - 0.5)
                beam = np.exp(-((dist / (wpx * 1.5)) ** 2)) * vert
                low += (beam[..., None] * (GOLD * 0.07 + ICE_WHITE * 0.02) * sw_k).astype(np.float32)
                # 寬而淡的暖光＋細窄的鏡面反光（像光線掠過玻璃），細線很快掃過，不影響字的辨識
                glare_q = (np.exp(-((dist / wpx) ** 2)) * vert * sw_k).astype(np.float32)
                spec_q = (np.exp(-((dist / (wpx * 0.16)) ** 2)) * vert * sw_k).astype(np.float32)

        # 地面格線（深度感）
        floor_k = float(smoothstep(0.0, 1.0, t) * (1 - smoothstep(5.9, 7.2, t)))
        if floor_k > 0.01:
            pts, z = self.project(self.floor.reshape(-1, 3), cam)
            pts = pts.reshape(-1, 2, 2)
            z = z.reshape(-1, 2)
            ok = (z > NEAR).all(1)
            # 以離牆中心的距離漸隱（只在牆下方形成一片舞台），並避開鏡頭近處
            mid = self.floor.mean(1)
            rr = np.hypot(mid[:, 0] / 9.0, (mid[:, 2] - 1.0) / 7.0)
            fog = np.exp(-(rr**2)) * np.clip(z.min(1) / 4.0, 0, 1)
            for level in (0.25, 0.5, 0.75, 1.0):
                sel = ok & (fog <= level) & (fog > level - 0.25)
                if sel.any():
                    cv2.polylines(sharp, list(self._px(pts[sel])), False, self.c255(STEEL, 0.22 * floor_k * level), 1, cv2.LINE_AA, 4)

        # 粒子（隨鏡頭快速移動時拉出光痕）
        pp = self.p_pos + self.p_vel * t
        p_now, z_now = self.project(pp, cam)
        p_old, z_old = self.project(pp - self.p_vel * SHUTTER * 1.6, cam_prev)
        twinkle = 0.55 + 0.45 * np.sin(t * 2.0 + self.p_phase)
        fade_in = float(smoothstep(-0.3, 0.8, t))
        for i in np.nonzero((z_now > 0.5) & (z_old > 0.5))[0]:
            x, y = p_now[i]
            if not (-20 < x < W + 20 and -20 < y < H + 20):
                continue
            depth_k = float(np.clip(1.2 - z_now[i] / 40, 0.25, 1.0))
            k = 0.55 * twinkle[i] * depth_k * fade_in
            col = GOLD if self.p_gold[i] else ICE_WHITE
            r = float(np.clip(self.F * self.p_size[i] / z_now[i], 0.8 * S, 2.6 * S))
            if np.hypot(*(p_now[i] - p_old[i])) > 2.0 * S:
                cv2.line(glow8, tuple(self._px(p_old[i])), tuple(self._px(p_now[i])), self.c255(col, k * 0.7), 1, cv2.LINE_AA, 4)
            cv2.circle(glow8, tuple(self._px(p_now[i])), int(r * 16), self.c255(col, k), -1, cv2.LINE_AA, 4)

        # 合成背景層（飛入光軌在磚塊後方，磚塊會蓋住它）
        img = self.bg.copy()
        img += cv2.resize(low, (W, H), interpolation=cv2.INTER_LINEAR)
        img += sharp.astype(np.float32) / 255.0
        if t < 2.6:
            trail = self._trails(t, cam)
            if trail is not None:
                img += trail
                bloom_extra = trail * 0.45

        # 磚塊：遠到近排序後繪製
        draws = []
        margin = 60 * S
        for tile in self.tiles:
            st = self.tile_state(tile, t)
            if st is None:
                continue
            P, R, U, alpha, bright, eg, ei, opq = st
            if alpha <= 0.003:
                continue
            cw = self.corners(P, R, U, tile["scale"])
            cpx, cz = self.project(cw, cam)
            if (cz <= NEAR).any():
                continue
            if cpx[:, 0].max() < -margin or cpx[:, 0].min() > W + margin or cpx[:, 1].max() < -margin or cpx[:, 1].min() > H + margin:
                continue
            # 動態模糊：只看磚塊「本身」的移動（同一個鏡頭下比較），鏡頭滑行不造成模糊；
            # 模糊長度隨速度以 smoothstep 連續增加，相鄰兩格之間不會突然由清晰變糊
            n_sub, shutter = 1, 0.0
            if not self.locked(tile, t):
                st0 = self.tile_state(tile, t - SHUTTER)
                if st0 is not None:
                    c0, z0 = self.project(self.corners(st0[0], st0[1], st0[2], tile["scale"]), cam)
                    if (z0 > NEAR).all():
                        width1 = np.linalg.norm(cpx[1] - cpx[0])
                        width0 = np.linalg.norm(c0[1] - c0[0])
                        v = float(np.hypot(*(cpx.mean(0) - c0.mean(0)))) + 0.5 * abs(width1 - width0)
                        kk = float(smoothstep(3.0 * S, 12.0 * S, v))
                        blur = v * kk
                        if t > 5.0 and blur > 8.0 * S:
                            # 展平與重新排列時限制拖影長度（約 8 px），字標仍可辨識
                            kk *= 8.0 * S / blur
                            blur = 8.0 * S
                        if blur > 0.75 * S:
                            n_sub = int(np.clip(math.ceil(blur / (1.5 * max(S, 0.5))) + 1, 2, 24))
                            shutter = SHUTTER * kk
            draws.append((float(cz.mean()), tile, st, cpx, n_sub, shutter))
        draws.sort(key=lambda d: -d[0])

        for _, tile, st, cpx, n_sub, shutter in draws:
            P, R, U, alpha, bright, eg, ei, opq = st
            samples = []
            if n_sub == 1:
                samples.append((cpx, alpha, bright, GOLD_GLOW * eg + ICE_WHITE * ei))
            else:
                for j in range(n_sub):
                    tj = t - shutter * j / (n_sub - 1)
                    sj = self.tile_state(tile, tj)
                    if sj is None:
                        continue
                    cj, zj = self.project(self.corners(sj[0], sj[1], sj[2], tile["scale"]), cam)
                    if (zj <= NEAR).any():
                        continue
                    samples.append((cj, sj[3], sj[4], GOLD_GLOW * sj[5] + ICE_WHITE * sj[6]))
            if samples:
                self._composite_tile(img, glowf, cov, samples, tile["tex"], opq)

        # 光帶掠過玻璃磚面的反光
        if glare_q is not None:
            gl = cv2.resize(glare_q, (W, H), interpolation=cv2.INTER_LINEAR)[..., None] * cov
            sp = cv2.resize(spec_q, (W, H), interpolation=cv2.INTER_LINEAR)[..., None] * cov
            img += gl * (GOLD_GLOW * 0.10) + sp * (GOLD_GLOW * 0.38 + WARM * 0.22)
            extra = sp * (GOLD_GLOW * 0.3) + gl * (GOLD_GLOW * 0.06)
            bloom_extra = extra if bloom_extra is None else bloom_extra + extra

        # 落定星芒
        for tile in self.tiles:
            if not tile["has_a"] or tile["kind"] == KIND_GHOST:
                continue
            g = glint_env(t - tile["t_arr"])
            if g > 0.02:
                st = self.tile_state(tile, t)
                if st is not None:
                    cw = self.corners(st[0], st[1], st[2], tile["scale"])
                    cp_, cz_ = self.project(cw[1:2], cam)
                    if cz_[0] > NEAR:
                        size = float(np.clip(self.F * 0.22 / cz_[0], 10 * S, 60 * S))
                        self._star(glow8, cp_[0], size, g, GOLD_GLOW)

        # 光暈（bloom）
        g = glow8.astype(np.float32) / 255.0 + glowf
        img += g
        if bloom_extra is not None:
            g = g + bloom_extra
        small = cv2.resize(g, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        tiny = cv2.resize(small, (W // 16, H // 16), interpolation=cv2.INTER_AREA)
        b1 = cv2.GaussianBlur(small, (0, 0), 2.0 * S)
        b2 = cv2.GaussianBlur(small, (0, 0), 6.5 * S)
        b3 = cv2.GaussianBlur(tiny, (0, 0), 5.0 * S)
        bloom = cv2.resize(b1, (W, H)) * 0.9 + cv2.resize(b2, (W, H)) * 0.8 + cv2.resize(b3, (W, H)) * 0.9
        img += bloom

        # 標題區暗化
        sk = 0.32 * float(smoothstep(6.9, 7.8, t)) + 0.15 * float(smoothstep(8.3, 9.2, t))
        if sk > 0:
            img *= 1 - self.scrim * sk
        return img

    # ---- 文字（色調映射之後疊加，維持純白與香檳金） -------------------------------

    def _blit(self, out, mask, color, cx, y, alpha):
        if alpha <= 0.002 or mask is None:
            return
        h, w = mask.shape
        x0 = int(round(cx - w / 2))
        y0 = int(round(y))
        X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(self.W, x0 + w), min(self.H, y0 + h)
        if X1 <= X0 or Y1 <= Y0:
            return
        m = mask[Y0 - y0 : Y1 - y0, X0 - x0 : X1 - x0][..., None] * alpha
        region = out[Y0:Y1, X0:X1]
        out[Y0:Y1, X0:X1] = region * (1 - m) + color * m

    def _count_masks(self, n: int):
        if n not in self.count_cache:
            num = text_mask(f"{n}{'+' if self.count_plus else ''}", 46 * self.S, 650, 0.02)
            unit = self.t_unit
            gap = int(10 * self.S)
            h = max(num.shape[0], unit.shape[0])
            w = num.shape[1] + gap + unit.shape[1]
            a = np.zeros((h, w), np.float32)
            b = np.zeros((h, w), np.float32)
            a[h - num.shape[0] :, : num.shape[1]] = num
            b[h - unit.shape[0] :, num.shape[1] + gap :] = unit  # 底線對齊
            self.count_cache[n] = (a, b)
        return self.count_cache[n]

    def overlay(self, out, t):
        S = self.S
        cx = self.W / 2
        mv = float(ease("io", (t - 8.25) / 0.9))

        def ypos(name):
            return self.y_mid.get(name, self.y_fin[name]) * (1 - mv) + self.y_fin[name] * mv

        a_title = float(ease("out", (t - 7.3) / 0.75))
        lift = (1 - a_title) * 18 * S
        self._blit(out, self.t_title, np.ones(3, np.float32), cx, ypos("title") + lift, a_title)

        a_count = float(ease("out", (t - 7.45) / 0.7))
        if a_count > 0:
            n = int(round(self.N * ease("out", (t - 7.35) / 0.95)))
            ga, wa = self._count_masks(n)
            yc = ypos("count") + (1 - a_count) * 14 * S + (self.count_h - ga.shape[0])
            self._blit(out, ga, GOLD * 1.04, cx, yc, a_count)
            self._blit(out, wa, ICE_WHITE, cx, yc, a_count)
        if self.t_note is not None:
            a_note = float(ease("out", (t - 7.75) / 0.7))
            self._blit(out, self.t_note, NOTE_COLOR, cx, ypos("note"), a_note * 0.85)

        a_logo = float(ease("out", (t - 8.45) / 0.8))
        self._blit(out, self.t_logo, np.ones(3, np.float32), cx, self.y_fin["logo"] + (1 - a_logo) * 16 * S, a_logo)
        a_prog = float(ease("out", (t - 8.62) / 0.75))
        self._blit(out, self.t_program, ICE_WHITE, cx, self.y_fin["program"] + (1 - a_prog) * 12 * S, a_prog * 0.92)
        a_line = float(ease("out", (t - 8.85) / 0.6))
        if a_line > 0:
            lw = int(self.line_w * a_line)
            if lw > 1:
                self._blit(out, np.ones((self.line_h, lw), np.float32), GOLD, cx, self.y_fin["line"], a_line)
        return out

    def frame(self, t: float) -> np.ndarray:
        img = tonemap(self.render(t)) * self.vignette
        img = self.overlay(img, t)
        if t < 0.3:  # 開場 0.3 秒由深藍淡入
            img *= 0.15 + 0.85 * float(smoothstep(0.0, 0.3, t + 0.02))
        rng = np.random.default_rng(int(t * FPS) + 7)
        img = img + rng.uniform(-0.5, 0.5, img.shape).astype(np.float32) / 255.0
        return np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# 多行程渲染
# ---------------------------------------------------------------------------

_SCENE: LogoWall | None = None


def load_companies(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    for c in data:
        disp = str(c.get("display") or c.get("name") or "").strip()
        if disp:
            out.append(dict(name=str(c.get("name") or disp), display=disp, count=int(c.get("count") or 1)))
    if not out:
        sys.exit(f"企業名單是空的：{path}")
    return out


def _init(companies_path, w, h, font, logo_dir, note, title=TITLE, program=PROGRAM, count_plus=False):
    global _SCENE, _FONT_PATH
    _FONT_PATH = font
    load_font.cache_clear()
    _SCENE = LogoWall(
        load_companies(Path(companies_path)), w, h, Path(logo_dir) if logo_dir else None, note, title, program, count_plus
    )


def _render_index(i: int) -> bytes:
    assert _SCENE is not None
    return _SCENE.frame(i / FPS).tobytes()


def _render_time(t: float) -> np.ndarray:
    assert _SCENE is not None
    return _SCENE.frame(t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--companies", type=Path, default=COMPANIES_JSON, help="企業名單 JSON（預設 scripts/data/alumni-companies.json）")
    ap.add_argument("--extract", metavar="DATA_JS", help="由班級網站 data.js（網址或檔案）重新產生 --companies 指定的 JSON 後結束")
    ap.add_argument("--logos", type=Path, default=LOGO_DIR, help="官方 logo 覆寫資料夾（預設 scripts/logos）")
    ap.add_argument("--note", default=NOTE, help="標題下方的資料說明小字（空字串則不顯示）")
    ap.add_argument("--title", default=TITLE, help=f"標題（預設「{TITLE}」）")
    ap.add_argument("--program", default=PROGRAM, help=f"收尾的班別名稱（預設「{PROGRAM}」）")
    ap.add_argument("--count-plus", action="store_true", help="家數後加「+」：僅在確認實際任職企業多於名單時使用")
    ap.add_argument("--width", type=int, help="寬（正式輸出預設 1920，預覽預設 960）")
    ap.add_argument("--height", type=int, help="高（正式輸出預設 1080，預覽預設 540）")
    ap.add_argument("--out", type=Path, default=OUT_VIDEO, help="輸出 MP4 路徑")
    ap.add_argument("--poster", type=Path, default=OUT_POSTER, help="輸出封面 JPG（空字串則不輸出）")
    ap.add_argument("--poster-time", type=float, default=9.8)
    ap.add_argument("--crf", type=int, default=23)
    ap.add_argument("--font", help="中文字型路徑（預設 Noto Sans TC）")
    # 每個行程約佔 300–400 MB；預設最多 4 個以免記憶體不足
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 4) - 2)))
    ap.add_argument("--preview", nargs="?", const=PREVIEW_TIMES, help="只輸出指定秒數的靜態格與縮圖總表，例如 0.5,4,9.8")
    ap.add_argument("--preview-dir", type=Path, default=Path("video-preview"))
    args = ap.parse_args()

    if args.extract:
        js = read_source(args.extract)
        companies, stats = extract_companies(js)
        args.companies.parent.mkdir(parents=True, exist_ok=True)
        tmp = args.companies.with_suffix(".partial.json")
        tmp.write_text(json.dumps(companies, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, args.companies)
        print(
            f"屆別 {stats['cohorts']}，成員 {stats['members']} 筆；排除前服務單位 {stats['skipped_former']}、"
            f"非任職 {stats['skipped_not_employed']}、空白 {stats['skipped_empty']}"
        )
        print(f"共 {len(companies)} 家企業 → {args.companies}")
        return

    if not args.companies.exists():
        sys.exit(f"找不到企業名單：{args.companies}（可先用 --extract 產生）")
    if not NTUST_LOGO_WHITE.exists():
        sys.exit(f"找不到素材：{NTUST_LOGO_WHITE}")
    preview = bool(args.preview)
    w = args.width or (960 if preview else 1920)
    h = args.height or (540 if preview else 1080)
    init = (
        str(args.companies), w, h, args.font, str(args.logos) if args.logos else None,
        args.note, args.title, args.program, args.count_plus,
    )
    # 先在主行程建立一次場景：字型或素材缺漏時立即報錯
    _init(*init)
    assert _SCENE is not None
    print(f"{_SCENE.N} 家企業（官方 logo 覆寫 {_SCENE.override_count} 家）；弧面牆 {_SCENE.rows_a}×{_SCENE.cols_a}，"
          f"馬賽克 {_SCENE.rows_b}×{_SCENE.cols_b}（中央留空 {_SCENE.hole[1]}×{_SCENE.hole[0]}）")

    if preview:
        times = [float(x) for x in args.preview.split(",")]
        args.preview_dir.mkdir(parents=True, exist_ok=True)
        with Pool(max(1, min(args.workers, len(times))), _init, init) as pool:
            frames = pool.map(_render_time, times)
        thumbs = []
        for t, f in zip(times, frames):
            write_image(args.preview_dir / f"logowall_{t:05.2f}.png", f)
            th = cv2.resize(f, (480, 270), interpolation=cv2.INTER_AREA)
            cv2.putText(th, f"{t:.2f}s", (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
            thumbs.append(th)
        cols = 4 if len(thumbs) > 6 else 3
        while len(thumbs) % cols:
            thumbs.append(np.zeros_like(thumbs[0]))
        sheet = np.vstack([np.hstack(thumbs[i : i + cols]) for i in range(0, len(thumbs), cols)])
        write_image(args.preview_dir / "logowall_sheet.jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 90])
        print(f"preview → {args.preview_dir.resolve()}")
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("找不到 ffmpeg，請先安裝並加入 PATH。")
    out = args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    # 先輸出暫存檔，成功後才替換，避免渲染失敗時覆蓋既有影片
    tmp = out.with_name(out.stem + ".partial" + out.suffix)
    n = int(round(DURATION * FPS))
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf), "-pix_fmt", "yuv420p",
        "-profile:v", "high", "-movflags", "+faststart", "-an", str(tmp),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        with Pool(args.workers, _init, init) as pool:
            for i, buf in enumerate(pool.imap(_render_index, range(n), chunksize=2)):
                proc.stdin.write(buf)
                if i % FPS == 0:
                    print(f"  {i / FPS:4.1f}s / {DURATION:.0f}s", flush=True)
        proc.stdin.close()
        if proc.wait() != 0:
            raise RuntimeError("ffmpeg 編碼失敗")
    except BaseException:
        proc.kill()
        proc.wait()
        tmp.unlink(missing_ok=True)
        print(f"渲染失敗，保留原有檔案：{out}", file=sys.stderr)
        raise
    os.replace(tmp, out)
    print(f"video → {out}  ({out.stat().st_size / 1e6:.1f} MB)")

    if args.poster and str(args.poster):
        poster = args.poster
        poster.parent.mkdir(parents=True, exist_ok=True)
        ptmp = poster.with_name(poster.stem + ".partial" + poster.suffix)
        write_image(ptmp, _render_time(args.poster_time), [cv2.IMWRITE_JPEG_QUALITY, 86])
        os.replace(ptmp, poster)
        print(f"poster → {poster}")


if __name__ == "__main__":
    main()
