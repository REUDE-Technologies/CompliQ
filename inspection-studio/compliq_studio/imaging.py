"""Image helpers: load a photo the same way the model sees it, export the clean WebP (ML spec step 9),
and draw annotated QA copies (never uploaded)."""
from __future__ import annotations

import hashlib
import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

from PIL import Image, ImageDraw, ImageFont, ImageOps

CAT_COLOURS = {1: "#2F6FB3", 2: "#2E9D58", 3: "#C99A06", 4: "#E07B2E", 5: "#D03B3B"}  # backend severity_levels
CAT_NAMES = {1: "Cosmetic", 2: "Minor", 3: "Moderate", 4: "Serious", 5: "Critical"}


def load_rgb(path: str | Path) -> Image.Image:
    """Applies the EXIF orientation first, so the model, the WebP and the box fractions all use
    the same upright frame."""
    with Image.open(path) as im:
        upright = ImageOps.exif_transpose(im)
        return upright.convert("RGB")


def sha256_file(path: str | Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _scaled(img: Image.Image, long_edge: int) -> Image.Image:
    w, h = img.size
    scale = long_edge / max(w, h)
    if scale >= 1:
        return img
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)


def export_webp(img: Image.Image, out_path: str | Path, long_edge: int = 1600, quality: int = 80,
                max_bytes: int = 2_000_000) -> dict[str, Any]:
    """Whole frame, never cropped. Steps quality down only if the file would pass the Worker's 2 MB limit."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    small = _scaled(img, long_edge)
    tmp = out_path.with_suffix(".webp.tmp")
    used = quality
    for q in [quality] + [q for q in (75, 70, 60, 50, 40) if q < quality]:
        small.save(tmp, "WEBP", quality=q, method=6)
        used = q
        if tmp.stat().st_size <= max_bytes:
            break
    os.replace(tmp, out_path)
    size = out_path.stat().st_size
    if size > max_bytes:
        raise ValueError(f"WebP is {size} bytes even at quality {used}; the Worker refuses files over {max_bytes}")
    return {"width": small.size[0], "height": small.size[1], "bytes": size,
            "sha256": sha256_file(out_path), "quality": used}


@lru_cache(maxsize=16)
def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("DejaVuSans-Bold.ttf", "arialbd.ttf", "Arial Bold.ttf", "DejaVuSans.ttf", "arial.ttf",
                 "Arial.ttf", "Helvetica.ttc"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # Pillow < 10.1
        return ImageFont.load_default()


def _hex(c: str) -> tuple[int, int, int]:
    c = c.lstrip("#")
    return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)


def render_annotated(img: Image.Image, detections: Iterable[dict], labels: dict[str, str], out_path: str | Path,
                     long_edge: int = 2400, footer: str = "", removed: Iterable[dict] = ()) -> Path:
    """Draws every kept detection (CAT colour) and, dashed in grey, any the reviewer removed."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas = _scaled(img, long_edge).copy()
    w, h = canvas.size
    draw = ImageDraw.Draw(canvas)
    line = max(2, round(max(w, h) / 450))
    font = _font(max(14, round(max(w, h) / 85)))

    def box_px(d: dict) -> tuple[int, int, int, int]:
        b = d["bbox"]
        return (round(b["x_min"] * w), round(b["y_min"] * h), round(b["x_max"] * w), round(b["y_max"] * h))

    for d in removed:
        x0, y0, x1, y1 = box_px(d)
        dash = line * 4
        for x in range(x0, x1, dash * 2):
            draw.line([(x, y0), (min(x + dash, x1), y0)], fill=(160, 160, 160), width=line)
            draw.line([(x, y1), (min(x + dash, x1), y1)], fill=(160, 160, 160), width=line)
        for y in range(y0, y1, dash * 2):
            draw.line([(x0, y), (x0, min(y + dash, y1))], fill=(160, 160, 160), width=line)
            draw.line([(x1, y), (x1, min(y + dash, y1))], fill=(160, 160, 160), width=line)

    for i, d in enumerate(detections, start=1):
        colour = _hex(CAT_COLOURS.get(int(d.get("severity_suggested") or 1), "#888888"))
        x0, y0, x1, y1 = box_px(d)
        draw.rectangle([x0, y0, x1, y1], outline=colour, width=line)
        text = f"{i}  {labels.get(d['class'], d['class'])}  {d['confidence']:.2f}  CAT {d['severity_suggested']}"
        tb = draw.textbbox((0, 0), text, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
        pad = max(3, line * 2)
        ty = y0 - th - 2 * pad if y0 - th - 2 * pad >= 0 else y0
        tx = min(max(0, x0 - line // 2), max(0, w - tw - 2 * pad))
        draw.rectangle([tx, ty, tx + tw + 2 * pad, ty + th + 2 * pad], fill=colour)
        draw.text((tx + pad - tb[0], ty + pad - tb[1]), text, fill=(255, 255, 255), font=font)

    if footer:
        fh = round(font.size * 1.9) if hasattr(font, "size") else 28
        bar = Image.new("RGB", (w, h + fh), (17, 24, 39))
        bar.paste(canvas, (0, 0))
        bd = ImageDraw.Draw(bar)
        tb = bd.textbbox((0, 0), footer, font=font)
        bd.text((round(fh * 0.4), h + (fh - (tb[3] - tb[1])) // 2 - tb[1]), footer, fill=(229, 231, 235), font=font)
        canvas = bar
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    canvas.save(tmp, "JPEG", quality=88)
    os.replace(tmp, out_path)
    return out_path
