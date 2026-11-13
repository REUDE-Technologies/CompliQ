"""Synthetic inspection photos for trying the app before real data and model.pt are ready.

Makes the 14 folders (12 blade sides x 20 photos, nacelle, tower) with drone-style EXIF/XMP and, next to
each photo, a <photo>.truth.json that the demo model replays. The pictures are drawings, not real blades.
"""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from .scheme import BLADES, SIDES

CLASSES = ["leading_edge_erosion", "coating_gelcoat_damage", "crack", "trailing_edge_split",
           "lightning_damage", "delamination"]
SAMPLE_CAMERA = {"focal_length_mm": 30.0, "sensor_width_mm": 7.6}  # zoom camera; EXIF carries the focal length


def _xmp(lrf_m: float | None, alt_m: float) -> bytes:
    lrf = f' drone-dji:LRFTargetDistance="{lrf_m:.2f}" drone-dji:LRFStatus="Normal"' if lrf_m else ""
    return (f'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            f'<rdf:Description xmlns:drone-dji="http://www.dji.com/drone-dji/1.0/"{lrf}'
            f' drone-dji:RelativeAltitude="+{alt_m:.2f}" drone-dji:GimbalPitchDegree="-5.0"/>'
            f"</rdf:RDF></x:xmpmeta>").encode()


_GRID: dict[tuple[int, int], tuple[np.ndarray, np.ndarray, np.ndarray]] = {}


def _grid(w: int, h: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if (w, h) not in _GRID:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        noise = np.random.default_rng(1).normal(0, 2.0, (h, w, 1)).astype(np.float32)
        _GRID[(w, h)] = (yy, xx, noise)
    return _GRID[(w, h)]


def _sky(w: int, h: int, rng: random.Random) -> np.ndarray:
    top = np.array([70 + rng.randint(-10, 10), 120 + rng.randint(-10, 10), 185 + rng.randint(-10, 10)], np.float32)
    bottom = np.array([175, 205, 232], np.float32)
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    noise = np.roll(_grid(w, h)[2], rng.randint(0, w), axis=1)
    return np.clip(top * (1 - t) + bottom * t + noise, 0, 255)


def _band_mask(w: int, h: int, angle: float, centre: float, width: float) -> tuple[np.ndarray, np.ndarray]:
    yy, xx, _ = _grid(w, h)
    nx, ny = -math.sin(angle), math.cos(angle)
    d = (xx - w / 2) * nx + (yy - centre) * ny  # signed distance from the band's centre line
    return np.abs(d) <= width / 2, d / (width / 2)


def _blade_photo(w: int, h: int, side: str, point: int, rng: random.Random):
    img = _sky(w, h, rng)
    taper = 1 - 0.45 * (point - 1) / 19
    width = h * (0.62 if side in ("SS", "PS") else 0.34) * taper
    angle = math.radians(rng.uniform(-6, 6))
    centre = h / 2 + rng.uniform(-0.06, 0.06) * h
    inside, t = _band_mask(w, h, angle, centre, width)
    base = np.array([236, 237, 233], np.float32)
    shade = 1 - 0.18 * np.clip(t, -1, 1) ** 2 if side in ("SS", "PS") else 1 - 0.30 * np.abs(np.clip(t, -1, 1))
    blade = base[None, None, :] * shade[..., None]
    img = np.where(inside[..., None], blade, img)
    if side == "TE":  # dark trailing-edge line on one side of the band
        edge = inside & (t > 0.86)
        img[edge] = img[edge] * 0.62
    return Image.fromarray(img.astype(np.uint8)), (angle, centre, width)


def _point_on_band(w, h, geom, rng, along=None, across=None):
    angle, centre, width = geom
    s = (along if along is not None else rng.uniform(0.15, 0.85)) * w
    a = (across if across is not None else rng.uniform(-0.55, 0.55)) * width / 2
    x = s + a * -math.sin(angle)
    y = centre + (s - w / 2) * math.tan(angle) + a * math.cos(angle)
    return x, y


def _draw_defect(img: Image.Image, cls: str, w: int, h: int, geom, rng: random.Random) -> list[float]:
    d = ImageDraw.Draw(img)
    scale = w / 2000
    if cls == "crack":
        x, y = _point_on_band(w, h, geom, rng)
        pts = [(x, y)]
        for _ in range(rng.randint(7, 12)):
            x += rng.uniform(18, 34) * scale
            y += rng.uniform(-16, 16) * scale
            pts.append((x, y))
        d.line(pts, fill=(55, 52, 50), width=max(2, int(4 * scale)))
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        box = [min(xs), min(ys), max(xs), max(ys)]
    elif cls == "leading_edge_erosion":
        x0, y0 = _point_on_band(w, h, geom, rng, across=rng.choice([-0.75, 0.75]))
        span = rng.uniform(160, 380) * scale
        xs, ys = [], []
        for _ in range(rng.randint(30, 60)):
            cx, cy = x0 + rng.uniform(0, span), y0 + rng.uniform(-28, 28) * scale
            r = rng.uniform(3, 10) * scale
            g = rng.randint(95, 140)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(g, g - 6, g - 10))
            xs += [cx - r, cx + r]
            ys += [cy - r, cy + r]
        box = [min(xs), min(ys), max(xs), max(ys)]
    elif cls == "coating_gelcoat_damage":
        cx, cy = _point_on_band(w, h, geom, rng)
        r = rng.uniform(45, 120) * scale
        pts = [(cx + r * rng.uniform(0.6, 1.0) * math.cos(a), cy + r * 0.7 * rng.uniform(0.6, 1.0) * math.sin(a))
               for a in np.linspace(0, 2 * math.pi, 14, endpoint=False)]
        d.polygon(pts, fill=(205, 200, 188), outline=(150, 142, 128))
        xs, ys = [p[0] for p in pts], [p[1] for p in pts]
        box = [min(xs), min(ys), max(xs), max(ys)]
    elif cls == "trailing_edge_split":
        angle, centre, width = geom
        x, y = _point_on_band(w, h, geom, rng, across=0.93)
        ln, gap = rng.uniform(140, 320) * scale, rng.uniform(14, 26) * scale
        poly = [(x, y), (x + ln, y + ln * math.tan(angle) - gap), (x + ln, y + ln * math.tan(angle) + gap)]
        d.polygon(poly, fill=(40, 42, 48))
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        box = [min(xs), min(ys) - 4 * scale, max(xs), max(ys) + 4 * scale]
    elif cls == "lightning_damage":
        cx, cy = _point_on_band(w, h, geom, rng)
        r = rng.uniform(30, 70) * scale
        for i in range(6, 0, -1):
            g = 25 + i * 18
            rr = r * i / 6
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(g + 10, g, g - 5 if g > 5 else 0))
        for a in np.linspace(0, 2 * math.pi, 9, endpoint=False):
            d.line([(cx, cy), (cx + 1.6 * r * math.cos(a), cy + 1.6 * r * math.sin(a))], fill=(60, 50, 45),
                   width=max(2, int(3 * scale)))
        box = [cx - 1.6 * r, cy - 1.6 * r, cx + 1.6 * r, cy + 1.6 * r]
    else:  # delamination
        cx, cy = _point_on_band(w, h, geom, rng)
        rx, ry = rng.uniform(70, 170) * scale, rng.uniform(35, 70) * scale
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(214, 212, 203), outline=(170, 166, 156),
                  width=max(2, int(3 * scale)))
        d.arc([cx - rx * 0.8, cy - ry * 0.7, cx + rx * 0.8, cy + ry * 0.5], 200, 340, fill=(250, 250, 248),
              width=max(2, int(4 * scale)))
        box = [cx - rx, cy - ry, cx + rx, cy + ry]
    x0, y0, x1, y1 = box
    pad = 6 * scale
    return [max(0, (x0 - pad) / w), max(0, (y0 - pad) / h), min(1, (x1 + pad) / w), min(1, (y1 + pad) / h)]


def _plan_defects(rng: random.Random) -> dict[tuple[int, str, int], list[str]]:
    plan: dict[tuple[int, str, int], list[str]] = {}
    for b in BLADES:
        for s in SIDES:
            for p in range(1, 21):
                if rng.random() < 0.10:
                    if s == "TE":
                        cls = rng.choice(["trailing_edge_split", "crack", "coating_gelcoat_damage"])
                    elif s == "LE":
                        cls = rng.choice(["leading_edge_erosion", "leading_edge_erosion", "coating_gelcoat_damage"])
                    elif p >= 15:
                        cls = rng.choice(["lightning_damage", "crack", "delamination"])
                    else:
                        cls = rng.choice(["coating_gelcoat_damage", "crack", "delamination"])
                    plan[(b, s, p)] = [cls]
    # make sure every class shows up at least once
    plan[(1, "TE", 7)] = ["trailing_edge_split"]
    plan[(1, "LE", 3)] = ["leading_edge_erosion"]
    plan[(2, "SS", 18)] = ["lightning_damage"]
    plan[(2, "PS", 11)] = ["delamination", "crack"]
    plan[(3, "SS", 5)] = ["coating_gelcoat_damage"]
    return plan


def _save(img: Image.Image, path: Path, when: datetime, lrf: float | None, alt: float, truth: list[dict]) -> None:
    exif = Image.Exif()
    exif[271], exif[272] = "DJI", "ZH20T"
    ifd = exif.get_ifd(0x8769)
    ifd[36867] = when.strftime("%Y:%m:%d %H:%M:%S")
    ifd[36881] = "+05:30"
    ifd[37386] = SAMPLE_CAMERA["focal_length_mm"]
    img.save(path, "JPEG", quality=88, exif=exif, xmp=_xmp(lrf, alt))
    path.with_name(path.name + ".truth.json").write_text(json.dumps({"detections": truth}, indent=1))


def _component_photo(w: int, h: int, kind: str, rng: random.Random) -> tuple[Image.Image, tuple[float, float]]:
    """Returns the photo and a spot on the structure where a defect can go."""
    img = Image.fromarray(_sky(w, h, rng).astype(np.uint8))
    d = ImageDraw.Draw(img)
    if kind == "nacelle":
        x0, y0 = w * rng.uniform(0.12, 0.2), h * rng.uniform(0.3, 0.38)
        d.rounded_rectangle([x0, y0, w * 0.86, h * 0.68], radius=int(h * 0.05), fill=(226, 228, 226),
                            outline=(170, 172, 170), width=4)
        d.ellipse([w * 0.03, h * 0.36, w * 0.2, h * 0.64], fill=(236, 237, 234), outline=(165, 165, 160), width=4)
        d.rectangle([w * 0.5, h * 0.68, w * 0.58, h], fill=(214, 216, 214))
        anchor = (w * rng.uniform(0.35, 0.7), h * 0.5)
    else:
        top, bottom = w * 0.05, w * 0.09
        cx = w * rng.uniform(0.42, 0.58)
        d.polygon([(cx - top, 0), (cx + top, 0), (cx + bottom, h), (cx - bottom, h)], fill=(228, 229, 226))
        d.line([(cx - top * 0.3, 0), (cx - bottom * 0.3, h)], fill=(240, 241, 238), width=6)
        anchor = (cx + w * 0.015, h * rng.uniform(0.35, 0.65))
    return img, anchor


def _patch(img: Image.Image, cx: float, cy: float, w: int, h: int, rng: random.Random) -> list[float]:
    d = ImageDraw.Draw(img)
    r = rng.uniform(40, 70) * w / 2000
    pts = [(cx + r * rng.uniform(0.6, 1.0) * math.cos(a), cy + r * 0.8 * rng.uniform(0.6, 1.0) * math.sin(a))
           for a in np.linspace(0, 2 * math.pi, 12, endpoint=False)]
    d.polygon(pts, fill=(200, 194, 182), outline=(148, 140, 126))
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    pad = 6 * w / 2000
    return [max(0, (min(xs) - pad) / w), max(0, (min(ys) - pad) / h), min(1, (max(xs) + pad) / w),
            min(1, (max(ys) + pad) / h)]


def make_sample(out_dir: str | Path, turbine: str = "WTG-001", date: str = "2026-11-04", size=(2000, 1500),
                nacelle: int = 8, tower: int = 10, seed: int = 7, progress=None) -> Path:
    """progress(done, total) is called after each photo."""
    rng = random.Random(seed)
    total = 240 + nacelle + tower
    w, h = size
    root = Path(out_dir) / f"{turbine}_{date}_photos"
    root.mkdir(parents=True, exist_ok=True)
    when = datetime.fromisoformat(f"{date}T10:30:00")
    plan = _plan_defects(rng)
    shot = 0
    for b in BLADES:
        for s in SIDES:
            folder = root / f"B{b}-{s}"
            folder.mkdir(exist_ok=True)
            for p in range(1, 21):
                shot += 1
                when += timedelta(seconds=rng.randint(2, 4))
                img, geom = _blade_photo(w, h, s, p, rng)
                truth = []
                for cls in plan.get((b, s, p), []):
                    box = _draw_defect(img, cls, w, h, geom, rng)
                    truth.append({"class": cls, "bbox": [round(v, 4) for v in box],
                                  "confidence": round(rng.uniform(0.48, 0.95), 3)})
                if rng.random() < 0.05:  # a weak box the class threshold should drop
                    x, y = _point_on_band(w, h, geom, rng)
                    truth.append({"class": "crack", "bbox": [round(x / w, 4), round(y / h, 4),
                                                             round(min(1, x / w + 0.05), 4),
                                                             round(min(1, y / h + 0.03), 4)], "confidence": 0.18})
                if (b, s, p) == (2, "LE", 9):  # a class the model knows but the dashboard does not
                    truth.append({"class": "bird", "bbox": [0.05, 0.05, 0.12, 0.11], "confidence": 0.7})
                img = img.filter(ImageFilter.SMOOTH)
                lrf = None if b == 3 else round(rng.uniform(8.5, 11.5), 2)  # blade 3: no laser range
                name = f"DJI_{when.strftime('%Y%m%d%H%M%S')}_{shot:04d}_Z.JPG"
                _save(img, folder / name, when, lrf, 80 + p * 0.4, truth)
                if progress:
                    progress(shot, total)
    for kind, count in (("nacelle", nacelle), ("tower", tower)):
        folder = root / kind.upper()
        folder.mkdir(exist_ok=True)
        for i in range(1, count + 1):
            shot += 1
            when += timedelta(seconds=rng.randint(3, 6))
            img, (ax, ay) = _component_photo(w, h, kind, rng)
            truth = []
            if i == 3:
                box = _patch(img, ax, ay, w, h, rng)
                truth.append({"class": "coating_gelcoat_damage", "bbox": [round(v, 4) for v in box],
                              "confidence": 0.74})
            img = img.filter(ImageFilter.SMOOTH)
            alt = 92.0 if kind == "nacelle" else 10 + i * 8
            name = f"DJI_{when.strftime('%Y%m%d%H%M%S')}_{shot:04d}_Z.JPG"
            _save(img, folder / name, when, None, alt, truth)
            if progress:
                progress(shot, total)
    return root
