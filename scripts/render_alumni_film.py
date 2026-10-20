#!/usr/bin/env python3
"""
EMRD 校友形象片（第二款，15 秒）——「校友與同儕的連結」

以業主提供的 8 張活動照片（reference_形象素材/）為素材，在 3D 空間中以程式排版、運鏡與合成；
故事由「一個人的片刻」走向「一張彼此相連的網絡」。

四幕分鏡：
  0–3 秒   同窗：緩慢推進一張戶外合照（Ken Burns，結尾完整包含最左、最右的人），色調由暖色轉為
           臺科大藍分離色調，天空以漸層減光壓暗並偏海軍藍；一道香檳金光痕（固定色 alpha-over、
           尾端漸細、柔和光頭）沿樹梢線、緊貼人群高舉的手上方游移
  3–8 秒   連結：鏡頭在 3D 中拉遠，這張照片成為漂浮相片卡之一；光痕離開照片、落在 M06 卡緣使其閃光，
           金色連線逐一「點亮」其他活動照片（藍色單色調 → 全彩），形成同儕網絡，光點沿線流動；
           活動標籤只在完整進入 5% 字幕安全框後才淡入
  8–12 秒  匯聚：相片卡沿各自扇區（錯開起飛、弧線飛行，互不遮蓋）匯聚成環繞光核的星座，
           光核凝聚為臺科大校徽，浮現「一屆同窗，一生夥伴」與「ONE COHORT · PARTNERS FOR LIFE」
  12–15 秒 品牌：光芒擴散為白底片尾卡（版面與 emrd-brand-15s.mp4 一致）：臺科大直式標準字、
           NTUST EMRD、香檳金細線、標語「研發之路，同行致遠」

照片（依檔名排序 M01–M08）與標籤：
  M01 戶外活動　M02 校友聚餐　M03 校友路跑　M04 臺科大 50 週年
  M05 課堂學習　M06 家庭日　　M07 EMRD 10 週年　M08 運動大會
畫面不出現任何個人姓名。照片統一裁切為 3:2，M05、M06 原圖較小，畫面上放大倍率控制在 1.3 倍以內。

沿用 render_hero_video.py 的工具（色票、緩動、tonemap、片尾卡排版、校徽遮罩、write_image），
僅以 import 方式取用，不修改該檔。

用法（於專案根目錄）：
  python -X utf8 scripts/render_alumni_film.py --workers 4
  python -X utf8 scripts/render_alumni_film.py --width 960 --height 540 \\
      --preview 0,1.5,2.9,4,4.55,6.3,7.2,8.8,9.8,11.6,13,14.5 --preview-dir <暫存資料夾>

輸出：media/videos/emrd-alumni-15s.mp4 與封面 media/videos/emrd-alumni-poster.jpg
      （網站未使用的成品，放在 public/ 之外，不隨網站部署）
需求：Python 3.10+、numpy、opencv-python、Pillow，以及 PATH 上的 ffmpeg。
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from multiprocessing import Pool
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.dont_write_bytecode = True  # 匯入 hero 模組時不在 scripts/ 產生 __pycache__
import render_hero_video as hero  # noqa: E402
from render_hero_video import (  # noqa: E402
    GOLD,
    GOLD_GLOW,
    GOLD_LIT,
    ICE,
    ICE_WHITE,
    NAVY_DEEP,
    NAVY_LIFT,
    NTUST_BLUE,
    STEEL,
    WARM_WHITE,
    ease,
    hex_bgr,
    rot_x,
    rot_y,
    rot_z,
    smoothstep,
    write_image,
)

ROOT = hero.ROOT
PHOTO_DIR = ROOT / "reference_形象素材"
# 網站未使用的影片成品：放在 public/ 之外，不會被部署或公開存取
VIDEO_DIR = ROOT / "media" / "videos"
OUT_VIDEO = VIDEO_DIR / "emrd-alumni-15s.mp4"
OUT_POSTER = VIDEO_DIR / "emrd-alumni-poster.jpg"

FPS = 30
DURATION = 15.0
FOCAL = 1800.0  # 1920 寬時的焦距（像素）；較長焦距讓卡片透視更內斂
NEAR = 0.05
CARD_W, CARD_H = 3.0, 2.0  # 相片卡 3:2（世界單位）

TAGLINE = "一屆同窗，一生夥伴"
TAGLINE_EN = "ONE COHORT  ·  PARTNERS FOR LIFE"
TAG_CY, TAG_GAP = 628, 22  # 中文標語中心 y、中英兩行間距（1080p 像素）
SLOGAN = "研發之路，同行致遠"
SUBLINE = "高階科技研發碩士在職專班　校友與同儕網絡"

CHAMPAGNE = hex_bgr("#DCC392")
PAPER = hex_bgr("#F3F6FB")


def untonemap(c: np.ndarray) -> np.ndarray:
    """hero tonemap（0.82 以上柔肩）的反函數：合成前先換算，經 tonemap 後恰好得到指定色。"""
    knee = 0.82
    c = np.minimum(np.asarray(c, np.float64), 0.995)
    over = -(1 - knee) * np.log(1 - np.maximum(c - knee, 0) / (1 - knee))
    return np.where(c > knee, knee + over, c).astype(np.float32)


TRACE_COL = untonemap(CHAMPAGNE)  # 光痕核心：#DCC392
TRACE_HEAD_COL = untonemap(hex_bgr("#F5E8CB"))  # 光頭：同色相的淺香檳


# ---------------------------------------------------------------------------
# 照片與版面設定
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Photo:
    label: str  # 卡片標籤（活動類型，須與照片內容相符）
    crop: tuple[float, float]  # 3:2 裁切中心（相對寬、高）
    net: tuple[float, float, float]  # 第 2 幕結束（t=8）時卡片中心的畫面座標與寬度（1920×1080 像素）
    tilt: tuple[float, float, float]  # 相對「正對鏡頭」的偏航、俯仰、滾轉（度）
    spin: tuple[float, float]  # 漂浮旋轉速度（度/秒：偏航、俯仰）
    sky: float = 0.0  # 天空漸層減光強度（0–1，僅 M01：壓暗陰天天空，讓金色光痕讀得出金色）
    delay: float = 0.0  # 第 3 幕匯聚的起飛延遲（秒）：外圈先就位、內圈後到，避免飛行途中互相遮蓋
    arc: tuple[float, float, float] = (0.0, 0.0, 0.0)  # 匯聚途中的弧線偏移（世界單位，sin(πw) 包絡），讓卡片各走各的扇區


# 第 2 幕版面（t=8 秒）：下排卡片與 M08 已內收，確保拉遠過程中卡片與標籤都在 5% 字幕安全框內
PHOTOS = [
    Photo("戶外活動", (0.50, 0.50), (820, 505, 380), (4, 0, 0), (1.1, 0.3), sky=1.0, delay=0.50),  # M01 草地跳躍合照
    Photo("校友聚餐", (0.50, 0.50), (345, 275, 300), (16, -5, -2), (-1.2, 0.8)),  # M02
    Photo("校友路跑", (0.50, 0.60), (1460, 205, 320), (-18, 6, 2), (1.0, -0.6), arc=(-0.6, 0.4, 0.0)),  # M03
    Photo("臺科大 50 週年", (0.50, 0.50), (385, 765, 330), (20, 5, 1.5), (-0.8, -0.5), delay=0.10),  # M04
    Photo("課堂學習", (0.50, 0.50), (1490, 800, 270), (-22, -4, -1), (1.1, 0.6), arc=(-0.5, -0.4, 0.0)),  # M05
    Photo("家庭日", (0.47, 0.50), (1245, 470, 250), (-10, -6, 1), (-0.9, 0.7), delay=0.40, arc=(0.2, 1.0, 0.0)),  # M06
    Photo("EMRD 10 週年", (0.50, 0.50), (990, 810, 360), (-12, 9, -2), (1.3, -0.4), delay=0.20),  # M07
    Photo("運動大會", (0.50, 0.50), (1610, 525, 380), (-26, -3, 2), (-1.0, 0.5), arc=(0.5, -0.6, 0.0)),  # M08
]

# M01 天空漸層減光（照片區域座標 y：y≥SKY_Y1 全強度，y≤SKY_Y0 不影響；約等於畫面上方 45%）
SKY_Y0, SKY_Y1 = -0.14, 0.30
SKY_GAIN = 0.74  # 天空亮度倍率（約 −0.5 EV）
SKY_TINT = np.array([1.06, 0.99, 0.91], np.float32)  # BGR：偏冷、偏海軍藍

# 光痕：沿 M01 照片中的樹梢線、緊貼人群高舉的手上方游移（卡片區域座標，x∈[-1.5,1.5]、y∈[-1,1]，y 向上），
# 背景是較暗的樹叢，金色才讀得出金色；離開照片後以弧線落在 M06 卡片左緣（觸發邊框閃光），不畫進照片內
TRACE_LOCAL = [(-1.42, -0.13), (-1.00, -0.17), (-0.55, -0.155), (-0.10, -0.185), (0.35, -0.165),
               (0.80, -0.20), (1.20, -0.175), (1.50, -0.14)]
TRACE_TARGET = 5
TRACE_LAND = (-CARD_W / 2, -0.08)  # 落點：目標卡左緣（卡片區域座標）
TRACE_T0 = 0.35  # 光痕出現時間
TRACE_SPEED = 680.0  # 光頭在畫面上的前進速度（1080p 像素/秒）
TRACE_PULL_SPEED = 260.0  # 第 2 幕拉遠期間的速度
TRACE_HOP_BOOST = 450.0  # 飛向 M06 途中的加速量（正弦包絡）
TRACE_LAND_SPEED = 120.0  # 落點前減速到的速度
TRACE_POW = 1.0  # 加速包絡的形狀
TRACE_W_PX = 3.0  # 核心線寬（1080p 像素）
TRACE_ALPHA = 0.85  # 核心不透明度（alpha-over，顏色固定為 #DCC392）
TRACE_GLOW_SIGMA, TRACE_GLOW = 10.0, 0.35  # 柔光（screen 混合）
TRACE_HEAD_SIGMA = 6.0  # 光頭：柔和的放射狀光暈（取代尖頭）
TRACE_TAIL_PX = 640.0  # 尾巴長度（1080p 像素，沿畫面弧長）
TRACE_TAPER = 0.30  # 尾端 30% 漸細、漸淡
TRACE_DRAIN = 0.55  # 抵達後尾巴流入卡片邊緣所需秒數

# 第 2 幕連線：（起點卡, 終點卡, 開始秒, 長度秒）；終點卡於連線抵達時點亮
EDGES = [
    (0, 1, 3.85, 0.95),
    (5, 2, 4.55, 0.95),  # 光痕抵達 M06 後才由它往外連
    (0, 3, 4.65, 0.90),
    (0, 6, 5.00, 0.90),
    (2, 7, 5.20, 0.90),
    (6, 4, 5.55, 0.85),
    (1, 3, 6.05, 0.75),
    (7, 4, 6.20, 0.80),
    (3, 6, 6.40, 0.75),
    (1, 5, 6.55, 0.70),
    (0, 7, 6.75, 0.85),
    (6, 7, 6.95, 0.75),
    (2, 0, 7.10, 0.70),
]

# 第 3 幕星座：橢圓環（以 t≥10.2 秒鏡頭的畫面像素定義）
RING_CENTER_PX = (960, 512)
RING_RX_PX, RING_RY_PX = 680, 345
RING_DROP_PX = 62  # 下半環額外下移（∝ sin²）：底部兩張卡與英文標語之間留出 ≥60 px 淨空
RING_BOWL = 1.3  # 兩側卡片向鏡頭前移，形成內凹弧面
CORE_PX = (960, 432)
T_RING = np.array([0.0, 0.0, -1.0])
D_RING = 16.4
CONVERGE_T0, CONVERGE_DUR = 7.95, 2.0

WIPE_T0, WIPE_DUR = 12.15, 0.85


# ---------------------------------------------------------------------------
# 插值與攝影機
# ---------------------------------------------------------------------------


class Track:
    """單調三次 Hermite（PCHIP）關鍵格插值：C1 連續、不過衝，在極值處速度自然歸零。"""

    def __init__(self, keys):
        self.x = np.array([k[0] for k in keys], np.float64)
        self.y = np.array([np.atleast_1d(np.asarray(k[1], np.float64)) for k in keys])
        h = np.diff(self.x)[:, None]
        d = np.diff(self.y, axis=0) / h
        m = np.zeros_like(self.y)
        if len(self.x) == 2:
            m[:] = d[0]
        else:
            for k in range(1, len(self.x) - 1):
                d0, d1 = d[k - 1], d[k]
                w1, w2 = 2 * h[k] + h[k - 1], h[k] + 2 * h[k - 1]
                with np.errstate(divide="ignore", invalid="ignore"):
                    hm = (w1 + w2) / (w1 / d0 + w2 / d1)
                m[k] = np.where(d0 * d1 > 0, hm, 0.0)
            m[0] = self._edge(h[0], h[1], d[0], d[1])
            m[-1] = self._edge(h[-1], h[-2], d[-1], d[-2])
        self.m, self.h = m, h

    @staticmethod
    def _edge(h0, h1, d0, d1):
        s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
        s = np.where(np.sign(s) != np.sign(d0), 0.0, s)
        return np.where((np.sign(d0) != np.sign(d1)) & (np.abs(s) > 3 * np.abs(d0)), 3 * d0, s)

    def __call__(self, t: float):
        x = self.x
        if t <= x[0]:
            v = self.y[0]
        elif t >= x[-1]:
            v = self.y[-1]
        else:
            i = int(np.searchsorted(x, t) - 1)
            h = x[i + 1] - x[i]
            u = (t - x[i]) / h
            h00, h10 = 2 * u**3 - 3 * u**2 + 1, u**3 - 2 * u**2 + u
            h01, h11 = -2 * u**3 + 3 * u**2, u**3 - u**2
            v = h00 * self.y[i] + h10 * h * self.m[i] + h01 * self.y[i + 1] + h11 * h * self.m[i + 1]
        return v if len(v) > 1 else float(v[0])


def look_basis(az: float, el: float, roll: float = 0.0):
    """方位角／仰角（弧度）→（向後方向, right, up, fwd）。"""
    back = np.array([math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)])
    fwd = -back
    right = np.cross(fwd, [0.0, 1.0, 0.0])
    right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    if roll:
        c, s = math.cos(roll), math.sin(roll)
        right, up = right * c + up * s, up * c - right * s
    return back, right, up, fwd


class Camera:
    """目標點、距離（對數）、方位、仰角、滾轉各自以 PCHIP 插值，推拉之間速度連續。"""

    AZ8, EL8 = -14.0, 6.0

    def __init__(self):
        d8 = 15.5
        back, right, up, fwd = look_basis(math.radians(self.AZ8), math.radians(self.EL8))
        # 反解 t=8 秒的目標點：讓 M01（世界原點）落在指定畫面位置與大小
        u0, v0, w0 = PHOTOS[0].net
        z0 = FOCAL * CARD_W / w0
        a, b = (u0 - 960) / FOCAL, (v0 - 540) / FOCAL
        t8 = (d8 - z0) * fwd - z0 * (a * right - b * up)
        # 第 1 幕：由 1.04 倍推進到約 1.27 倍（照片原始像素），結尾畫面完整包含最左與最右的跳躍者
        self.target = Track(
            [
                (0.0, (0.0, -0.10, 0.0)),
                (3.0, (-0.045, -0.24, 0.0)),
                (5.4, (t8 * 0.55 + np.array([0.0, -0.05, 0.0]))),
                (8.0, t8),
                (10.2, T_RING),
                (15.0, T_RING + [0.0, 0.04, 0.0]),
            ]
        )
        self.logd = Track(
            [(0.0, math.log(2.76)), (3.0, math.log(2.465)), (4.4, math.log(6.0)), (6.0, math.log(11.4)),
             (8.0, math.log(d8)), (10.2, math.log(D_RING)), (12.4, math.log(15.9)), (15.0, math.log(15.6))]
        )
        self.az = Track([(0.0, 0.0), (3.0, 0.0), (8.0, self.AZ8), (10.2, 0.0), (15.0, 1.5)])
        self.el = Track([(0.0, 0.0), (3.0, 0.0), (7.6, self.EL8), (10.2, 0.0), (15.0, 0.6)])
        self.roll = Track([(0.0, 0.0), (3.0, 0.0), (5.8, -1.4), (8.4, 0.0), (15.0, 0.0)])

    def at(self, t: float):
        T = np.asarray(self.target(t))
        d = math.exp(self.logd(t))
        back, right, up, fwd = look_basis(math.radians(self.az(t)), math.radians(self.el(t)), math.radians(self.roll(t)))
        return T + d * back, right, up, fwd


def unproject(cam, u: float, v: float, z: float) -> np.ndarray:
    """參考解析度（1920×1080、FOCAL）的畫面座標 + 深度 → 世界座標。"""
    pos, right, up, fwd = cam
    return pos + z * (fwd + (u - 960) / FOCAL * right - (v - 540) / FOCAL * up)


def bezier(A, C, B, n: int = 32) -> np.ndarray:
    s = np.linspace(0.0, 1.0, n)[:, None]
    return (1 - s) ** 2 * A + 2 * (1 - s) * s * C + s**2 * B


def sub_poly(P: np.ndarray, u0: float, u1: float) -> np.ndarray:
    """取折線（以樣本索引比例）u0–u1 的片段。"""
    n = len(P)
    u0, u1 = max(0.0, u0), min(1.0, u1)
    if u1 <= u0:
        return P[:0]
    f0, f1 = u0 * (n - 1), u1 * (n - 1)
    i0, i1 = int(math.floor(f0)), int(math.floor(f1))

    def at(f):
        i = min(int(f), n - 2)
        return P[i] + (P[i + 1] - P[i]) * (f - i)

    mid = P[i0 + 1 : i1 + 1]
    return np.vstack([at(f0)[None], mid, at(f1)[None]])


# ---------------------------------------------------------------------------
# 文字（Pillow）
# ---------------------------------------------------------------------------


def load_font(size_px: int, weight: int, serif: bool = False, font_path: str | None = None):
    windir = os.environ.get("WINDIR", "C:/Windows")
    cands = [font_path] if font_path and not serif else []
    if serif:
        cands += [f"{windir}/Fonts/NotoSerifTC-VF.ttf", "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"]
    cands += [
        f"{windir}/Fonts/NotoSansTC-VF.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        f"{windir}/Fonts/msjhbd.ttc" if weight >= 600 else f"{windir}/Fonts/msjh.ttc",
    ]
    for c in cands:
        if c and Path(c).exists():
            f = ImageFont.truetype(c, max(8, int(size_px)))
            try:
                f.set_variation_by_axes([weight])
            except Exception:
                pass
            return f
    sys.exit("找不到中文字型，請以 --font 指定 Noto Sans TC 或微軟正黑體路徑。")


def to_premul(img: Image.Image) -> np.ndarray:
    """Pillow RGBA → 預乘 BGRA float32。"""
    a = np.asarray(img).astype(np.float32) / 255.0
    bgr = a[..., 2::-1] * a[..., 3:4]
    return np.concatenate([bgr, a[..., 3:4]], axis=2)


def text_line(text: str, fnt, color, tracking: float, width: int):
    """置中的單行文字（含字距），回傳預乘 BGRA 與每欄所屬字元索引（逐字淡入用）。"""
    pad = int(fnt.size * 0.6)
    img = Image.new("RGBA", (width, fnt.size * 2 + pad), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    widths = [dr.textlength(ch, font=fnt) for ch in text]
    total = sum(widths) + tracking * fnt.size * (len(text) - 1)
    x = (width - total) / 2
    owner = np.full(width, -1, np.int32)
    for i, (ch, w) in enumerate(zip(text, widths)):
        dr.text((x, pad // 2), ch, font=fnt, fill=tuple(color) + (255,))
        owner[max(0, int(x - 2)) : min(width, int(x + w + 2))] = i
        x += w + tracking * fnt.size
    bbox = img.getbbox()
    if bbox:
        img = img.crop((0, bbox[1], width, bbox[3]))
    return to_premul(img), owner


def make_chip(label: str, S: float) -> np.ndarray:
    """活動標籤膠囊：深藍半透明底、香檳金細框與圓點、白字（2 倍超取樣後縮小以得平滑邊緣）。"""
    k = 2
    fnt = load_font(22 * S * k, 500)
    h = int(round(40 * S * k))
    pad_l, pad_r, dot = int(34 * S * k), int(16 * S * k), 4.2 * S * k
    tmp = ImageDraw.Draw(Image.new("RGBA", (8, 8)))
    tw = sum(tmp.textlength(ch, font=fnt) for ch in label) + 0.06 * fnt.size * (len(label) - 1)
    w = int(pad_l + tw + pad_r)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    lw = max(1, int(1.3 * S * k))
    dr.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=(10, 23, 51, 196), outline=(220, 195, 146, 170), width=lw)
    cy = h / 2
    dr.ellipse((17 * S * k - dot, cy - dot, 17 * S * k + dot, cy + dot), fill=(232, 205, 150, 255))
    x = pad_l
    asc, desc = fnt.getmetrics()
    ty = cy - (asc + desc) / 2 + desc * 0.15
    for ch in label:
        dr.text((x, ty), ch, font=fnt, fill=(243, 246, 251, 255))
        x += dr.textlength(ch, font=fnt) + 0.06 * fnt.size
    img = img.resize((max(1, w // k), max(1, h // k)), Image.LANCZOS)
    return to_premul(img)


def blit(img: np.ndarray, src: np.ndarray, x: int, y: int, alpha: float, col_alpha: np.ndarray | None = None):
    """把預乘 BGRA 疊到畫面（自動裁切邊界）。col_alpha：每欄額外透明度。"""
    if alpha <= 0:
        return
    H, W = img.shape[:2]
    h, w = src.shape[:2]
    X0, Y0, X1, Y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
    if X1 <= X0 or Y1 <= Y0:
        return
    s = src[Y0 - y : Y1 - y, X0 - x : X1 - x]
    a = np.full((1, X1 - X0, 1), alpha, np.float32)
    if col_alpha is not None:
        a = a * col_alpha[X0 - x : X1 - x][None, :, None]
    region = img[Y0:Y1, X0:X1]
    img[Y0:Y1, X0:X1] = region * (1 - s[..., 3:4] * a) + s[..., :3] * a


# ---------------------------------------------------------------------------
# 調色
# ---------------------------------------------------------------------------

_LUM = np.array([0.114, 0.587, 0.299], np.float32)
SH_TINT = np.array([1.34, 1.04, 0.74], np.float32)  # 暗部推向臺科大藍
HI_TINT = np.array([0.84, 0.97, 1.09], np.float32)  # 亮部帶香檳暖色
DUO = [(0.0, hex_bgr("#06122B")), (0.55, hex_bgr("#1C5BA6")), (1.0, hex_bgr("#E4EDF9"))]


def grade(col: np.ndarray, shadow: float, high: float, duo: float, bright: float, warm: float = 0.0) -> np.ndarray:
    lum = col @ _LUM
    ws = (1 - smoothstep(0.0, 0.62, lum)).astype(np.float32)[..., None]
    wh = smoothstep(0.38, 1.0, lum).astype(np.float32)[..., None]
    out = col * (1 + shadow * ws * (SH_TINT - 1) + high * wh * (HI_TINT - 1))
    if warm > 0:
        out = out * (1 + warm * (np.array([0.80, 0.97, 1.12], np.float32) - 1))
    elif warm < 0:  # 負值：冷調（偏臺科大藍）
        out = out * (1 - warm * (np.array([1.10, 1.01, 0.90], np.float32) - 1))
    if duo > 0:
        l = lum[..., None]
        (x0, c0), (x1, c1), (x2, c2) = DUO
        lo = c0 + (c1 - c0) * np.clip(l / x1, 0, 1)
        d = np.where(l < x1, lo, c1 + (c2 - c1) * np.clip((l - x1) / (x2 - x1), 0, 1))
        out = out * (1 - duo) + d * duo
    return out * bright


# ---------------------------------------------------------------------------
# 相片卡
# ---------------------------------------------------------------------------


def read_image(path: Path) -> np.ndarray:
    img = cv2.imdecode(np.fromfile(str(path), np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        sys.exit(f"無法讀取照片：{path}")
    return img


def crop_3x2(img: np.ndarray, cx: float, cy: float) -> np.ndarray:
    h, w = img.shape[:2]
    if w / h > 1.5:
        cw, ch = round(h * 1.5), h
    else:
        cw, ch = w, round(w / 1.5)
    x0 = int(np.clip(round(cx * w - cw / 2), 0, w - cw))
    y0 = int(np.clip(round(cy * h - ch / 2), 0, h - ch))
    return img[y0 : y0 + ch, x0 : x0 + cw]


def sky_grade(img: np.ndarray, strength: float) -> np.ndarray:
    """天空漸層減光（像鏡頭前的漸層 ND 鏡）：上方壓暗約 0.5 EV 並偏冷、偏海軍藍，於樹梢線柔和過渡。"""
    h = img.shape[0]
    y = 1.0 - 2.0 * (np.arange(h, dtype=np.float32) + 0.5) / h  # 照片區域座標（向上為正）
    k = (smoothstep(SKY_Y0, SKY_Y1, y) * strength).astype(np.float32)[:, None, None]
    col = img.astype(np.float32) / 255.0
    col = col * (1 - k * (1 - SKY_GAIN)) * (1 + k * (SKY_TINT - 1))
    return np.clip(col * 255.0 + 0.5, 0, 255).astype(np.uint8)


class Card:
    """相片卡：預乘 BGRA 材質（含圓角與透明邊）＋ mipmap，以透視變換貼到畫面四邊形。"""

    def __init__(self, idx: int, spec: Photo, photo: np.ndarray, S: float):
        self.idx, self.spec = idx, spec
        img = crop_3x2(photo, *spec.crop)
        if spec.sky > 0:
            img = sky_grade(img, spec.sky)
        h, w = img.shape[:2]
        pad = max(6, int(0.01 * w))
        ss = 4  # 圓角遮罩超取樣
        r = int(0.022 * w)
        big = np.zeros(((h + 2 * pad) * ss, (w + 2 * pad) * ss), np.uint8)
        x0, y0, x1, y1 = pad * ss, pad * ss, (pad + w) * ss - 1, (pad + h) * ss - 1
        R = r * ss
        cv2.rectangle(big, (x0 + R, y0), (x1 - R, y1), 255, -1)
        cv2.rectangle(big, (x0, y0 + R), (x1, y1 - R), 255, -1)
        for cx, cy in ((x0 + R, y0 + R), (x1 - R, y0 + R), (x0 + R, y1 - R), (x1 - R, y1 - R)):
            cv2.circle(big, (cx, cy), R, 255, -1, cv2.LINE_AA)
        mask = cv2.resize(big, (w + 2 * pad, h + 2 * pad), interpolation=cv2.INTER_AREA)
        del big
        rgba = np.zeros((h + 2 * pad, w + 2 * pad, 4), np.uint8)
        rgba[pad : pad + h, pad : pad + w, :3] = img
        a = mask.astype(np.float32) / 255.0
        rgba[..., :3] = np.round(rgba[..., :3] * a[..., None]).astype(np.uint8)
        rgba[..., 3] = mask
        self.mips = [rgba]
        while self.mips[-1].shape[1] > 120:
            prev = self.mips[-1]
            self.mips.append(cv2.resize(prev, (prev.shape[1] // 2, prev.shape[0] // 2), interpolation=cv2.INTER_AREA))
        self.pw, self.ph, self.pad = w, h, pad
        self.chip = make_chip(spec.label, S)
        self.t_on = -1.0  # 點亮時間（M01 一開始就是全彩）


# ---------------------------------------------------------------------------
# 場景
# ---------------------------------------------------------------------------


class Scene:
    def __init__(self, width: int, height: int, font_path: str | None):
        self.W, self.H = width, height
        self.S = width / 1920
        self.F = FOCAL * self.S
        self.cx, self.cy = width / 2, height / 2
        self.cam = Camera()
        rng = np.random.default_rng(20251021)

        photos = sorted(PHOTO_DIR.glob("*.jpg"))
        if len(photos) < len(PHOTOS):
            sys.exit(f"{PHOTO_DIR} 需要 {len(PHOTOS)} 張 JPG，目前只有 {len(photos)} 張。")
        self.cards = [Card(i, spec, read_image(p), self.S) for i, (spec, p) in enumerate(zip(PHOTOS, photos))]

        self._layout_network()
        self._layout_ring()
        self._build_edges()
        self._build_stars(rng)
        self._build_background()
        self._build_text(font_path)
        sym = cv2.imread(str(hero.SYMBOL_PATH), cv2.IMREAD_UNCHANGED)
        self.emblem = sym[..., 3].astype(np.float32) / 255.0

        self.q = 4
        qh, qw = height // self.q, width // self.q
        ys, xs = np.mgrid[0:qh, 0:qw].astype(np.float32)
        self.qx, self.qy = (xs + 0.5) * self.q, (ys + 0.5) * self.q
        self.k3 = np.ones((3, 3), np.uint8)

    # ---- 版面 ---------------------------------------------------------------

    def _layout_network(self):
        cam8 = self.cam.at(8.0)
        for c in self.cards:
            u, v, w = c.spec.net
            z = FOCAL * CARD_W / w
            c.net_pos = np.zeros(3) if c.idx == 0 else unproject(cam8, u, v, z)
            dyaw, dpitch, droll = c.spec.tilt
            # 世界尤拉角：偏航 = 方位角 → 卡片法向量朝向 t=8 秒的鏡頭
            c.net_rot8 = np.radians([Camera.AZ8 + dyaw, -Camera.EL8 + dpitch, droll])
            c.bob = (0.06 if c.idx else 0.035, 0.55 + 0.11 * c.idx, 1.7 * c.idx)

    def _layout_ring(self):
        """依第 2 幕結束時各卡的畫面方位角，指派到橢圓環的槽位（避免飛行路徑交錯）。"""
        cam8 = self.cam.at(8.0)
        pts, _ = self.project(np.array([c.net_pos for c in self.cards]), cam8, ref=True)
        cxr, cyr = 960.0, 540.0
        ang = np.arctan2(-(pts[:, 1] - cyr), pts[:, 0] - cxr)
        slots = np.radians(22.5 + 45.0 * np.arange(8))
        order = np.argsort(ang)
        best = None
        for shift in range(8):
            cost = 0.0
            for k, ci in enumerate(order):
                sa = slots[(k + shift) % 8]
                cost += abs((ang[ci] - sa + math.pi) % (2 * math.pi) - math.pi)
            if best is None or cost < best[0]:
                best = (cost, shift)
        for k, ci in enumerate(order):
            self.cards[ci].slot = slots[(k + best[1]) % 8]
        px = D_RING / FOCAL
        self.ring_center = T_RING + np.array([(RING_CENTER_PX[0] - 960) * px, -(RING_CENTER_PX[1] - 540) * px, 0.0])
        self.core = T_RING + np.array([(CORE_PX[0] - 960) * px, -(CORE_PX[1] - 540) * px, 0.0])
        self.rx, self.ry = RING_RX_PX * px, RING_RY_PX * px
        self.drop = RING_DROP_PX * px

    def _ring_pose(self, c: Card, t: float):
        th = c.slot + 0.03 * (t - 10.0)
        x, y = math.cos(th), math.sin(th)
        p = self.ring_center + np.array([self.rx * x, self.ry * y - self.drop * max(0.0, -y) ** 2, RING_BOWL * x * x])
        rot = np.radians([-16.0 * x, 9.0 * y, 0.0])
        return p, rot

    def _net_pose(self, c: Card, t: float):
        amp, fr, ph = c.bob
        bob = amp * math.sin(fr * t + ph)
        if c.idx == 0:
            bob *= float(smoothstep(3.0, 5.0, t))
            k = float(ease("io", (t - 3.0) / 5.4))
            rot = c.net_rot8 * k + np.radians([c.spec.spin[0], c.spec.spin[1], 0]) * max(0.0, t - 8.4)
        else:
            rot = c.net_rot8 + np.radians([c.spec.spin[0], c.spec.spin[1], 0]) * (t - 8.0)
        return c.net_pos + np.array([0.0, bob, 0.0]), rot

    def pose(self, c: Card, t: float):
        p, r = self._net_pose(c, t)
        d = c.spec.delay
        w = float(ease("io", (t - CONVERGE_T0 - d) / (CONVERGE_DUR - 0.4 * d)))
        if w > 0:
            p2, r2 = self._ring_pose(c, t)
            p, r = p + (p2 - p) * w + np.asarray(c.spec.arc) * math.sin(math.pi * w), r + (r2 - r) * w
        R = rot_y(r[0]) @ rot_x(r[1]) @ rot_z(r[2])
        return p, R

    @staticmethod
    def corners(p, R):
        loc = np.array([[-CARD_W / 2, CARD_H / 2, 0], [CARD_W / 2, CARD_H / 2, 0], [CARD_W / 2, -CARD_H / 2, 0], [-CARD_W / 2, -CARD_H / 2, 0]])
        return p + loc @ R.T

    def _build_edges(self):
        self._build_trace()
        for c in self.cards[1:]:
            c.t_on = 1e9
        rng = np.random.default_rng(7)
        self.edges = []
        for k, (a, b, t0, dur) in enumerate(EDGES):
            self.cards[b].t_on = min(self.cards[b].t_on, t0 + 0.82 * dur)
            self.edges.append(dict(a=a, b=b, t0=t0, dur=dur, bend=0.16 * (1 if k % 2 else -1), ph=rng.uniform(0, 1, 2)))
        for c in self.cards:
            if c.t_on > 1e8:
                c.t_on = 7.0
        self.cards[TRACE_TARGET].t_on = self.trace_land - 0.05  # 光頭落在卡緣時邊框閃光

    def _build_trace(self):
        """光痕路徑與時間表。光頭沿「當下畫面上的路徑弧長」等速推進（而非沿取樣點等速）：
        照片表面與照片外的連線段取樣密度不同、鏡頭又在 3 秒後快速拉遠，以畫面弧長積分才能讓速度一致；
        離開照片後依 TRACE_POW 曲線柔和減速，落在 M06 卡緣（落點時間 self.trace_land 由積分求得）。"""
        P = np.array(TRACE_LOCAL, np.float64)
        P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
        out = []
        for i in range(1, len(P) - 2):  # Catmull-Rom 取樣（照片區域座標）
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            for s in np.linspace(0, 1, 16, endpoint=False):
                out.append(0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s * s + (-p0 + 3 * p1 - 3 * p2 + p3) * s**3))
        out.append(P[-2])
        self.trace_local = np.array(out)
        self.n_on, self.n_off = len(self.trace_local), 48
        n = self.n_on + self.n_off - 1
        dt = 1.0 / 60
        t, h = TRACE_T0, 0.0
        keys = [(t, h)]
        while h < n - 1 and t < 7.0:
            t += dt
            cam = self.cam.at(t)
            pose = {0: self.pose(self.cards[0], t), TRACE_TARGET: self.pose(self.cards[TRACE_TARGET], t)}
            pts, _ = self.project(self._trace_path(pose), cam, ref=True)
            v = TRACE_SPEED * (0.7 + 0.3 * float(smoothstep(TRACE_T0, TRACE_T0 + 0.8, t)))
            v += (TRACE_PULL_SPEED - TRACE_SPEED) * float(smoothstep(2.9, 3.7, t))  # 鏡頭拉遠、畫面縮小時一併放慢
            u_hop = (h - (self.n_on - 1)) / (self.n_off - 1)
            if u_hop > 0:
                # 速度連續：由拉遠期間的速度起步，中段加速，落點前減速到 TRACE_LAND_SPEED
                v = v + (TRACE_LAND_SPEED - v) * u_hop + TRACE_HOP_BOOST * math.sin(math.pi * u_hop) ** TRACE_POW
            arc = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])
            a0 = float(np.interp(h, np.arange(n), arc))
            h = float(np.interp(min(a0 + v * dt, arc[-1]), arc, np.arange(n)))
            if a0 + v * dt >= arc[-1]:
                h = n - 1.0
            keys.append((t, h))
        self.trace_land = t  # 光頭抵達 M06 卡緣的時間
        self.trace_head = Track(keys)

    def _build_stars(self, rng):
        n = 230
        p = np.column_stack([rng.uniform(-30, 30, n), rng.uniform(-17, 17, n), rng.uniform(-42, -9, n)])
        self.star_p = p
        self.star_tw = rng.uniform(0, 2 * math.pi, n)
        self.star_gold = rng.uniform(0, 1, n) < 0.3
        self.star_size = rng.uniform(0.6, 1.4, n)
        self.star_start = rng.uniform(8.3, 9.9, n)
        self.star_dur = rng.uniform(1.1, 1.7, n)
        self.star_swirl = rng.uniform(0.8, 1.8, n) * rng.choice([-1, 1], n)
        pairs = set()
        for i in range(n):
            d = np.linalg.norm(p - p[i], axis=1)
            for j in np.argsort(d)[1:3]:
                if d[j] < 8.5:
                    pairs.add((min(i, j), max(i, j)))
        self.star_pairs = np.array(sorted(pairs))

    def _build_background(self):
        H, W = self.H, self.W
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xs - W * 0.5) / W) ** 2 + ((ys - H * 0.42) / H) ** 2)
        k = smoothstep(0.0, 0.85, d).astype(np.float32)[..., None]
        self.bg = (NAVY_LIFT * 0.62 * (1 - k) + NAVY_DEEP * k).astype(np.float32)
        r = np.sqrt(((xs - W / 2) / (W / 2)) ** 2 + ((ys - H / 2) / (H / 2)) ** 2)
        self.vignette = (1 - 0.30 * smoothstep(0.55, 1.45, r)).astype(np.float32)[..., None]

    def _build_text(self, font_path):
        W, H, S = self.W, self.H, self.S
        self.tag, self.tag_owner = text_line(TAGLINE, load_font(62 * S, 600, serif=True), (243, 246, 251), 0.16, W)
        # 英文副標：較前版放大約 15%（18 → 21 px），縮小嵌入網頁時仍清楚
        self.tag_en, _ = text_line(TAGLINE_EN, load_font(21 * S, 500, font_path=font_path), (220, 195, 146), 0.28, W)
        th, eh = self.tag.shape[0], self.tag_en.shape[0]
        self.tag_y = int(round(TAG_CY * S - th / 2))
        self.en_y = int(round(self.tag_y + th + TAG_GAP * S))
        cols = np.nonzero((self.tag[..., 3].max(0) > 0.02) | (self.tag_en[..., 3].max(0) > 0.02))[0]
        bx0, bx1 = float(cols.min()), float(cols.max())
        by0, by1 = float(self.tag_y), float(self.en_y + eh)
        self.text_box = (bx0, by0, bx1, by1)
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)

        def soft_box(x0, y0, x1, y1, fx, fy_top, fy_bot):
            dx = np.maximum(np.maximum(x0 - xs, xs - x1), 0) / fx
            dy = np.maximum(y0 - ys, 0) / fy_top + np.maximum(ys - y1, 0) / fy_bot
            return (1 - smoothstep(0.0, 1.0, np.hypot(dx, dy))).astype(np.float32)[..., None]

        # 連線淡出區：文字外擴 36 px（下緣延伸至英文標語下方 20 px），輻射線與光點在此邊緣停止
        self.text_mask = soft_box(bx0 - 36 * S, by0 - 16 * S, bx1 + 36 * S, by1 + 20 * S, 40 * S, 30 * S, 16 * S)
        # 整體暗幕：壓住光核餘暉與星點，提高標語對比；下緣在英文標語下方 20 px 內收完，不壓到底部卡片
        self.scrim = soft_box(bx0 - 10 * S, by0 - 6 * S, bx1 + 10 * S, by1 - 4 * S, 110 * S, 50 * S, 24 * S)
        # 片尾卡：直接沿用 hero 的排版函式，僅替換標語與副標，確保與 emrd-brand-15s.mp4 一致
        shim = SimpleNamespace(W=self.W, H=self.H, S=self.S)
        saved = hero.SLOGAN, hero.SUBLINE
        hero.SLOGAN, hero.SUBLINE = SLOGAN, SUBLINE
        try:
            self.brand = hero.Scene._build_brand(shim, font_path)
        finally:
            hero.SLOGAN, hero.SUBLINE = saved

    # ---- 投影與繪製 -----------------------------------------------------------

    def project(self, P, cam, ref: bool = False):
        pos, right, up, fwd = cam
        v = np.asarray(P, np.float64) - pos
        x, y, z = v @ right, v @ up, v @ fwd
        zz = np.where(z > NEAR, z, NEAR)
        if ref:
            return np.stack([960 + FOCAL * x / zz, 540 - FOCAL * y / zz], -1), z
        return np.stack([self.cx + self.F * x / zz, self.cy - self.F * y / zz], -1), z

    @staticmethod
    def _px(pts):
        return np.round(np.clip(pts, -3e4, 3e4) * 16).astype(np.int32)

    @staticmethod
    def c255(bgr, k=1.0):
        return tuple(float(x) for x in np.clip(np.asarray(bgr) * 255 * k, 0, 255))

    def poly(self, img, P, cam, color, thickness=1):
        if len(P) < 2:
            return
        pts, z = self.project(P, cam)
        ok = np.append(z > NEAR, False)
        start = None
        for i, good in enumerate(ok):
            if good and start is None:
                start = i
            elif not good and start is not None:
                if i - start >= 2:
                    cv2.polylines(img, [self._px(pts[start:i])], False, color, thickness, cv2.LINE_AA, 4)
                start = None

    def dot(self, img, P, cam, r_px, color):
        pts, z = self.project(np.array([P]), cam)
        if z[0] > NEAR:
            cv2.circle(img, tuple(self._px(pts[0])), int(round(r_px * 16)), color, -1, cv2.LINE_AA, 4)

    def comet(self, img, P, u, length, cam, color, head_color, thick):
        """沿折線移動的光點：漸層尾巴＋亮頭。"""
        steps = 5
        for s in range(steps):
            a0 = u - length * (s + 1) / steps
            a1 = u - length * s / steps
            seg = sub_poly(P, a0, a1)
            k = 1 - s / steps
            self.poly(img, seg, cam, self.c255(color, k * k), thick)
        if 0 <= u <= 1:
            n = len(P)
            f = u * (n - 1)
            i = min(int(f), n - 2)
            self.dot(img, P[i] + (P[i + 1] - P[i]) * (f - i), cam, 2.3 * self.S, self.c255(head_color))

    def bloom(self, g):
        W, H, S = self.W, self.H, self.S
        small = cv2.resize(g, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        tiny = cv2.resize(small, (W // 16, H // 16), interpolation=cv2.INTER_AREA)
        b1 = cv2.GaussianBlur(small, (0, 0), 2.2 * S)
        b2 = cv2.GaussianBlur(small, (0, 0), 7.0 * S)
        b3 = cv2.GaussianBlur(tiny, (0, 0), 6.0 * S)
        return cv2.resize(b1, (W, H)) + cv2.resize(b2, (W, H)) * 0.85 + cv2.resize(b3, (W, H))

    # ---- 卡片 ---------------------------------------------------------------

    def card_look(self, c: Card, t: float):
        """回傳（暗部藍, 亮部暖, 單色調, 亮度, 暖色, 邊框閃光）。"""
        if c.idx == 0:
            # 第 1 幕：暖調 → 臺科大藍分離色調（暖色漸退、暗部轉藍，亮度微降讓光痕浮現）
            k = float(smoothstep(0.0, 3.2, t))
            shadow, high, warm = 0.10 + 0.38 * k, 0.55 - 0.27 * k, 0.32 * (1 - k) - 0.22 * k
            bright = 1.0 - 0.06 * k + 0.04 * float(smoothstep(3.2, 4.5, t)) - 0.06 * float(smoothstep(8.5, 10, t))
            return shadow, high, 0.0, bright, warm, 0.0
        on = float(smoothstep(c.t_on - 0.1, c.t_on + 0.7, t))
        flash = math.exp(-(t - c.t_on) / 0.42) if t >= c.t_on else 0.0
        bright = 0.55 + 0.45 * on + 0.22 * flash - 0.06 * float(smoothstep(8.5, 10, t))
        return 0.42, 0.28, 0.9 * (1 - on), bright, 0.0, flash

    def draw_card(self, img, fg, c: Card, quad: np.ndarray, t: float):
        W, H = self.W, self.H
        x0 = max(0, int(math.floor(quad[:, 0].min())) - 1)
        y0 = max(0, int(math.floor(quad[:, 1].min())) - 1)
        x1 = min(W, int(math.ceil(quad[:, 0].max())) + 2)
        y1 = min(H, int(math.ceil(quad[:, 1].max())) + 2)
        if x1 - x0 < 2 or y1 - y0 < 2:
            return
        disp_w = max(np.linalg.norm(quad[1] - quad[0]), np.linalg.norm(quad[2] - quad[3]))
        level = 0
        for k in range(len(c.mips)):
            if c.pw * c.mips[k].shape[1] / c.mips[0].shape[1] >= disp_w * 0.98:
                level = k
        tex = c.mips[level]
        sc = tex.shape[1] / c.mips[0].shape[1]
        p, pw, ph = c.pad, c.pw, c.ph
        src = (np.float32([[p, p], [p + pw, p], [p + pw, p + ph], [p, p + ph]]) * sc).astype(np.float32)
        dst = (quad - [x0, y0]).astype(np.float32)
        M = cv2.getPerspectiveTransform(src, dst)
        warped = cv2.warpPerspective(tex, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        a8 = warped[..., 3]
        if not a8.any():
            return
        a = a8.astype(np.float32) / 255.0
        col = warped[..., :3].astype(np.float32) / 255.0 / np.maximum(a, 1 / 255)[..., None]
        shadow, high, duo, bright, warm, flash = self.card_look(c, t)
        col = grade(col, shadow, high, duo, bright, warm)
        # 細邊框：以 alpha 的形態學梯度取得固定 1–2 px 的輪廓，與縮放無關
        rim = (a8 - cv2.erode(a8, self.k3)).astype(np.float32)[..., None] / 255.0
        rim_k = rim * min(1.0, 0.42 + 0.9 * flash)
        rim_col = CHAMPAGNE * (1 - 0.5 * flash) + WARM_WHITE * 0.5 * flash
        col = col * (1 - rim_k) + rim_col * rim_k
        A = a[..., None]
        region = img[y0:y1, x0:x1]
        img[y0:y1, x0:x1] = region * (1 - A) + col * A
        if flash > 0.01:
            fg[y0:y1, x0:x1] += rim * GOLD_GLOW * (1.4 * flash)

    # ---- 單格渲染 -------------------------------------------------------------

    def render(self, t: float):
        W, H, S = self.W, self.H, self.S
        cam = self.cam.at(t)
        back = np.zeros((H, W, 3), np.uint8)  # 第 2 層：底線、星點（不加光暈）
        backg = np.zeros((H, W, 3), np.uint8)  # 卡片後方的光（加光暈，被卡片遮擋）
        fg = np.zeros((H, W, 3), np.float32)
        low = np.zeros((H // self.q, W // self.q, 3), np.float32)
        th1 = 1
        th2 = max(1, int(round(2 * S)))

        poses = [self.pose(c, t) for c in self.cards]
        centers = np.array([p for p, _ in poses])
        converge = float(smoothstep(CONVERGE_T0 + 0.2, CONVERGE_T0 + 1.0, t))
        net_fade = 1 - float(smoothstep(CONVERGE_T0 + 0.6, CONVERGE_T0 + 1.85, t))

        # 星點與星座細線
        self._stars(back, backg, t, cam)

        # 第 2 幕連線
        for e in self.edges:
            g = float(smoothstep(0.0, 1.0, (t - e["t0"]) / e["dur"]))
            if g <= 0 or net_fade <= 0:
                continue
            A, B = centers[e["a"]], centers[e["b"]]
            L = float(np.linalg.norm(B - A))
            side = np.cross(B - A, [0.0, 0.0, 1.0])
            nrm = np.linalg.norm(side)
            side = side / nrm if nrm > 1e-6 else np.array([0.0, 1.0, 0.0])
            P = bezier(A, (A + B) / 2 + side * e["bend"] * L + np.array([0, 0.1 * L, 0]), B, 40)
            self.poly(back, sub_poly(P, 0, g), cam, self.c255(GOLD_LIT, 0.62 * net_fade), th1)
            if g < 1:
                self.comet(backg, P, g, 0.22, cam, GOLD_GLOW * net_fade, WARM_WHITE * net_fade, th2)
            else:
                age = t - e["t0"] - e["dur"]
                for ph in e["ph"]:
                    u = (ph + age * 2.6 / max(L, 1.0)) % 1.0
                    self.comet(backg, P, u, 0.12, cam, GOLD * 0.75 * net_fade, ICE_WHITE * 0.8 * net_fade, th1)

        # 光痕（第 1 幕）：在 M01 表面游移，離開照片後連向 M06 卡緣（本體在畫完 M01 後合成）
        trace_P = self._trace_path(poses) if t >= TRACE_T0 else None
        if trace_P is not None:
            self._trace(back, backg, t, cam, trace_P, net_fade)

        # 第 3 幕：環狀相鄰連線與輻射至光核的連線
        if converge > 0:
            self._ring_lines(back, backg, t, cam, centers)

        # 合成：背景 → 卡片陰影 → 後方光 → 相片卡（M01 之後疊光痕）
        img = self.bg.copy()
        quads = []
        order = []
        for c, (p, R) in zip(self.cards, poses):
            cs = self.corners(p, R)
            pts, z = self.project(cs, cam)
            if (z > NEAR + 0.2).all():
                quads.append(pts)
                _, zc = self.project(p[None], cam)
                order.append((zc[0], c.idx, pts))
            else:
                quads.append(None)
        self._shadows(img, order)
        back_f = back.astype(np.float32) / 255.0
        bg_glow = backg.astype(np.float32) / 255.0
        scrim = float(smoothstep(9.3, 10.3, t))
        if scrim > 0:  # 連線與星點在標語區淡出（輻射線停在暗幕邊緣，不穿過文字）
            keep = 1 - self.text_mask * (0.95 * scrim)
            back_f *= keep
            bg_glow *= keep
        img += back_f + bg_glow + self.bloom(bg_glow) * 0.9
        traced = trace_P is None
        for zc, idx, pts in sorted(order, key=lambda o: -o[0]):
            self.draw_card(img, fg, self.cards[idx], pts, t)
            if idx == 0 and not traced:  # 光痕貼在 M01 之上、較近的卡片之下
                self._trace_overlay(img, t, cam, trace_P)
                traced = True
        if not traced:
            self._trace_overlay(img, t, cam, trace_P)
        self.card_quads = quads

        # 光核（第 3–4 幕）
        core_px, core_z = self.project(self.core[None], cam)
        energy = float(smoothstep(8.9, 10.6, t)) + 0.9 * float(smoothstep(11.6, WIPE_T0 + 0.2, t))
        emblem_a = float(smoothstep(9.3, 10.5, t))
        if energy > 0 and core_z[0] > NEAR:
            rpx = self.F * 0.62 / core_z[0]
            d2 = ((self.qx - core_px[0, 0]) ** 2 + (self.qy - core_px[0, 1]) ** 2) / rpx**2
            core = np.exp(-d2 * 1.5)[..., None]
            halo = np.exp(-d2 * 0.16)[..., None]
            low += (WARM_WHITE * core * 0.75 * energy * (1 - 0.55 * emblem_a) + GOLD * halo * 0.10 * energy).astype(np.float32)
            ang = np.arctan2(self.qy - core_px[0, 1], self.qx - core_px[0, 0])
            rays = (0.5 + 0.5 * np.cos(ang * 16 + t * 0.5)) ** 10
            low += (GOLD * (rays * np.exp(-d2 * 0.05) * 0.04 * energy)[..., None]).astype(np.float32)

        # 第 1 幕暖色漏光
        leak = float(1 - smoothstep(2.4, 4.0, t))
        if leak > 0:
            d2 = ((self.qx - W * (0.08 + 0.05 * t)) / (W * 0.45)) ** 2 + ((self.qy + H * 0.05) / (H * 0.6)) ** 2
            low += (hex_bgr("#FFD9A0") * (np.exp(-d2) * 0.10 * leak)[..., None]).astype(np.float32)

        emblem = None
        if emblem_a > 0 and core_z[0] > NEAR:
            # hero._emblem_masks 以 F*1.2/z 決定尺寸：換算成目標高度（世界單位 1.75）
            emblem = hero.Scene._emblem_masks(self, core_px[0], core_z[0] * 1.2 / 1.75, emblem_a)
            if emblem:
                sl, _, m, rim = emblem
                fg[sl] += (rim * emblem_a)[..., None] * ICE_WHITE * 0.75
        gain = 1.0 + 1.3 * float(smoothstep(11.7, 12.5, t))
        img += fg + self.bloom(fg) * gain
        img += cv2.resize(low, (W, H), interpolation=cv2.INTER_LINEAR)
        if emblem:
            sl, _, m, rim = emblem
            yy = np.linspace(1.0, 0.0, m.shape[0], dtype=np.float32)[:, None, None]
            fill = NTUST_BLUE * (0.78 + 0.45 * yy)
            occ = (m * emblem_a * 0.95)[..., None]
            region = img[sl]
            img[sl] = region * (1 - occ) + fill * occ + (rim * emblem_a)[..., None] * GOLD * 0.45
        if scrim > 0:
            img *= 1 - self.scrim * (0.62 * scrim)
        img *= self.vignette
        self.core_px = core_px[0]
        return img

    def _stars(self, back, backg, t, cam):
        appear = float(smoothstep(3.3, 5.4, t))
        if appear <= 0:
            return
        p0 = self.star_p
        prog = np.clip((t - self.star_start) / self.star_dur, 0, 1)
        e = prog * prog * (3 - 2 * prog)
        rel = p0 - self.core
        ang = self.star_swirl * e
        c, s = np.cos(ang), np.sin(ang)
        k = (1 - e) ** 1.4
        pos = np.empty_like(p0)
        pos[:, 0] = self.core[0] + (rel[:, 0] * c - rel[:, 1] * s) * k
        pos[:, 1] = self.core[1] + (rel[:, 0] * s + rel[:, 1] * c) * k
        pos[:, 2] = self.core[2] + rel[:, 2] * k
        pts, z = self.project(pos, cam)
        line_a = appear * float(1 - smoothstep(8.2, 8.9, t))
        if line_a > 0:
            P = pts[self.star_pairs]
            Z = z[self.star_pairs]
            ok = (Z > NEAR).all(1)
            if ok.any():
                cv2.polylines(back, list(self._px(P[ok])), False, self.c255(STEEL, 0.12 * line_a), 1, cv2.LINE_AA, 4)
        tw = 0.6 + 0.4 * np.sin(t * 2.0 + self.star_tw)
        alive = e < 0.98
        for i in np.nonzero((z > NEAR) & alive)[0]:
            col = GOLD if self.star_gold[i] else ICE
            b = appear * tw[i] * (1.0 if prog[i] == 0 else 1.3)
            r = max(0.9 * self.S, self.F * 0.035 * self.star_size[i] / z[i])
            layer = backg if (self.star_gold[i] or prog[i] > 0) else back
            cv2.circle(layer, tuple(self._px(pts[i])), int(r * 16), self.c255(col, 0.75 * b), -1, cv2.LINE_AA, 4)

    def _trace_path(self, poses) -> np.ndarray:
        """光痕完整路徑（世界座標）：M01 表面的樹梢線段 ＋ 由照片右緣弧向 M06 左緣的連線段。"""
        p0, R0 = poses[0]
        loc = self.trace_local
        on = p0 + np.column_stack([loc[:, 0], loc[:, 1], np.full(len(loc), 0.02)]) @ R0.T
        pT, RT = poses[TRACE_TARGET]
        land = pT + np.array([TRACE_LAND[0], TRACE_LAND[1], 0.02]) @ RT.T
        E = on[-1]
        L = float(np.linalg.norm(land - E))
        ctrl = (E + land) / 2 + np.array([0.0, 0.10 * L, 0.25])  # 平緩上弧
        return np.vstack([on, bezier(E, ctrl, land, self.n_off)[1:]])

    def _trace(self, back, backg, t, cam, P, net_fade):
        """光痕離開照片後留下的細連線（底層）與抵達後沿線流動的光點；光痕本體由 _trace_overlay 合成。"""
        head = float(self.trace_head(t))
        if head <= self.n_on - 1 or net_fade <= 0:
            return
        seg = P[self.n_on - 1 :]
        g = (head - (self.n_on - 1)) / (len(seg) - 1)
        self.poly(back, sub_poly(seg, 0, min(g, 1)), cam, self.c255(GOLD_LIT, 0.62 * net_fade), 1)
        if t > self.trace_land + TRACE_DRAIN:
            L = float(np.linalg.norm(seg[-1] - seg[0]))
            age = t - self.trace_land - TRACE_DRAIN
            for ph in (0.0, 0.5):
                uu = (ph + age * 2.6 / max(L, 1.0)) % 1.0
                self.comet(backg, seg, uu, 0.12, cam, GOLD * 0.75 * net_fade, ICE_WHITE * 0.8 * net_fade, 1)

    def _trace_overlay(self, img, t, cam, P):
        """香檳金光痕：以 alpha-over 合成固定色 #DCC392 的核心線（亮天空或暗樹叢上顏色都一致），
        再以 screen 疊柔光；尾端 30% 漸細漸淡，光頭為柔和的放射狀光暈。尾巴長度以畫面弧長計。"""
        if t < TRACE_T0 or t > self.trace_land + TRACE_DRAIN:
            return
        S, W, H = self.S, self.W, self.H
        pts, z = self.project(P, cam)
        bad = np.nonzero(z <= NEAR)[0]
        if len(bad):
            pts = pts[: bad[0]]
        if len(pts) < 2:
            return
        n = len(P)
        cum = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(pts, axis=0).T))])
        total = float(cum[-1])
        tail = TRACE_TAIL_PX * S
        if t <= self.trace_land:
            s_h = float(np.interp(float(self.trace_head(t)), np.arange(n), np.pad(cum, (0, n - len(cum)), mode="edge")))
        else:  # 抵達後：光頭停在卡緣，尾巴持續流入
            s_h = total + tail * (t - self.trace_land) / TRACE_DRAIN
        s0, s1 = max(0.0, s_h - tail), min(total, s_h)
        if s1 - s0 < 1.0:
            return
        ss = np.append(np.arange(s0, s1, 3.0 * S), s1)
        xy = np.column_stack([np.interp(ss, cum, pts[:, 0]), np.interp(ss, cum, pts[:, 1])])
        age = (s_h - ss) / tail  # 0：光頭；1：尾端
        taper = smoothstep(1.0, 1.0 - TRACE_TAPER, age)
        fade = float(smoothstep(TRACE_T0, TRACE_T0 + 0.6, t))
        alpha = TRACE_ALPHA * fade * taper * (1 - 0.15 * age)
        width = TRACE_W_PX * S * (0.25 + 0.75 * taper)
        head_a = fade * float(1 - smoothstep(self.trace_land - 0.08, self.trace_land + 0.10, t))

        pad = int(math.ceil((3.2 * TRACE_GLOW_SIGMA + 4) * S)) + 2
        x0, y0 = max(0, int(xy[:, 0].min()) - pad), max(0, int(xy[:, 1].min()) - pad)
        x1, y1 = min(W, int(xy[:, 0].max()) + pad + 1), min(H, int(xy[:, 1].max()) + pad + 1)
        if x1 - x0 < 2 or y1 - y0 < 2:
            return
        # 核心線：2 倍超取樣繪製（線寬可細到半像素），再以面積平均縮回
        k = 2
        m = np.zeros(((y1 - y0) * k, (x1 - x0) * k), np.uint8)
        q = np.round((xy - [x0, y0]) * k * 16).astype(np.int64)
        for i in range(len(xy) - 1):
            a = 0.5 * (alpha[i] + alpha[i + 1])
            w = 0.5 * (width[i] + width[i + 1])
            cv2.line(m, (int(q[i, 0]), int(q[i, 1])), (int(q[i + 1, 0]), int(q[i + 1, 1])),
                     int(round(255 * a)), max(1, int(round(w * k))), cv2.LINE_AA, 4)
        core = cv2.resize(m, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        sg = TRACE_GLOW_SIGMA * S
        glow = cv2.GaussianBlur(core, (0, 0), sg) * (math.sqrt(2 * math.pi) * sg / (TRACE_W_PX * S * TRACE_ALPHA))
        glow = TRACE_GLOW * np.minimum(glow, 1.0)

        reg = img[y0:y1, x0:x1]
        reg += glow[..., None] * CHAMPAGNE * (1 - np.clip(reg, 0, 1))  # screen
        A = core[..., None]
        reg *= 1 - A
        reg += TRACE_COL * A
        if head_a > 0 and s_h <= total:
            hs = TRACE_HEAD_SIGMA * S
            hx, hy = xy[-1]
            r = int(math.ceil(hs * 2.6 * 3))
            bx0, by0 = max(x0, int(hx) - r), max(y0, int(hy) - r)
            bx1, by1 = min(x1, int(hx) + r + 1), min(y1, int(hy) + r + 1)
            if bx1 > bx0 and by1 > by0:
                yy, xx = np.mgrid[by0:by1, bx0:bx1].astype(np.float32)
                d2 = (xx + 0.5 - hx) ** 2 + (yy + 0.5 - hy) ** 2
                blob = np.exp(-d2 / (2 * hs * hs))[..., None] * (0.92 * head_a)
                halo = np.exp(-d2 / (2 * (2.6 * hs) ** 2))[..., None] * (0.30 * head_a)
                sub = img[by0:by1, bx0:bx1]
                sub += halo * CHAMPAGNE * (1 - np.clip(sub, 0, 1))
                sub *= 1 - blob
                sub += TRACE_HEAD_COL * blob

    def _ring_lines(self, back, backg, t, cam, centers):
        # 依環上槽位排序，相鄰兩卡相連
        idx = sorted(range(len(self.cards)), key=lambda i: self.cards[i].slot)
        g_ring = float(smoothstep(8.7, 9.6, t))
        g_spoke = float(smoothstep(9.1, 10.0, t))
        for k, i in enumerate(idx):
            j = idx[(k + 1) % len(idx)]
            A, B = centers[i], centers[j]
            mid = (A + B) / 2
            out = mid - self.ring_center
            out[2] = 0
            P = bezier(A, mid + out * 0.10, B, 32)
            if g_ring > 0:
                self.poly(back, sub_poly(P, 0, g_ring), cam, self.c255(GOLD_LIT, 0.7), 1)
                if g_ring >= 1:
                    u = (0.3 * k + (t - 9.6) * 0.45) % 1.0
                    self.comet(backg, P, u, 0.18, cam, GOLD * 0.8, ICE_WHITE * 0.8, 1)
            if g_spoke > 0:
                S = bezier(A, (A + self.core) / 2 + np.array([0, 0.25, 0]), self.core, 32)
                self.poly(back, sub_poly(S, 0, g_spoke), cam, self.c255(STEEL, 0.55), 1)
                if g_spoke < 1:
                    self.comet(backg, S, g_spoke, 0.2, cam, GOLD_GLOW, WARM_WHITE, max(1, int(round(2 * self.S))))
                else:
                    for ph in (0.0, 0.5):
                        u = (ph + 0.13 * k + (t - 10.0) * 0.7) % 1.0
                        self.comet(backg, S, u, 0.15, cam, GOLD * 0.85, WARM_WHITE * 0.9, 1)

    def _shadows(self, img, order):
        if not order:
            return
        q = self.q
        sh = np.zeros((self.H // q, self.W // q), np.float32)
        for _, _, pts in order:
            w = np.linalg.norm(pts[1] - pts[0])
            if w > self.W * 1.2:
                continue
            p = (pts + [0, w * 0.035]) / q
            cv2.fillConvexPoly(sh, np.round(p * 16).astype(np.int32), 1.0, cv2.LINE_AA, 4)
        sh = cv2.GaussianBlur(sh, (0, 0), 7 * self.S)
        img *= (1 - 0.55 * cv2.resize(sh, (self.W, self.H)))[..., None]

    # ---- 文字疊加（tonemap 之後） --------------------------------------------

    def overlays(self, img, t):
        S = self.S
        chips_a = float(1 - smoothstep(CONVERGE_T0 - 0.1, CONVERGE_T0 + 0.5, t))
        if chips_a > 0 and getattr(self, "card_quads", None):
            for c, quad in zip(self.cards, self.card_quads):
                if quad is None:
                    continue
                appear = float(smoothstep(max(c.t_on, 3.4) + 0.15, max(c.t_on, 3.4) + 0.75, t))
                a = chips_a * appear
                if a <= 0:
                    continue
                bl = quad[3]
                lift = int(round((1 - appear) * 8 * S))
                x, y = int(round(bl[0] + 2 * S)), int(round(bl[1] + 11 * S)) + lift
                h, w = c.chip.shape[:2]
                # 只在標籤完整落在 5% 字幕安全框內時顯示（x 96–1824、y 54–1026），永不被畫面邊緣裁切
                mx, my = 0.05 * self.W, 0.05 * self.H
                inside = min(x - mx, y - my, self.W - mx - (x + w), self.H - my - (y + h))
                a *= float(smoothstep(0.0, 40 * S, inside))
                blit(img, c.chip, x, y, a)
        # 標語：逐字淡入（字元依序出現並微微上移）
        t0 = 9.55
        if t >= t0:
            n = len(TAGLINE)
            ca = np.array([float(ease("out", (t - t0 - 0.075 * i) / 0.7)) for i in range(n)] + [0.0], np.float32)
            col_a = ca[self.tag_owner]
            blit(img, self.tag, 0, int(round(self.tag_y + (1 - ca[:n].mean()) * 10 * S)), 1.0, col_a)
            ea = float(ease("out", (t - t0 - 0.75) / 0.8))
            if ea > 0:
                blit(img, self.tag_en, 0, int(round(self.en_y + (1 - ea) * 6 * S)), ea)

    def brand_compose(self, img, t):
        b = self.brand
        if t < WIPE_T0:
            return img
        cx, cy = self.core_px
        diag = math.hypot(self.W, self.H)
        r = float(ease("in", (t - WIPE_T0) / WIPE_DUR)) * diag * 1.15
        soft = 260 * self.S
        d = np.hypot(self.qx - cx, self.qy - cy)
        m = 1 - smoothstep(r - soft, r, d)
        rim = np.exp(-(((d - r) / (soft * 0.35)) ** 2)) * (r > 0) * (1 - float(smoothstep(WIPE_T0 + 0.7, WIPE_T0 + 0.95, t)))
        m = cv2.resize(m.astype(np.float32), (self.W, self.H))[..., None]
        rim = cv2.resize(rim.astype(np.float32), (self.W, self.H))[..., None]
        out = img * (1 - m) + b["card"] * m + GOLD * rim * 0.35
        for layer in b["layers"]:
            a = float(ease("out", (t - layer["t0"]) / (layer["t1"] - layer["t0"])))
            if a <= 0:
                continue
            y0 = layer["y"] + int(round((1 - a) * 14 * self.S))
            src = layer["img"]
            h = min(src.shape[0], self.H - y0)
            if h <= 0:
                continue
            alpha = src[:h, :, 3:4] * a
            out[y0 : y0 + h] = out[y0 : y0 + h] * (1 - alpha) + src[:h, :, :3] * alpha
        return out

    def frame(self, t: float) -> np.ndarray:
        img = hero.Scene.tonemap(self.render(t))
        self.overlays(img, t)
        img = self.brand_compose(img, t)
        rng = np.random.default_rng(int(t * FPS) + 11)
        img = img + rng.uniform(-0.5, 0.5, img.shape).astype(np.float32) / 255.0  # 抖色，避免暗部色階斷層
        return np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# 多行程渲染
# ---------------------------------------------------------------------------

_SCENE: Scene | None = None


def _init(w, h, font):
    global _SCENE
    _SCENE = Scene(w, h, font)


def _render_index(i: int) -> bytes:
    assert _SCENE is not None
    return _SCENE.frame(i / FPS).tobytes()


def _render_time(t: float) -> np.ndarray:
    assert _SCENE is not None
    return _SCENE.frame(t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--out", type=Path, default=OUT_VIDEO, help="輸出 MP4 路徑")
    ap.add_argument("--poster", type=Path, default=OUT_POSTER, help="輸出封面 JPG")
    ap.add_argument("--poster-time", type=float, default=11.6, help="封面取自第幾秒")
    ap.add_argument("--crf", type=int, default=23)
    ap.add_argument("--maxrate", default="7500k", help="位元率上限（控制檔案大小）")
    ap.add_argument("--font", help="中文字型路徑（預設 Noto Sans TC）")
    # 每個行程約佔 0.5 GB，預設最多 4 個以免記憶體不足
    ap.add_argument("--workers", type=int, default=max(1, min(4, (os.cpu_count() or 4) - 2)))
    ap.add_argument("--preview", help="只輸出指定秒數的靜態格，例如 0,3,6,9,12,14.5")
    ap.add_argument("--preview-dir", type=Path, default=Path(tempfile.gettempdir()) / "emrd-alumni-preview")
    args = ap.parse_args()

    for asset in (hero.LOGO_PATH, hero.SYMBOL_PATH, PHOTO_DIR):
        if not asset.exists():
            sys.exit(f"找不到素材：{asset}")
    init = (args.width, args.height, args.font)
    _init(*init)  # 先在主行程建立一次場景：素材或字型缺漏時立即報錯

    if args.preview:
        times = [float(x) for x in args.preview.split(",")]
        args.preview_dir.mkdir(parents=True, exist_ok=True)
        with Pool(max(1, min(args.workers, len(times))), _init, init) as pool:
            frames = pool.map(_render_time, times)
        thumbs = []
        for t, f in zip(times, frames):
            write_image(args.preview_dir / f"alumni_{t:05.2f}.png", f)
            th = cv2.resize(f, (640, 360), interpolation=cv2.INTER_AREA)
            cv2.putText(th, f"{t:.2f}s", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
            thumbs.append(th)
        cols = 3
        while len(thumbs) % cols:
            thumbs.append(np.zeros_like(thumbs[0]))
        sheet = np.vstack([np.hstack(thumbs[i : i + cols]) for i in range(0, len(thumbs), cols)])
        write_image(args.preview_dir / "alumni_sheet.jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(f"preview → {args.preview_dir.resolve()}")
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("找不到 ffmpeg，請先安裝並加入 PATH。")
    out: Path = args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.stem + ".partial" + out.suffix)  # 成功後才替換，避免失敗時覆蓋既有影片
    n = int(DURATION * FPS)
    bufsize = f"{int(args.maxrate.rstrip('k')) * 2}k" if args.maxrate.endswith("k") else args.maxrate
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{args.width}x{args.height}", "-r", str(FPS), "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", str(args.crf), "-maxrate", args.maxrate, "-bufsize", bufsize,
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart", "-an", str(tmp),
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

    if args.poster:
        args.poster.parent.mkdir(parents=True, exist_ok=True)
        write_image(args.poster, _render_time(args.poster_time), [cv2.IMWRITE_JPEG_QUALITY, 86])
        print(f"poster → {args.poster}")


if __name__ == "__main__":
    main()
