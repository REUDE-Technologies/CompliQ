"""Reads what the size and time fields need from a drone photo: EXIF capture time and focal
length, and DJI XMP values (laser range distance, relative altitude) when the camera has them."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from PIL import Image

_EXIF_IFD = 0x8769
_TAG_MAKE, _TAG_MODEL, _TAG_DATETIME = 271, 272, 306
_TAG_DT_ORIGINAL, _TAG_OFFSET_ORIGINAL, _TAG_SUBSEC_ORIGINAL = 36867, 36881, 37521
_TAG_FOCAL = 37386


def _xmp_value(xmp: str, name: str) -> str | None:
    # attribute form: drone-dji:Name="12.3"   element form: <drone-dji:Name>12.3</drone-dji:Name>
    m = re.search(rf'drone-dji:{name}="([^"]*)"', xmp) or re.search(
        rf"<drone-dji:{name}>([^<]*)</drone-dji:{name}>", xmp)
    return m.group(1).strip() if m else None


def _xmp_float(xmp: str, name: str) -> float | None:
    v = _xmp_value(xmp, name)
    try:
        return float(v) if v not in (None, "") else None
    except ValueError:
        return None


def read_xmp(path: Path, max_bytes: int = 512 * 1024) -> str:
    """DJI writes its XMP packet near the start of the JPEG, so a prefix read is enough."""
    try:
        with open(path, "rb") as f:
            head = f.read(max_bytes)
    except OSError:
        return ""
    start = head.find(b"<x:xmpmeta")
    if start < 0:
        return ""
    end = head.find(b"</x:xmpmeta>", start)
    return head[start:end + 12 if end > 0 else len(head)].decode("utf-8", "ignore")


def _parse_offset(text: str | None, fallback: str) -> timezone:
    for candidate in (text, fallback):
        m = re.match(r"^\s*([+-])(\d{2}):?(\d{2})\s*$", candidate or "")
        if m:
            sign = 1 if m.group(1) == "+" else -1
            return timezone(sign * timedelta(hours=int(m.group(2)), minutes=int(m.group(3))))
    return timezone.utc


def read_meta(path: Path, default_tz: str = "+05:30") -> dict[str, Any]:
    """Returns captured_at (ISO 8601 with offset or None), focal_length_mm, camera make/model,
    lrf_distance_m, relative_altitude_m and gimbal_pitch_deg (None when absent)."""
    meta: dict[str, Any] = {"captured_at": None, "focal_length_mm": None, "make": None, "model": None,
                            "lrf_distance_m": None, "relative_altitude_m": None, "gimbal_pitch_deg": None}
    try:
        with Image.open(path) as im:
            exif = im.getexif()
            sub = exif.get_ifd(_EXIF_IFD) if exif else {}
            meta["make"] = (exif.get(_TAG_MAKE) or "").strip() or None
            meta["model"] = (exif.get(_TAG_MODEL) or "").strip() or None
            raw_dt = sub.get(_TAG_DT_ORIGINAL) or exif.get(_TAG_DATETIME)
            if raw_dt:
                try:
                    dt = datetime.strptime(str(raw_dt).strip(), "%Y:%m:%d %H:%M:%S")
                    sub_s = str(sub.get(_TAG_SUBSEC_ORIGINAL) or "").strip()
                    if sub_s.isdigit():
                        dt = dt.replace(microsecond=int(sub_s.ljust(6, "0")[:6]))
                    dt = dt.replace(tzinfo=_parse_offset(sub.get(_TAG_OFFSET_ORIGINAL), default_tz))
                    meta["captured_at"] = dt.isoformat(timespec="seconds")
                except ValueError:
                    pass
            focal = sub.get(_TAG_FOCAL)
            if focal:
                try:
                    meta["focal_length_mm"] = round(float(focal), 3) or None
                except (TypeError, ValueError, ZeroDivisionError):
                    pass
    except Exception:
        return meta
    xmp = read_xmp(path)
    if xmp:
        lrf = _xmp_float(xmp, "LRFTargetDistance")
        status = (_xmp_value(xmp, "LRFStatus") or "Normal").lower()
        if lrf and lrf > 0 and status in ("normal", "1", "true"):
            meta["lrf_distance_m"] = lrf
        meta["relative_altitude_m"] = _xmp_float(xmp, "RelativeAltitude")
        meta["gimbal_pitch_deg"] = _xmp_float(xmp, "GimbalPitchDegree")
    return meta


def mm_per_px(distance_m: float | None, focal_length_mm: float | None, sensor_width_mm: float | None,
              long_edge_px: int) -> float | None:
    """ML spec step 7: distance_to_blade_mm x sensor_width_mm / (focal_length_mm x image_width_px).
    Uses the sensor's long side against the photo's long edge, so rotated photos work too."""
    if not distance_m or not focal_length_mm or not sensor_width_mm or not long_edge_px:
        return None
    return round(distance_m * 1000.0 * sensor_width_mm / (focal_length_mm * long_edge_px), 4)
