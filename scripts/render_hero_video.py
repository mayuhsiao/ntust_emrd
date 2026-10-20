#!/usr/bin/env python3
"""
EMRD 形象動畫渲染器 —— 以程式生成 15 秒 3D 動態影像（無需任何素材授權）。

四幕分鏡：
  0–4 秒   微觀創新・技術源頭：晶圓微觀紋理，金屬線路伴隨淡金光芒由中心逐步點亮
  4–8 秒   系統聯動・智慧轉型：鏡頭快速拉遠，線路升起為立體智慧工廠與 AI 運算節點網絡，數據流穿梭
  8–12 秒  樞紐匯聚・領導決策：散落光點匯聚至中央立體樞紐，形成穩定大器的光芒核心
  12–15 秒 loop  版：光核凝聚為臺科大校徽，鏡頭穿入後無縫回到第 0 秒（網站 Hero 背景循環，畫面不含文字）
           brand 版：光芒擴散為純白底，浮現 EMRD 徽章與標語（社群、簡報、說明會用）

用法（於專案根目錄）：
  python scripts/render_hero_video.py --variant loop
  python scripts/render_hero_video.py --variant brand
  python scripts/render_hero_video.py --variant loop --preview 0,2,4,5.5,7,9,10.5,12,13.5,14.9

輸出：loop 版 → public/videos/hero-bg.mp4（網站 Hero 背景，隨網站部署）＋封面 media/videos/hero-poster.jpg；
      brand 版 → media/videos/emrd-brand-15s.mp4（社群／簡報用成品，不放在 public/，不隨網站部署）。
需求：Python 3.10+、numpy、opencv-python、Pillow，以及 PATH 上的 ffmpeg。
"""

from __future__ import annotations

import argparse
import math
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
# 臺科大標準字直式組合（秘書室 20190701 版 台科logo-07，已裁切透明邊界）
LOGO_PATH = ROOT / "src" / "assets" / "ntust-logo-vertical.png"
# 臺科大校徽符號（loop 版光核凝聚成校徽）
SYMBOL_PATH = ROOT / "src" / "assets" / "ntust-symbol.png"
# 網站實際使用的影片（隨網站部署）：只有 Hero 背景 hero-bg.mp4
VIDEO_DIR = ROOT / "public" / "videos"
# 網站未使用的影片成品與封面（社群、簡報用），放在 public/ 之外，不會被部署或公開存取
MEDIA_DIR = ROOT / "media" / "videos"

FPS = 30
DURATION = 15.0
SLOGAN = "引領研發前瞻，鍛造卓越領導"
SUBLINE = "工程學院　高階科技研發碩士在職專班"


def hex_bgr(h: str) -> np.ndarray:
    """#RRGGBB → BGR float32（0–1）。"""
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (1, 3, 5))
    return np.array([b, g, r], np.float32)


# 色票對齊網站 token：brand（科技深藍）、champagne（香檳金）
NAVY_DEEP = hex_bgr("#040A1A")
NAVY = hex_bgr("#0A1733")
NAVY_LIFT = hex_bgr("#122653")
WAFER = hex_bgr("#0A1838")
STEEL = hex_bgr("#5379CC")
ICE = hex_bgr("#B5C8EF")
ICE_WHITE = hex_bgr("#EEF3FC")
GOLD = hex_bgr("#DCC392")
GOLD_DEEP = hex_bgr("#C9A86A")
GOLD_GLOW = hex_bgr("#E8B45A")  # 光脈衝：飽和度較高，疊加在藍底上仍保有金色
GOLD_LIT = hex_bgr("#BF8E45")  # 點亮後的線路餘暉
NTUST_BLUE = hex_bgr("#005BAC")  # 臺科大校徽藍（取樣自官方標準字檔）
WARM_WHITE = hex_bgr("#FFF6E3")
SLATE_900 = (15, 23, 42)
SLATE_600 = (71, 85, 105)
CHAMPAGNE_700 = (114, 90, 49)
CHAMPAGNE_500 = (176, 141, 79)


# ---------------------------------------------------------------------------
# 數學工具
# ---------------------------------------------------------------------------


def clamp01(x):
    return np.clip(x, 0.0, 1.0)


def smoothstep(a: float, b: float, x):
    t = clamp01((np.asarray(x, dtype=np.float64) - a) / (b - a))
    return t * t * (3 - 2 * t)


def ease(kind: str, t: float) -> float:
    t = min(1.0, max(0.0, t))
    if kind == "linear":
        return t
    if kind == "in":
        return t * t * t
    if kind == "out":
        return 1 - (1 - t) ** 3
    # in-out cubic
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], np.float64)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], np.float64)


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], np.float64)


def icosphere(subdiv: int = 1):
    p = (1 + 5**0.5) / 2
    verts = [
        (-1, p, 0), (1, p, 0), (-1, -p, 0), (1, -p, 0),
        (0, -1, p), (0, 1, p), (0, -1, -p), (0, 1, -p),
        (p, 0, -1), (p, 0, 1), (-p, 0, -1), (-p, 0, 1),
    ]
    faces = [
        (0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11),
        (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6), (7, 1, 8),
        (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9),
        (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7), (9, 8, 1),
    ]
    v = [np.array(x, np.float64) / np.linalg.norm(x) for x in verts]
    for _ in range(subdiv):
        cache: dict[tuple[int, int], int] = {}

        def mid(a, b):
            key = (min(a, b), max(a, b))
            if key not in cache:
                m = v[a] + v[b]
                v.append(m / np.linalg.norm(m))
                cache[key] = len(v) - 1
            return cache[key]

        new_faces = []
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            new_faces += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = new_faces
    edges = set()
    for a, b, c in faces:
        for x, y in ((a, b), (b, c), (c, a)):
            edges.add((min(x, y), max(x, y)))
    return np.array(v), np.array(sorted(edges))


# ---------------------------------------------------------------------------
# 攝影機
# ---------------------------------------------------------------------------


@dataclass
class Key:
    t: float
    target: tuple[float, float, float]
    dist: float
    el: float  # 仰角（度）
    az: float  # 方位角（度）
    ease: str = "io"


HUB = np.array([0.0, 2.35, 0.0])

KEYS_COMMON = [
    Key(-3.0, (0.66, 0.0, 0.44), 0.92, 56, -36, "linear"),
    Key(4.0, (0.42, 0.0, 0.28), 0.70, 50, -20, "linear"),
    Key(6.9, (0.0, 0.95, 0.0), 10.8, 25, -6, "io"),
    Key(12.0, (0.0, 2.05, 0.0), 7.0, 16, 16, "io"),
]
KEYS_END = {
    "loop": Key(15.0, (0.0, 2.35, 0.0), 1.35, 12, 26, "in"),
    "brand": Key(15.0, (0.0, 2.2, 0.0), 6.2, 15, 21, "out"),
}


class Camera:
    def __init__(self, keys: list[Key]):
        self.keys = keys

    def at(self, t: float):
        ks = self.keys
        if t <= ks[0].t:
            a = b = ks[0]
            u = 0.0
        elif t >= ks[-1].t:
            a = b = ks[-1]
            u = 0.0
        else:
            i = next(i for i in range(1, len(ks)) if t <= ks[i].t)
            a, b = ks[i - 1], ks[i]
            u = ease(b.ease, (t - a.t) / (b.t - a.t))
        target = np.array(a.target) + (np.array(b.target) - np.array(a.target)) * u
        dist = math.exp(math.log(a.dist) + (math.log(b.dist) - math.log(a.dist)) * u)
        el = math.radians(a.el + (b.el - a.el) * u)
        az = math.radians(a.az + (b.az - a.az) * u)
        pos = target + dist * np.array(
            [math.cos(el) * math.sin(az), math.sin(el), math.cos(el) * math.cos(az)]
        )
        fwd = target - pos
        fwd /= np.linalg.norm(fwd)
        right = np.cross(fwd, np.array([0.0, 1.0, 0.0]))
        right /= np.linalg.norm(right)
        up = np.cross(right, fwd)
        return pos, right, up, fwd, dist


# ---------------------------------------------------------------------------
# 場景
# ---------------------------------------------------------------------------

R_WAFER = 4.0
DIE = 0.25
NEAR = 0.05


class Scene:
    def __init__(self, variant: str, width: int, height: int, font_path: str | None):
        self.variant = variant
        self.W, self.H = width, height
        self.S = width / 1920
        self.F = 1400 * self.S
        # Hero 版把視覺重心放在右側（左側由網頁白色漸層遮罩承載標題文字）
        self.cx = width * (0.64 if variant == "loop" else 0.5)
        self.cy = height * 0.5
        self.cam = Camera(KEYS_COMMON + [KEYS_END[variant]])
        rng = np.random.default_rng(20251020)

        self._build_background()
        self._build_wafer(rng)
        self._build_network(rng)
        self._build_particles(rng)
        self.hub_v, self.hub_e = icosphere(1)
        self.rings = self._build_rings()
        self.brand = self._build_brand(font_path) if variant == "brand" else None
        self.emblem = None
        if variant == "loop":
            sym = cv2.imread(str(SYMBOL_PATH), cv2.IMREAD_UNCHANGED)
            self.emblem = sym[..., 3].astype(np.float32) / 255.0

        # 低解析度像素座標（光暈、晶圓著色用）
        self.q = 4
        qh, qw = height // self.q, width // self.q
        ys, xs = np.mgrid[0:qh, 0:qw].astype(np.float32)
        self.qx = (xs + 0.5) * self.q
        self.qy = (ys + 0.5) * self.q

    # ---- 建構 ---------------------------------------------------------------

    def _build_background(self):
        H, W = self.H, self.W
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        d = np.sqrt(((xs - self.cx) / W) ** 2 + ((ys - H * 0.45) / H) ** 2)
        k = smoothstep(0.0, 0.85, d).astype(np.float32)[..., None]
        self.bg = (NAVY_LIFT * 0.55 * (1 - k) + NAVY_DEEP * k).astype(np.float32)

    def _die_template(self, rng):
        """單一晶粒圖樣（區域座標 0–1）。真實晶圓上每顆晶粒相同，因此共用一組模板。"""
        pads, traces, blocks, rows = [], [], [], []
        n = 9
        for i in range(n):
            o = 0.12 + i * (0.76 / (n - 1))
            s = 0.022
            for cx, cy in ((o, 0.06), (o, 0.94), (0.06, o), (0.94, o)):
                pads.append(
                    np.array([[cx - s, cy - s], [cx + s, cy - s], [cx + s, cy + s], [cx - s, cy + s]])
                )
        for bx, by, bw, bh in ((0.16, 0.18, 0.30, 0.26), (0.56, 0.52, 0.28, 0.30)):
            blocks.append(np.array([[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]]))
            for k in range(1, 10):
                y = by + bh * k / 10
                rows.append(np.array([[bx + 0.012, y], [bx + bw - 0.012, y]]))
        lattice = 0.04
        for _ in range(26):
            p = np.array([rng.uniform(0.12, 0.88), rng.uniform(0.12, 0.88)])
            p = np.round(p / lattice) * lattice
            pts = [p.copy()]
            horizontal = bool(rng.integers(0, 2))
            for _ in range(int(rng.integers(3, 7))):
                step = rng.choice([-1, 1]) * lattice * rng.integers(2, 7)
                q = pts[-1].copy()
                q[0 if horizontal else 1] = np.clip(q[0 if horizontal else 1] + step, 0.1, 0.9)
                if np.allclose(q, pts[-1]):
                    continue
                pts.append(q)
                horizontal = not horizontal
            if len(pts) >= 3:
                traces.append(np.array(pts))
        return pads, traces, blocks, rows

    def _build_wafer(self, rng):
        self.pads, self.traces, self.blocks, self.rows = self._die_template(rng)
        self.trace_len = []
        for tr in self.traces:
            seg = np.linalg.norm(np.diff(tr, axis=0), axis=1)
            self.trace_len.append(np.concatenate([[0], np.cumsum(seg)]))

        # 完整晶粒（四角皆位於晶圓內）
        n = int(2 * R_WAFER / DIE) + 2
        origins = []
        for i in range(-n // 2, n // 2):
            for j in range(-n // 2, n // 2):
                x0, z0 = i * DIE, j * DIE
                corners = np.array([[x0, z0], [x0 + DIE, z0], [x0, z0 + DIE], [x0 + DIE, z0 + DIE]])
                if np.all(np.hypot(corners[:, 0], corners[:, 1]) < R_WAFER * 0.965):
                    origins.append((x0, z0))
        self.die_origin = np.array(origins, np.float64)
        centers = self.die_origin + DIE / 2
        focus = np.array([0.42, 0.28])
        dist = np.hypot(*(centers - focus).T)
        # 由第 1 幕焦點向外擴散的點亮波
        self.die_on = 0.4 + dist * 3.2 + rng.uniform(0, 0.4, len(centers))
        self.trace_delay = rng.uniform(0, 1.2, (len(centers), len(self.traces)))

        # 切割道（scribe line）分段，避免穿越近裁切面時整條消失
        segs = []
        k = int(R_WAFER / DIE) + 1
        for i in range(-k, k + 1):
            c = i * DIE
            if abs(c) >= R_WAFER:
                continue
            half = math.sqrt(R_WAFER**2 - c**2)
            ts = np.arange(-half, half, DIE / 2)
            ts = np.append(ts, half)
            for a, b in zip(ts[:-1], ts[1:]):
                segs.append(((c, 0, a), (c, 0, b)))
                segs.append(((a, 0, c), (b, 0, c)))
        self.grid = np.array(segs, np.float64)
        ang = np.linspace(0, 2 * math.pi, 721)
        rim = np.stack([R_WAFER * np.cos(ang), np.zeros_like(ang), R_WAFER * np.sin(ang)], 1)
        notch = np.abs(((ang + math.pi / 2) % (2 * math.pi)) - math.pi) < 0.035
        rim[notch, :] *= 0.985
        self.rim = rim

    def _build_network(self, rng):
        self.factories = []
        angles = np.linspace(0, 2 * math.pi, 7, endpoint=False) + 0.35
        for i, a in enumerate(angles):
            r = 2.35 if i % 2 == 0 else 3.05
            self.factories.append(
                dict(
                    c=np.array([r * math.cos(a), 0.0, r * math.sin(a)]),
                    w=rng.uniform(0.45, 0.75),
                    d=rng.uniform(0.38, 0.62),
                    h=rng.uniform(0.45, 1.25),
                    rot=a,
                    saw=i % 3 != 1,
                    t0=4.85 + i * 0.16,
                )
            )

        def ring(nn, radius, y, off):
            return [
                np.array([radius * math.cos(off + 2 * math.pi * k / nn), y, radius * math.sin(off + 2 * math.pi * k / nn)])
                for k in range(nn)
            ]

        self.l1 = ring(12, 2.65, 1.45, 0.1)
        self.l2 = ring(7, 1.45, 2.2, 0.4)
        self.nodes = [(p, 5.55 + 0.05 * i, 1) for i, p in enumerate(self.l1)] + [
            (p, 6.15 + 0.06 * i, 2) for i, p in enumerate(self.l2)
        ]

        edges = []  # (A, B, 出現時間, 強度)

        def nearest(p, pool, k):
            d = [np.linalg.norm(p - q) for q in pool]
            return [pool[i] for i in np.argsort(d)[:k]]

        for f in self.factories:
            top = f["c"] + np.array([0, f["h"], 0])
            for q in nearest(top, self.l1, 2):
                edges.append((top, q, f["t0"] + 0.9, 0.8))
        for i, p in enumerate(self.l1):
            for q in nearest(p, self.l2, 2):
                edges.append((p, q, 6.3 + 0.03 * i, 1.0))
            edges.append((p, self.l1[(i + 1) % len(self.l1)], 6.0 + 0.03 * i, 0.45))
        for i, p in enumerate(self.l2):
            edges.append((p, self.l2[(i + 1) % len(self.l2)], 6.6, 0.6))
            edges.append((p, HUB.copy(), 9.0 + 0.08 * i, 1.0))
        self.edges = edges
        self.edge_phase = rng.uniform(0, 1, (len(edges), 2))

        # 晶圓表面導線 → 垂直升起至 AI 節點（晶圓線路轉化為立體網絡）
        self.risers = []
        for i, p in enumerate(self.l1):
            base = np.array([p[0], 0.0, p[2]])
            path = [np.array([0.0, 0.003, 0.0]), np.array([base[0], 0.003, 0.0]), base + [0, 0.003, 0]]
            self.risers.append(dict(path=np.array(path), top=p, t0=4.55 + 0.06 * i))

    def _build_particles(self, rng):
        n = 360
        u = rng.normal(size=(n, 3))
        u /= np.linalg.norm(u, axis=1, keepdims=True)
        u[:, 1] = np.abs(u[:, 1]) * 0.55
        r = rng.uniform(2.6, 6.2, n)[:, None]
        self.p0 = HUB + u * r
        self.p0[:, 1] = np.clip(self.p0[:, 1], 0.25, 4.6)
        self.p_start = rng.uniform(8.0, 9.5, n)
        self.p_dur = rng.uniform(1.5, 2.3, n)
        self.p_swirl = rng.uniform(1.4, 2.6, n) * rng.choice([-1, 1], n)
        self.p_gold = rng.uniform(0, 1, n) < 0.42
        self.p_twinkle = rng.uniform(0, 2 * math.pi, n)

    def _build_rings(self):
        ang = np.linspace(0, 2 * math.pi, 181)
        rings = []
        for radius, tilt_x, tilt_z, speed in ((0.82, 1.25, 0.2, 0.55), (1.08, 0.35, -0.6, -0.4), (1.36, 1.75, 0.9, 0.28)):
            pts = np.stack([radius * np.cos(ang), np.zeros_like(ang), radius * np.sin(ang)], 1)
            rings.append((pts, rot_z(tilt_z) @ rot_x(tilt_x), speed))
        return rings

    def _build_brand(self, font_path: str | None):
        W, H, S = self.W, self.H, self.S

        def font(size: int, weight: int):
            candidates = [font_path] if font_path else []
            windir = os.environ.get("WINDIR", "C:/Windows")
            candidates += [
                f"{windir}/Fonts/NotoSansTC-VF.ttf",
                "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                "/System/Library/Fonts/PingFang.ttc",
                f"{windir}/Fonts/msjhbd.ttc" if weight >= 600 else f"{windir}/Fonts/msjh.ttc",
            ]
            for c in candidates:
                if c and Path(c).exists():
                    f = ImageFont.truetype(c, int(size * S))
                    try:
                        f.set_variation_by_axes([weight])
                    except Exception:
                        pass
                    return f
            sys.exit("找不到中文字型，請以 --font 指定 Noto Sans TC 或微軟正黑體路徑。")

        def text_layer(text: str, fnt, color, tracking: float = 0.0):
            img = Image.new("RGBA", (W, int(H * 0.2)), (0, 0, 0, 0))
            dr = ImageDraw.Draw(img)
            widths = [dr.textlength(ch, font=fnt) for ch in text]
            total = sum(widths) + tracking * fnt.size * (len(text) - 1)
            x = (W - total) / 2
            for ch, w in zip(text, widths):
                dr.text((x, 0), ch, font=fnt, fill=color + (255,))
                x += w + tracking * fnt.size
            bbox = img.getbbox()
            return img.crop((0, bbox[1], W, bbox[3])) if bbox else img

        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_h = int(236 * S)
        logo_w = round(logo.width * logo_h / logo.height)
        logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
        logo_layer = Image.new("RGBA", (W, logo_h), (0, 0, 0, 0))
        logo_layer.paste(logo, ((W - logo_w) // 2, 0), logo)

        line = Image.new("RGBA", (W, max(2, int(2 * S))), (0, 0, 0, 0))
        lw = int(132 * S)
        ImageDraw.Draw(line).rectangle(
            ((W - lw) // 2, 0, (W + lw) // 2, line.height), fill=CHAMPAGNE_500 + (255,)
        )

        layers = [
            ("logo", logo_layer, 12.85, 13.75, int(58 * S)),
            ("title", text_layer("NTUST  EMRD", font(64, 650), SLATE_900, 0.16), 13.05, 13.85, int(28 * S)),
            ("line", line, 13.3, 14.0, int(30 * S)),
            ("slogan", text_layer(SLOGAN, font(56, 600), SLATE_900, 0.06), 13.4, 14.2, int(26 * S)),
            ("sub", text_layer(SUBLINE, font(27, 450), SLATE_600, 0.12), 13.6, 14.35, 0),
        ]
        total = sum(l.height + gap for _, l, _, _, gap in layers)
        y = (H - total) // 2 - int(10 * S)
        placed = []
        for name, layer, t0, t1, gap in layers:
            arr = np.asarray(layer).astype(np.float32) / 255.0
            rgba = np.concatenate([arr[..., 2::-1], arr[..., 3:]], axis=2)  # RGBA → BGRA
            placed.append(dict(name=name, img=rgba, y=y, t0=t0, t1=t1))
            y += layer.height + gap

        # 白底＋淡點陣（與網站 Hero 一致）
        ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
        pitch = 26 * S
        dots = (
            (np.minimum(xs % pitch, pitch - xs % pitch) < 1.1 * S)
            & (np.minimum(ys % pitch, pitch - ys % pitch) < 1.1 * S)
        ).astype(np.float32)
        fade = smoothstep(0.15, 0.75, np.hypot((xs - W / 2) / W, (ys - H / 2) / H)).astype(np.float32)
        card = 1.0 - dots[..., None] * 0.08 * fade[..., None] * (1 - np.array([0.92, 0.91, 0.94], np.float32))
        card -= dots[..., None] * 0.05 * fade[..., None]
        return dict(layers=placed, card=np.clip(card, 0, 1).astype(np.float32))

    # ---- 投影與繪製 ---------------------------------------------------------------

    def project(self, P, cam):
        pos, right, up, fwd, _ = cam
        v = np.asarray(P, np.float64) - pos
        x, y, z = v @ right, v @ up, v @ fwd
        zz = np.where(z > NEAR, z, NEAR)
        u = self.cx + self.F * x / zz
        w = self.cy - self.F * y / zz
        return np.stack([u, w], -1), z

    @staticmethod
    def _px(pts):
        return np.round(np.clip(pts, -3e4, 3e4) * 16).astype(np.int32)

    def polyline(self, img, P, cam, color, thickness=1, closed=False):
        if len(P) < 2:
            return
        pts, z = self.project(P, cam)
        ok = z > NEAR
        if ok.all():
            cv2.polylines(img, [self._px(pts)], closed, color, thickness, cv2.LINE_AA, 4)
            return
        start = None
        for i, good in enumerate(np.append(ok, False)):
            if good and start is None:
                start = i
            elif not good and start is not None:
                if i - start >= 2:
                    cv2.polylines(img, [self._px(pts[start:i])], False, color, thickness, cv2.LINE_AA, 4)
                start = None

    def segment(self, img, A, B, cam, color, thickness=1):
        pts, z = self.project(np.array([A, B]), cam)
        if (z > NEAR).all():
            cv2.line(img, tuple(self._px(pts[0])), tuple(self._px(pts[1])), color, thickness, cv2.LINE_AA, 4)

    def dot(self, img, P, cam, radius_world, color, min_px=1.2):
        pts, z = self.project(np.array([P]), cam)
        if z[0] <= NEAR:
            return
        r = max(min_px * self.S, self.F * radius_world / z[0])
        cv2.circle(img, tuple(self._px(pts[0])), int(round(r * 16)), color, -1, cv2.LINE_AA, 4)

    @staticmethod
    def c255(bgr, k=1.0):
        return tuple(float(x) for x in np.clip(bgr * 255 * k, 0, 255))

    # ---- 單格渲染 ---------------------------------------------------------------

    def render(self, t: float) -> np.ndarray:
        W, H = self.W, self.H
        cam = self.cam.at(t)
        pos, right, up, fwd, dist = cam
        sharp = np.zeros((H, W, 3), np.uint8)
        glow = np.zeros((H, W, 3), np.uint8)
        low = np.zeros((H // self.q, W // self.q, 3), np.float32)  # 低解析度加光層

        wafer_dim = 1.0 - 0.45 * float(smoothstep(9.0, 11.8, t))
        net_dim = 1.0 - 0.55 * float(smoothstep(8.8, 11.2, t))

        # 晶圓表面著色（逐像素射線與 y=0 平面求交）
        dx = (self.qx - self.cx) / self.F
        dy = -(self.qy - self.cy) / self.F
        ray = dx[..., None] * right + dy[..., None] * up + fwd
        with np.errstate(divide="ignore", invalid="ignore"):
            s = -pos[1] / ray[..., 1]
        hit = pos + s[..., None] * ray
        rad = np.hypot(hit[..., 0], hit[..., 2])
        on = ((s > 0) & np.isfinite(s)).astype(np.float32) * (1 - smoothstep(R_WAFER - 0.03, R_WAFER, rad)).astype(np.float32)
        theta = np.arctan2(hit[..., 2], hit[..., 0])
        sheen = 0.5 + 0.5 * np.cos(2 * theta + 0.25 * t) * np.cos(rad * 0.9 - 0.15 * t)
        depth_fade = np.clip(1.25 - s / 16, 0.35, 1.0)
        wafer_col = WAFER * (0.6 + 0.4 * sheen[..., None]) + hex_bgr("#2F59B6") * 0.07 * (sheen[..., None] ** 3)
        low += (wafer_col * (on * depth_fade * wafer_dim)[..., None]).astype(np.float32)

        # 切割道
        grid_k = 0.34 * wafer_dim * float(smoothstep(2, 10, self.F * DIE / dist))
        if grid_k > 0.01:
            pts, z = self.project(self.grid.reshape(-1, 3), cam)
            pts = pts.reshape(-1, 2, 2)
            z = z.reshape(-1, 2)
            ok = (z > NEAR).all(1)
            fog = np.clip(1.3 - z.mean(1) / 18, 0.3, 1)
            for level in (0.4, 0.7, 1.0):
                sel = ok & (fog <= level) & (fog > level - 0.3)
                if sel.any():
                    cv2.polylines(sharp, list(self._px(pts[sel])), False, self.c255(STEEL, 0.42 * grid_k * level), 1, cv2.LINE_AA, 4)
        self.polyline(sharp, self.rim, cam, self.c255(ICE, 0.55 * wafer_dim), 1, False)

        # 晶粒：近距離細節（LOD）與遠距離點亮色塊
        centers = np.column_stack([self.die_origin[:, 0] + DIE / 2, np.zeros(len(self.die_origin)), self.die_origin[:, 1] + DIE / 2])
        cpts, cz = self.project(centers, cam)
        size_px = self.F * DIE / np.maximum(cz, NEAR)
        margin = size_px
        visible = (cz > NEAR) & (cpts[:, 0] > -margin) & (cpts[:, 0] < W + margin) & (cpts[:, 1] > -margin) & (cpts[:, 1] < H + margin)
        lit_all = smoothstep(self.die_on, self.die_on + 0.9, t)

        far = visible & (size_px < 70)
        if far.any():
            quads = np.stack(
                [
                    self.die_origin + [0.02 * DIE, 0.02 * DIE],
                    self.die_origin + [0.98 * DIE, 0.02 * DIE],
                    self.die_origin + [0.98 * DIE, 0.98 * DIE],
                    self.die_origin + [0.02 * DIE, 0.98 * DIE],
                ],
                1,
            )
            q3 = np.concatenate([quads[..., :1], np.zeros(quads.shape[:2] + (1,)), quads[..., 1:]], 2)
            qp, qz = self.project(q3.reshape(-1, 3), cam)
            qp = qp.reshape(-1, 4, 2)
            qz = qz.reshape(-1, 4)
            fade_far = 1 - smoothstep(40, 70, size_px)
            for level in np.linspace(0.15, 1.0, 6):
                sel = far & (qz > NEAR).all(1) & (lit_all > level - 0.17) & (lit_all <= level)
                if sel.any():
                    k = 0.12 * level * wafer_dim
                    cv2.fillPoly(sharp, list(self._px(qp[sel])), self.c255(GOLD_DEEP, k * float(np.mean(fade_far[sel]))), cv2.LINE_AA, 4)

        near = np.nonzero(visible & (size_px >= 18))[0]
        for di in near:
            fog = float(np.clip(1.3 - (cz[di] - dist) / (dist * 1.2), 0.3, 1.0))
            detail = float(smoothstep(18, 60, size_px[di])) * wafer_dim * fog
            ox, oz = self.die_origin[di]

            def to3(loc):
                return np.column_stack([ox + loc[:, 0] * DIE, np.full(len(loc), 0.0005), oz + loc[:, 1] * DIE])

            for pad in self.pads:
                self.polyline(sharp, to3(pad), cam, self.c255(ICE, 0.2 * detail), 1, True)
            for blk in self.blocks:
                self.polyline(sharp, to3(blk), cam, self.c255(STEEL, 0.36 * detail), 1, True)
            for row in self.rows:
                self.polyline(sharp, to3(row), cam, self.c255(STEEL, 0.13 * detail), 1)
            for ti, tr in enumerate(self.traces):
                start = self.die_on[di] + self.trace_delay[di, ti]
                prog = (t - start) / 0.75
                lit = float(smoothstep(0.0, 1.0, prog))
                base = STEEL * (1 - lit) + GOLD_LIT * lit
                self.polyline(sharp, to3(tr), cam, self.c255(base, (0.3 + 0.32 * lit) * detail), 1)
                if 0 < prog < 1.35:
                    L = self.trace_len[ti]
                    head = min(prog, 1.0) * L[-1]
                    tail = max(0.0, (prog - 0.35)) * L[-1]
                    sub = self._sub_polyline(tr, L, tail, head)
                    if len(sub) >= 2:
                        fade = 1.0 if prog <= 1 else 1 - (prog - 1) / 0.35
                        self.polyline(glow, to3(sub), cam, self.c255(GOLD_GLOW, 0.85 * fade * detail**2), 2 if detail > 0.75 else 1)

        # 晶圓表面導線 → 升起的光柱
        for rz in self.risers:
            p = (t - rz["t0"]) / 0.7
            if p <= 0:
                continue
            path = rz["path"]
            L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
            sub = self._sub_polyline(path, L, 0, min(p, 1) * L[-1])
            self.polyline(sharp, sub, cam, self.c255(GOLD, 0.55 * wafer_dim), 1)
            q = smoothstep(0.0, 1.0, (t - rz["t0"] - 0.6) / 0.7)
            if q > 0:
                base = path[-1]
                top = base + (rz["top"] - base) * float(q)
                self.segment(glow, base, top, cam, self.c255(GOLD, 0.6 * net_dim), 1)

        # 智慧工廠（由晶圓升起的線框建築）
        for f in self.factories:
            grow = float(ease("out", (t - f["t0"]) / 1.0))
            if grow <= 0:
                continue
            self._factory(sharp, glow, f, f["h"] * grow, cam, net_dim * min(1.0, grow * 2))

        # AI 節點與連線、數據封包
        for (A, B, t0, strength), ph in zip(self.edges, self.edge_phase):
            g = float(smoothstep(0.0, 1.0, (t - t0) / 0.55))
            if g <= 0:
                continue
            Bt = A + (B - A) * g
            dim = net_dim if not np.allclose(B, HUB) else 1.0
            self.segment(sharp, A, Bt, cam, self.c255(STEEL, 0.75 * strength * dim), 1)
            if g >= 1:
                length = float(np.linalg.norm(B - A))
                for k in ph:
                    u = (k + (t - t0) * 2.4 / max(length, 0.3)) % 1.0
                    head = A + (B - A) * u
                    tail = A + (B - A) * max(0.0, u - 0.09)
                    self.segment(glow, tail, head, cam, self.c255(ICE_WHITE, 0.85 * strength * dim), 2)
        for p, t0, layer in self.nodes:
            a = float(smoothstep(0.0, 1.0, (t - t0) / 0.5))
            if a <= 0:
                continue
            pulse = 0.75 + 0.25 * math.sin(t * 3.2 + p[0] * 2)
            col = GOLD if layer == 2 else ICE_WHITE
            self.dot(glow, p, cam, 0.045 * a, self.c255(col, a * pulse * net_dim))
            self.dot(sharp, p, cam, 0.075 * a, self.c255(STEEL, 0.5 * a * net_dim))

        # 散落光點 → 匯聚至樞紐
        self._particles(glow, t, cam)

        # 立體樞紐、軌道環與光芒核心
        energy = float(smoothstep(8.6, 11.6, t))
        emblem_a = float(smoothstep(10.0, 11.4, t)) if self.emblem is not None else 0.0
        hub_a = float(smoothstep(8.4, 9.7, t)) * (1 - 0.85 * emblem_a)
        if hub_a > 0:
            breathe = 1 + 0.03 * math.sin(t * 2.4)
            R = rot_y(t * 0.45) @ rot_x(0.35)
            verts = HUB + (self.hub_v @ R.T) * 0.55 * hub_a * breathe
            for a_i, b_i in self.hub_e:
                self.segment(glow, verts[a_i], verts[b_i], cam, self.c255(ICE, 0.55 * hub_a), 1)
            for v in verts[::2]:
                self.dot(glow, v, cam, 0.018, self.c255(GOLD, hub_a))
            for i, (pts, base_rot, speed) in enumerate(self.rings):
                ring_a = float(smoothstep(9.1 + i * 0.25, 10.4 + i * 0.25, t))
                if ring_a <= 0:
                    continue
                n = max(2, int(len(pts) * ring_a))
                Rr = base_rot @ rot_y(t * speed)
                self.polyline(glow, HUB + pts[:n] @ Rr.T, cam, self.c255(GOLD, 0.6), 1)

        hub_px, hub_z = self.project(np.array([HUB]), cam)
        if hub_z[0] > NEAR and energy > 0:
            rpx = self.F * 0.72 / hub_z[0]
            d2 = ((self.qx - hub_px[0, 0]) ** 2 + (self.qy - hub_px[0, 1]) ** 2) / (rpx**2)
            core = np.exp(-d2 * 1.6)[..., None]
            halo = np.exp(-d2 * 0.18)[..., None]
            low += (WARM_WHITE * core * 0.7 * energy * (1 - 0.6 * emblem_a) + GOLD * halo * 0.12 * energy).astype(np.float32)
            # 柔和光芒射線
            ang = np.arctan2(self.qy - hub_px[0, 1], self.qx - hub_px[0, 0])
            rays = (0.5 + 0.5 * np.cos(ang * 18 + t * 0.6)) ** 10
            low += (GOLD * (rays * np.exp(-d2 * 0.06) * 0.035 * energy)[..., None]).astype(np.float32)

        # 第 1 幕的大範圍鏡面光澤
        sheen_k = float(1 - smoothstep(3.5, 5.5, t)) * float(smoothstep(-3.5, 0.5, t) * 0.6 + 0.4)
        if sheen_k > 0:
            sx = self.W * (0.15 + 0.06 * t)
            d2 = ((self.qx - sx) / (W * 0.35)) ** 2 + ((self.qy - H * 0.35) / (H * 0.45)) ** 2
            low += (hex_bgr("#5379CC") * (np.exp(-d2) * 0.10 * sheen_k)[..., None]).astype(np.float32)

        # 合成：背景 + 低解析度光 + 線條 + 光暈（bloom）
        gain = 1.0
        if self.variant == "brand":
            gain += 1.4 * float(smoothstep(11.8, 12.6, t))
        else:
            gain += 0.9 * float(smoothstep(12.0, 14.0, t))
        img = self.bg.copy()
        img += cv2.resize(low, (W, H), interpolation=cv2.INTER_LINEAR)
        img += sharp.astype(np.float32) / 255.0
        g = glow.astype(np.float32) / 255.0
        emblem = None
        if emblem_a > 0 and hub_z[0] > NEAR:
            emblem = self._emblem_masks(hub_px[0], hub_z[0], emblem_a)
            if emblem:
                sl, sub, m, rim = emblem
                g[sl] += (rim * emblem_a)[..., None] * ICE_WHITE * 0.75
        img += g
        small = cv2.resize(g, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        tiny = cv2.resize(small, (W // 16, H // 16), interpolation=cv2.INTER_AREA)
        b1 = cv2.GaussianBlur(small, (0, 0), 2.2 * self.S)
        b2 = cv2.GaussianBlur(small, (0, 0), 7.0 * self.S)
        b3 = cv2.GaussianBlur(tiny, (0, 0), 6.0 * self.S)
        bloom = (
            cv2.resize(b1, (W, H)) * 1.0
            + cv2.resize(b2, (W, H)) * 0.85
            + cv2.resize(b3, (W, H)) * 1.0
        )
        img += bloom * gain
        if emblem:
            # 校徽實體擋在光核前：藍色本體＋鏤空處透出背光，輪廓呈金白光
            sl, sub, m, rim = emblem
            yy = np.linspace(1.0, 0.0, m.shape[0], dtype=np.float32)[:, None, None]
            fill = NTUST_BLUE * (0.78 + 0.45 * yy)
            occ = (m * emblem_a * 0.95)[..., None]
            region = img[sl]
            img[sl] = region * (1 - occ) + fill * occ + (rim * emblem_a)[..., None] * GOLD * 0.45
        return img

    def _emblem_masks(self, center, z, alpha):
        """臺科大校徽（面向鏡頭）：回傳畫面切片與本體、輪廓遮罩，本體由中心向外顯現。"""
        size = min(self.F * 1.2 / z * (1 + 0.12 * (1 - alpha)), self.H * 2.2)
        h = max(8, int(size))
        w = max(8, int(size * self.emblem.shape[1] / self.emblem.shape[0]))
        m = cv2.resize(self.emblem, (w, h), interpolation=cv2.INTER_CUBIC)
        m = smoothstep(0.35, 0.65, m).astype(np.float32)  # 放大後重新銳化二值邊緣
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 2))
        reveal = smoothstep(0.0, 0.18, alpha * 1.25 - r * 0.55).astype(np.float32)
        k = max(3, int(size * 0.022)) | 1
        rim = cv2.morphologyEx(m, cv2.MORPH_GRADIENT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
        m, rim = m * reveal, rim * reveal
        x0, y0 = int(center[0] - w / 2), int(center[1] - h / 2)
        X0, Y0 = max(0, x0), max(0, y0)
        X1, Y1 = min(self.W, x0 + w), min(self.H, y0 + h)
        if X1 <= X0 or Y1 <= Y0:
            return None
        sub = (slice(Y0 - y0, Y1 - y0), slice(X0 - x0, X1 - x0))
        return (slice(Y0, Y1), slice(X0, X1)), sub, m[sub], rim[sub]

    def _sub_polyline(self, pts, L, a, b):
        if b <= a:
            return np.empty((0, pts.shape[1]))
        out = []
        for i in range(len(pts) - 1):
            s0, s1 = L[i], L[i + 1]
            if s1 < a or s0 > b or s1 == s0:
                continue
            p0 = pts[i] + (pts[i + 1] - pts[i]) * (max(a, s0) - s0) / (s1 - s0)
            p1 = pts[i] + (pts[i + 1] - pts[i]) * (min(b, s1) - s0) / (s1 - s0)
            if not out:
                out.append(p0)
            out.append(p1)
        return np.array(out)

    def _factory(self, sharp, glow, f, h, cam, alpha):
        R = rot_y(-f["rot"])
        hw, hd = f["w"] / 2, f["d"] / 2
        base = np.array([[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd]])
        top = base + [0, h, 0]
        B = f["c"] + base @ R.T
        T = f["c"] + top @ R.T
        edge = self.c255(STEEL, 0.85 * alpha)
        for i in range(4):
            self.segment(sharp, B[i], B[(i + 1) % 4], cam, edge, 1)
            self.segment(sharp, B[i], T[i], cam, edge, 1)
        if f["saw"]:
            # 鋸齒屋頂：一眼可辨識的工廠輪廓
            teeth = 3
            for k in range(teeth):
                x0 = -hw + 2 * hw * k / teeth
                x1 = -hw + 2 * hw * (k + 1) / teeth
                for zz in (-hd, hd):
                    tri = np.array([[x0, h, zz], [x1, h + 0.16, zz], [x1, h, zz]])
                    self.polyline(glow, f["c"] + tri @ R.T, cam, self.c255(GOLD, 0.55 * alpha), 1)
                ridge = np.array([[x1, h + 0.16, -hd], [x1, h + 0.16, hd]])
                self.segment(sharp, *(f["c"] + ridge @ R.T), cam, edge, 1)
            self.segment(sharp, T[0], T[3], cam, edge, 1)
            self.segment(sharp, T[1], T[2], cam, edge, 1)
        else:
            for i in range(4):
                self.segment(glow, T[i], T[(i + 1) % 4], cam, self.c255(GOLD, 0.5 * alpha), 1)
            stack = np.array([[hw * 0.5, h, 0], [hw * 0.5, h + 0.45, 0]])
            self.segment(sharp, *(f["c"] + stack @ R.T), cam, edge, 1)
        # 樓層線
        for k in range(1, 4):
            y = h * k / 4
            fl = base + [0, y, 0]
            Fl = f["c"] + fl @ R.T
            self.polyline(sharp, Fl, cam, self.c255(STEEL, 0.3 * alpha), 1, True)

    def _particles(self, glow, t, cam):
        appear = smoothstep(6.2, 8.0, t)
        if appear <= 0:
            return
        drift = rot_y(0.05 * (t - 6.0))
        p_drift = HUB + (self.p0 - HUB) @ drift.T
        prog = np.clip((t - self.p_start) / self.p_dur, 0, 1)
        e = prog * prog * (3 - 2 * prog)
        pos = np.empty_like(p_drift)
        prev = np.empty_like(p_drift)
        for arr, tt, ee in ((pos, t, e), (prev, t - 0.06, None)):
            if ee is None:
                pp = np.clip((tt - self.p_start) / self.p_dur, 0, 1)
                ee = pp * pp * (3 - 2 * pp)
            ang = self.p_swirl * ee
            c, s = np.cos(ang), np.sin(ang)
            rel = p_drift - HUB
            rx = rel[:, 0] * c + rel[:, 2] * s
            rz = -rel[:, 0] * s + rel[:, 2] * c
            k = (1 - ee) ** 1.3
            arr[:, 0] = HUB[0] + rx * k
            arr[:, 1] = HUB[1] + rel[:, 1] * k
            arr[:, 2] = HUB[2] + rz * k
        alive = e < 0.985
        twinkle = 0.55 + 0.45 * np.sin(t * 2.2 + self.p_twinkle)
        brightness = appear * np.where(prog > 0, 1.0, twinkle) * alive
        pts, z = self.project(pos, cam)
        ppts, pz = self.project(prev, cam)
        for i in np.nonzero((brightness > 0.02) & (z > NEAR) & (pz > NEAR))[0]:
            col = GOLD if self.p_gold[i] else ICE_WHITE
            colt = self.c255(col, 0.85 * float(brightness[i]))
            if 0 < prog[i] < 1:
                cv2.line(glow, tuple(self._px(ppts[i])), tuple(self._px(pts[i])), self.c255(col, 0.55 * float(brightness[i])), 1, cv2.LINE_AA, 4)
            r = max(1.1 * self.S, self.F * 0.010 / z[i])
            cv2.circle(glow, tuple(self._px(pts[i])), int(r * 16), colt, -1, cv2.LINE_AA, 4)

    # ---- 輸出 ---------------------------------------------------------------

    @staticmethod
    def tonemap(img: np.ndarray) -> np.ndarray:
        knee = 0.82
        over = np.maximum(img - knee, 0)
        return np.minimum(img, knee) + (1 - knee) * (1 - np.exp(-over / (1 - knee)))

    def frame(self, t: float) -> np.ndarray:
        img = self.tonemap(self.render(t))
        if self.variant == "loop":
            # 最後 2.6 秒穿入光核並淡回第 0 秒畫面，形成無縫循環
            b = float(smoothstep(12.4, 15.0, t))
            if b > 0:
                img = img * (1 - b) + self.tonemap(self.render(t - DURATION)) * b
        else:
            img = self._brand_compose(img, t)
        rng = np.random.default_rng(int(t * FPS) + 1)
        img = img + rng.uniform(-0.5, 0.5, img.shape).astype(np.float32) / 255.0  # 抖色，避免暗部色階斷層
        return np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8)

    def _brand_compose(self, img, t):
        b = self.brand
        if t < 12.2:
            return img
        cam = self.cam.at(t)
        hub_px, _ = self.project(np.array([HUB]), cam)
        diag = math.hypot(self.W, self.H)
        r = float(ease("in", (t - 12.2) / 0.85)) * diag * 1.1
        soft = 260 * self.S
        d = np.hypot(self.qx - hub_px[0, 0], self.qy - hub_px[0, 1])
        m = 1 - smoothstep(r - soft, r, d)
        rim = np.exp(-(((d - r) / (soft * 0.35)) ** 2)) * (r > 0) * (1 - float(smoothstep(12.9, 13.1, t)))
        m = cv2.resize(m.astype(np.float32), (self.W, self.H))[..., None]
        rim = cv2.resize(rim.astype(np.float32), (self.W, self.H))[..., None]
        out = img * (1 - m) + b["card"] * m + GOLD * rim * 0.35
        for layer in b["layers"]:
            a = float(ease("out", (t - layer["t0"]) / (layer["t1"] - layer["t0"])))
            if a <= 0:
                continue
            lift = int(round((1 - a) * 14 * self.S))
            y0 = layer["y"] + lift
            src = layer["img"]
            h = min(src.shape[0], self.H - y0)
            if h <= 0:
                continue
            alpha = src[:h, :, 3:4] * a
            region = out[y0 : y0 + h]
            out[y0 : y0 + h] = region * (1 - alpha) + src[:h, :, :3] * alpha
        return out


# ---------------------------------------------------------------------------
# 多行程渲染
# ---------------------------------------------------------------------------


def write_image(path: Path, img: np.ndarray, params: list[int] | None = None) -> None:
    """支援非 ASCII 路徑的影像輸出（cv2.imwrite 在 Windows 無法處理中文路徑）。"""
    ok, buf = cv2.imencode(path.suffix, img, params or [])
    if not ok:
        sys.exit(f"無法編碼影像：{path}")
    buf.tofile(str(path))

_SCENE: Scene | None = None


def _init(variant, w, h, font):
    global _SCENE
    _SCENE = Scene(variant, w, h, font)


def _render_index(i: int) -> bytes:
    assert _SCENE is not None
    return _SCENE.frame(i / FPS).tobytes()


def _render_time(t: float) -> np.ndarray:
    assert _SCENE is not None
    return _SCENE.frame(t)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variant", choices=["loop", "brand"], default="loop")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--out", type=Path, help="輸出 MP4 路徑")
    ap.add_argument("--poster", type=Path, help="輸出封面 JPG（loop 版預設 media/videos/hero-poster.jpg）")
    ap.add_argument("--crf", type=int, default=24)
    ap.add_argument("--font", help="中文字型路徑（brand 版）")
    # 每個行程約佔 300 MB，預設上限 8 以免記憶體不足
    ap.add_argument("--workers", type=int, default=max(1, min(8, (os.cpu_count() or 4) - 2)))
    ap.add_argument("--preview", help="只輸出指定秒數的靜態格，例如 0,4,8,12")
    ap.add_argument("--preview-dir", type=Path, default=Path("video-preview"))
    args = ap.parse_args()

    init = (args.variant, args.width, args.height, args.font)
    # 先在主行程建立一次場景：字型或素材缺漏時立即報錯，而非讓 worker 卡住
    for asset in (LOGO_PATH, SYMBOL_PATH):
        if not asset.exists():
            sys.exit(f"找不到素材：{asset}")
    _init(*init)

    if args.preview:
        times = [float(x) for x in args.preview.split(",")]
        args.preview_dir.mkdir(parents=True, exist_ok=True)
        with Pool(min(args.workers, len(times)), _init, init) as pool:
            frames = pool.map(_render_time, times)
        thumbs = []
        for t, f in zip(times, frames):
            write_image(args.preview_dir / f"{args.variant}_{t:05.2f}.png", f)
            th = cv2.resize(f, (640, 360), interpolation=cv2.INTER_AREA)
            cv2.putText(th, f"{t:.2f}s", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
            thumbs.append(th)
        cols = 3
        while len(thumbs) % cols:
            thumbs.append(np.zeros_like(thumbs[0]))
        sheet = np.vstack([np.hstack(thumbs[i : i + cols]) for i in range(0, len(thumbs), cols)])
        write_image(args.preview_dir / f"{args.variant}_sheet.jpg", sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(f"preview → {args.preview_dir.resolve()}")
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("找不到 ffmpeg，請先安裝並加入 PATH。")
    out = args.out or (VIDEO_DIR / "hero-bg.mp4" if args.variant == "loop" else MEDIA_DIR / "emrd-brand-15s.mp4")
    out.parent.mkdir(parents=True, exist_ok=True)
    # 先輸出暫存檔，成功後才替換，避免渲染失敗時覆蓋既有影片
    tmp = out.with_name(out.stem + ".partial" + out.suffix)
    n = int(DURATION * FPS)
    cmd = [
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{args.width}x{args.height}", "-r", str(FPS), "-i", "-",
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

    # 網站未使用此封面（Hero 於影片載入前顯示靜態照片），預設輸出到 media/
    poster = args.poster or (MEDIA_DIR / "hero-poster.jpg" if args.variant == "loop" else None)
    if poster:
        poster.parent.mkdir(parents=True, exist_ok=True)
        write_image(poster, _render_time(0.0), [cv2.IMWRITE_JPEG_QUALITY, 82])
        print(f"poster → {poster}")


if __name__ == "__main__":
    main()
