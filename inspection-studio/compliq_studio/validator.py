"""Package validator — the ML spec's validation rules, which the Upload page and the Worker also apply,
plus the schema 1.1 rules for nacelle and tower. Run it before every upload; fix every error."""
from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from PIL import Image

from .config import Config
from .imaging import sha256_file
from .scheme import (COMPONENTS, EXPECTED_BLADE_POINTS, all_blade_codes, is_ulid, parse_blade_code,
                     parse_component_code, zone_for)

STATUSES = ("inspected", "failed", "unavailable")
MAX_IMAGE_BYTES = 2_000_000
BLADE_KEYS = ["position_code", "blade", "side", "point", "zone", "distance_m", "frame_timestamp_ms", "status",
              "reason", "image", "image_width", "image_height", "mm_per_px", "detections"]


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _check_bbox(b: Any) -> bool:
    try:
        x0, y0, x1, y1 = (float(b[k]) for k in ("x_min", "y_min", "x_max", "y_max"))
    except (TypeError, KeyError, ValueError):
        return False
    return 0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1


def validate_package(pkg_dir: str | Path, cfg: Config, check_images: bool = True,
                     max_component_photos: dict[str, int] | None = None) -> dict[str, Any]:
    pkg = Path(pkg_dir)
    errors: list[str] = []
    warnings: list[str] = []
    stats: dict[str, Any] = {}

    def done() -> dict[str, Any]:
        return {"ok": not errors, "errors": errors, "warnings": warnings, "stats": stats,
                "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}

    if not pkg.is_dir():
        errors.append(f"package folder not found: {pkg}")
        return done()
    extras = sorted(p.name for p in pkg.iterdir() if p.name not in ("manifest.json", "points.json", "images"))
    if extras:
        errors.append(f"package folder must hold only manifest.json, points.json and images/; found {extras}")

    try:
        manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append("manifest.json is missing")
        return done()
    except json.JSONDecodeError as e:
        errors.append(f"manifest.json is not valid JSON: {e}")
        return done()
    try:
        doc = json.loads((pkg / "points.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        errors.append("points.json is missing")
        return done()
    except json.JSONDecodeError as e:
        errors.append(f"points.json is not valid JSON: {e}")
        return done()

    schema = str(manifest.get("schema_version"))
    if schema not in ("1.0", "1.1"):
        errors.append(f"manifest: schema_version must be '1.0' or '1.1', got {manifest.get('schema_version')!r}")
    if not is_ulid(manifest.get("inspection_id")):
        errors.append("manifest: inspection_id must be a ULID")
    if not str(manifest.get("turbine_code") or "").strip():
        errors.append("manifest: turbine_code is empty")
    try:
        dt = datetime.fromisoformat(str(manifest.get("inspection_date")))
        if dt.tzinfo is None:
            errors.append("manifest: inspection_date needs a time-zone offset, e.g. 2026-11-04T10:30:00+05:30")
    except ValueError:
        errors.append("manifest: inspection_date must be ISO 8601, e.g. 2026-11-04T10:30:00+05:30")
    for k in ("model_name", "model_version"):
        if not str(manifest.get(k) or "").strip():
            errors.append(f"manifest: {k} is empty")
    if manifest.get("status") not in ("complete", "partial"):
        errors.append("manifest: status must be 'complete' or 'partial'")
    if manifest.get("expected_point_count") != EXPECTED_BLADE_POINTS:
        errors.append(f"manifest: expected_point_count must be {EXPECTED_BLADE_POINTS}")
    if manifest.get("blade_length_m") is None:
        warnings.append("manifest: blade_length_m is empty, so every distance_m is null")
    elif not _num(manifest.get("blade_length_m")) or manifest["blade_length_m"] <= 0:
        errors.append("manifest: blade_length_m must be a positive number")

    allowed_keys = {"points"} | ({"components"} if schema == "1.1" else set())
    if not isinstance(doc, dict) or "points" not in doc:
        errors.append("points.json must be an object with a 'points' list")
        return done()
    if set(doc) - allowed_keys:
        errors.append(f"points.json: unexpected keys {sorted(set(doc) - allowed_keys)} for schema {schema}")
    points = doc.get("points") or []
    components = doc.get("components") or []

    # ---- blade points -------------------------------------------------------
    codes = [p.get("position_code") for p in points if isinstance(p, dict)]
    if len(points) != EXPECTED_BLADE_POINTS:
        errors.append(f"expected {EXPECTED_BLADE_POINTS} points, got {len(points)}")
    dupes = [c for c, n in Counter(codes).items() if n > 1]
    if dupes:
        errors.append(f"duplicate position codes: {', '.join(map(str, dupes[:10]))}")
    missing = sorted(set(all_blade_codes()) - set(codes))
    if missing:
        errors.append(f"missing position codes: {', '.join(missing[:10])}{' …' if len(missing) > 10 else ''}")

    files = {f.get("path"): f for f in manifest.get("files") or [] if isinstance(f, dict)}
    det_ids: Counter[str] = Counter()
    n_images = n_dets = 0
    any_gap = False
    class_ranges = {c: (d.cat_min, d.cat_max) for c, d in cfg.classes.items()}

    def check_common(rec: dict, code: str) -> None:
        nonlocal n_images, n_dets, any_gap
        status = rec.get("status")
        if status not in STATUSES:
            errors.append(f"{code}: status must be one of {', '.join(STATUSES)}")
            return
        dets = rec.get("detections")
        if not isinstance(dets, list):
            errors.append(f"{code}: detections must be a list")
            dets = []
        if rec.get("mm_per_px") is not None and (not _num(rec["mm_per_px"]) or rec["mm_per_px"] <= 0):
            errors.append(f"{code}: mm_per_px must be a positive number or null")
        if status == "inspected":
            want = f"images/{code}.webp"
            if rec.get("image") != want:
                errors.append(f"{code}: image must be {want}")
            entry = files.get(want)
            path = pkg / want
            if not path.exists():
                errors.append(f"{code}: image file {want} does not exist")
            elif check_images:
                try:
                    with Image.open(path) as im:
                        fmt, size = im.format, im.size
                except Exception:
                    fmt, size = None, None
                if fmt != "WEBP":
                    errors.append(f"{code}: {want} is not a WebP image")
                elif size != (rec.get("image_width"), rec.get("image_height")):
                    errors.append(f"{code}: image is {size[0]}x{size[1]} but the record says "
                                  f"{rec.get('image_width')}x{rec.get('image_height')}")
                nbytes = path.stat().st_size
                if nbytes > MAX_IMAGE_BYTES:
                    errors.append(f"{code}: image is {nbytes} bytes; the Worker refuses images over 2 MB")
                if not entry:
                    errors.append(f"{code}: {want} is not listed in manifest files")
                else:
                    if entry.get("bytes") != nbytes:
                        errors.append(f"{code}: manifest bytes for {want} do not match the file")
                    if entry.get("sha256") != sha256_file(path):
                        errors.append(f"{code}: SHA-256 of {want} does not match the manifest")
            n_images += 1
        else:
            any_gap = True
            if not str(rec.get("reason") or "").strip():
                errors.append(f"{code}: {status} points need a reason")
            if rec.get("image") is not None or rec.get("image_width") is not None or rec.get("image_height") is not None:
                errors.append(f"{code}: {status} points must have no image")
            if dets:
                errors.append(f"{code}: {status} points must have no detections")
        for d in dets:
            n_dets += 1
            did = d.get("detection_id")
            det_ids[did] += 1
            if not is_ulid(did):
                errors.append(f"{code}: detection_id {did!r} is not a ULID")
            elif did == code:
                errors.append(f"{code}: a point's code must not be used as a detection ID")
            cls = d.get("class")
            if cls not in class_ranges:
                errors.append(f"{code}: unknown class {cls}")
                continue
            conf = d.get("confidence")
            if not _num(conf) or not 0 <= conf <= 1:
                errors.append(f"{code}: confidence must be 0-1")
            if not _check_bbox(d.get("bbox")):
                errors.append(f"{code}: invalid bbox")
            lo, hi = class_ranges[cls]
            sev = d.get("severity_suggested")
            if not isinstance(sev, int) or isinstance(sev, bool) or not lo <= sev <= hi:
                errors.append(f"{code}: severity_suggested {sev} is outside {cls}'s CAT {lo}-{hi}")
            for k in ("length_mm", "width_mm"):
                if d.get(k) is not None and (not _num(d[k]) or d[k] < 0):
                    errors.append(f"{code}: {k} must be a number or null")

    for rec in points:
        if not isinstance(rec, dict):
            errors.append("points: every record must be an object")
            continue
        code = str(rec.get("position_code"))
        parsed = parse_blade_code(code)
        if not parsed:
            errors.append(f"{code}: not a blade position code (B1-SS-01 … B3-TE-20)")
            continue
        blade, side, point = parsed
        absent = [k for k in BLADE_KEYS if k not in rec]
        if absent:
            errors.append(f"{code}: missing fields {absent}")
        if set(rec) - set(BLADE_KEYS):
            warnings.append(f"{code}: extra fields {sorted(set(rec) - set(BLADE_KEYS))}")
        if (rec.get("blade"), rec.get("side"), rec.get("point")) != (blade, side, point):
            errors.append(f"{code}: blade/side/point do not agree with the position code")
        if rec.get("zone") != zone_for(point, cfg.severity.zones):
            errors.append(f"{code}: zone {rec.get('zone')!r} does not agree with point {point:02d}")
        if rec.get("distance_m") is not None and not _num(rec.get("distance_m")):
            errors.append(f"{code}: distance_m must be a number or null")
        check_common(rec, code)
        for d in rec.get("detections") or []:
            cdef = cfg.classes.get(d.get("class"))
            if cdef and cdef.sides and side not in cdef.sides:
                warnings.append(f"{code}: {d['class']} is expected only on {'/'.join(cdef.sides)}")

    # ---- components (schema 1.1) ---------------------------------------------
    comp_counts: dict[str, dict[str, int]] = {c: {"point_count": 0, "image_count": 0, "detection_count": 0}
                                              for c in COMPONENTS}
    if components and schema != "1.1":
        errors.append("components are only allowed in schema 1.1")
    comp_codes = [c.get("position_code") for c in components if isinstance(c, dict)]
    cdupes = [c for c, n in Counter(comp_codes).items() if n > 1]
    if cdupes:
        errors.append(f"duplicate component codes: {', '.join(map(str, cdupes[:10]))}")
    limits = max_component_photos or {}
    for rec in components:
        if not isinstance(rec, dict):
            errors.append("components: every record must be an object")
            continue
        code = str(rec.get("position_code"))
        parsed_c = parse_component_code(code)
        if not parsed_c:
            errors.append(f"{code}: not a component code (NAC-01…, TWR-01…)")
            continue
        comp, seq = parsed_c
        if (rec.get("component"), rec.get("seq")) != (comp, seq):
            errors.append(f"{code}: component/seq do not agree with the position code")
        if comp in limits and seq > limits[comp]:
            errors.append(f"{code}: more {comp} photos than the limit of {limits[comp]}")
        before_i, before_d = n_images, n_dets
        check_common(rec, code)
        comp_counts[comp]["point_count"] += 1
        comp_counts[comp]["image_count"] += n_images - before_i
        comp_counts[comp]["detection_count"] += n_dets - before_d
    for comp, codes_ in ((c, sorted(s for s in comp_codes if str(s).startswith(COMPONENTS[c] + "-")))
                         for c in COMPONENTS):
        seqs = [int(s.split("-")[1]) for s in codes_ if parse_component_code(s)]
        if seqs and sorted(seqs) != list(range(1, len(seqs) + 1)):
            errors.append(f"{comp} codes must run 01..{len(seqs):02d} without gaps")

    # ---- totals and file list -------------------------------------------------
    dup_ids = [i for i, n in det_ids.items() if n > 1]
    if dup_ids:
        errors.append(f"detection IDs used more than once: {', '.join(map(str, dup_ids[:5]))}")
    if manifest.get("image_count") != n_images:
        errors.append(f"manifest image_count is {manifest.get('image_count')} but the package has {n_images} images")
    if manifest.get("detection_count") != n_dets:
        errors.append(f"manifest detection_count is {manifest.get('detection_count')} but points have {n_dets}")
    want_status = "partial" if any_gap else "complete"
    if manifest.get("status") != want_status:
        errors.append(f"manifest status must be '{want_status}'")
    if schema == "1.1":
        summary = manifest.get("components")
        if not isinstance(summary, dict):
            errors.append("manifest: schema 1.1 needs a 'components' summary")
        else:
            for comp, counts in comp_counts.items():
                got = summary.get(comp) or {"point_count": 0, "image_count": 0, "detection_count": 0}
                for k, v in counts.items():
                    if got.get(k, 0) != v:
                        errors.append(f"manifest components.{comp}.{k} is {got.get(k)} but the package has {v}")

    on_disk = {"points.json"} | ({f"images/{p.name}" for p in (pkg / "images").iterdir()}
                                 if (pkg / "images").is_dir() else set())
    listed = set(files)
    if len(files) != len(manifest.get("files") or []):
        errors.append("manifest files lists a path more than once")
    if listed - on_disk:
        errors.append(f"manifest lists files that do not exist: {sorted(listed - on_disk)[:5]}")
    if on_disk - listed:
        errors.append(f"files missing from the manifest list: {sorted(on_disk - listed)[:5]}")
    if check_images and "points.json" in files:
        pj = pkg / "points.json"
        if files["points.json"].get("sha256") != sha256_file(pj) or files["points.json"].get("bytes") != pj.stat().st_size:
            errors.append("manifest entry for points.json does not match the file")
    nulls = sum(1 for p in points if p.get("status") == "inspected" and p.get("mm_per_px") is None)
    if nulls:
        warnings.append(f"{nulls} inspected points have no mm_per_px, so their sizes are null "
                        "(severity uses the class minimum)")
    stats.update({"schema_version": schema, "points": len(points), "components": len(components),
                  "images": n_images, "detections": n_dets, "status": want_status})
    return done()
