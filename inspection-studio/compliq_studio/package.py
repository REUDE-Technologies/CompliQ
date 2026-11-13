"""Builds the upload package from the run results and the review edits.

Schema 1.0 is exactly the ML spec: manifest.json, points.json (240 blade records), images/.
Schema 1.1 adds nacelle and tower (see the PRD's backend note): points.json gains a "components" list,
images/ gains NAC-xx.webp / TWR-xx.webp, and the manifest gains a "components" summary.
Nothing else ever goes in the package folder; QA files stay in the sibling *_qa folder.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

from .config import Config
from .imaging import sha256_file
from .scheme import COMPONENTS, COMPONENT_NAMES, all_blade_codes, distance_m, parse_blade_code, zone_for
from .workspace import Workspace, write_json_atomic

DETECTION_FIELDS = ("detection_id", "class", "confidence", "bbox", "length_mm", "width_mm",
                    "severity_suggested", "severity_reason")


def _public_detection(d: dict) -> dict:
    return {k: d[k] for k in DETECTION_FIELDS}


def kept_detections(item: dict, review_point: dict) -> list[dict]:
    removed = set((review_point or {}).get("removed", {}))
    return [d for d in item.get("detections", []) if d["detection_id"] not in removed]


def effective_status(item: dict | None, review_point: dict | None) -> tuple[str, str | None]:
    """Run status, unless the reviewer marked the photo unusable."""
    if not item:
        return "unavailable", "not processed"
    if (review_point or {}).get("state") == "failed" and item.get("status") == "inspected":
        return "failed", (review_point or {}).get("reason") or "marked unusable in review"
    return item.get("status", "unavailable"), item.get("reason")


def _blade_record(code: str, item: dict | None, rp: dict | None, blade_length: float | None,
                  cfg: Config) -> dict:
    blade, side, point = parse_blade_code(code)  # type: ignore[misc]
    status, reason = effective_status(item, rp)
    inspected = status == "inspected"
    item = item or {}
    return {
        "position_code": code,
        "blade": blade,
        "side": side,
        "point": point,
        "zone": item.get("zone") or zone_for(point, cfg.severity.zones),
        "distance_m": distance_m(point, blade_length),
        "frame_timestamp_ms": None,  # photos, not video frames
        "status": status,
        "reason": None if inspected else (reason or "no reason given"),
        "image": f"images/{code}.webp" if inspected else None,
        "image_width": item.get("image_width") if inspected else None,
        "image_height": item.get("image_height") if inspected else None,
        "mm_per_px": item.get("mm_per_px") if inspected else None,
        "detections": [_public_detection(d) for d in kept_detections(item, rp or {})] if inspected else [],
    }


def _component_record(code: str, item: dict, rp: dict | None) -> dict:
    status, reason = effective_status(item, rp)
    inspected = status == "inspected"
    return {
        "position_code": code,
        "component": item["group"],
        "seq": int(code.split("-")[1]),
        "status": status,
        "reason": None if inspected else (reason or "no reason given"),
        "image": f"images/{code}.webp" if inspected else None,
        "image_width": item.get("image_width") if inspected else None,
        "image_height": item.get("image_height") if inspected else None,
        "mm_per_px": item.get("mm_per_px") if inspected else None,
        "captured_at": item.get("captured_at"),
        "drone_altitude_m": item.get("relative_altitude_m"),
        "detections": [_public_detection(d) for d in kept_detections(item, rp or {})] if inspected else [],
    }


def component_codes(run_items: dict) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {c: [] for c in COMPONENTS}
    for code, it in run_items.items():
        if it.get("group") in out:
            out[it["group"]].append(code)
    return {c: sorted(v) for c, v in out.items()}


def build_documents(ws: Workspace, cfg: Config) -> tuple[dict, dict, list[str]]:
    """Returns (manifest without 'files', points document, list of image codes to ship)."""
    insp = ws.read("inspection")
    run = ws.read("run") or {"items": {}}
    review = (ws.read("review") or {}).get("points", {})
    schema = str(insp.get("schema_version", "1.1"))
    items = run.get("items", {})
    length = insp.get("blade_length_m")

    points = [_blade_record(c, items.get(c), review.get(c), length, cfg) for c in all_blade_codes()]
    doc: dict[str, Any] = {"points": points}
    ship = [p["position_code"] for p in points if p["status"] == "inspected"]
    n_det = sum(len(p["detections"]) for p in points)
    partial = any(p["status"] != "inspected" for p in points)

    comp_summary: dict[str, Any] = {}
    if schema == "1.1":
        comps = []
        for comp, codes in component_codes(items).items():
            recs = [_component_record(c, items[c], review.get(c)) for c in codes]
            comps.extend(recs)
            model = (insp.get("component_models") or {}).get(comp)
            comp_summary[comp] = {
                "label": COMPONENT_NAMES[comp],
                "point_count": len(recs),
                "image_count": sum(r["status"] == "inspected" for r in recs),
                "detection_count": sum(len(r["detections"]) for r in recs),
                "model_name": model.get("model_name") if model else None,
                "model_version": model.get("model_version") if model else None,
            }
            ship.extend(r["position_code"] for r in recs if r["status"] == "inspected")
            n_det += sum(len(r["detections"]) for r in recs)
            partial = partial or any(r["status"] != "inspected" for r in recs)
        doc["components"] = comps

    model = insp.get("model") or {}
    manifest: dict[str, Any] = {
        "schema_version": schema,
        "inspection_id": insp["inspection_id"],
        "turbine_code": insp["turbine_code"],
        "inspection_date": insp["inspection_date"],
        "model_name": model.get("model_name"),
        "model_version": model.get("model_version"),
        "status": "partial" if partial else "complete",
        "expected_point_count": 240,
        "image_count": len(ship),
        "detection_count": n_det,
        "blade_length_m": length,
        "source_video": insp.get("source_video"),
    }
    if schema == "1.1":
        manifest["components"] = comp_summary
    return manifest, doc, ship


def _sync_images(ws: Workspace, ship: list[str]) -> None:
    ws.images_dir.mkdir(parents=True, exist_ok=True)
    wanted = {f"{c}.webp" for c in ship}
    for f in ws.images_dir.iterdir():
        if f.name not in wanted:
            if f.is_dir():
                shutil.rmtree(f)
            else:
                f.unlink()
    for name in sorted(wanted):
        src, dst = ws.webp_dir / name, ws.images_dir / name
        if not src.exists():
            raise FileNotFoundError(f"missing WebP for {name[:-5]} in {ws.webp_dir}; re-run the inspection")
        s = src.stat()
        if dst.exists():
            d = dst.stat()
            if d.st_size == s.st_size and int(d.st_mtime) == int(s.st_mtime):
                continue
        shutil.copy2(src, dst)


def build_package(ws: Workspace, cfg: Config) -> dict[str, Any]:
    """Writes the package folder so it holds exactly manifest.json, points.json and images/."""
    manifest, doc, ship = build_documents(ws, cfg)
    ws.package_dir.mkdir(parents=True, exist_ok=True)
    for extra in ws.package_dir.iterdir():  # nothing but the three things
        if extra.name in ("manifest.json", "points.json", "images"):
            continue
        if extra.is_dir():
            shutil.rmtree(extra)
        else:
            extra.unlink()
    _sync_images(ws, ship)
    points_path = ws.package_dir / "points.json"
    write_json_atomic(points_path, doc)
    run_items = (ws.read("run") or {}).get("items", {})
    files = [{"path": "points.json", "bytes": points_path.stat().st_size, "sha256": sha256_file(points_path)}]
    for code in sorted(ship, key=_ship_order):
        f = ws.images_dir / f"{code}.webp"
        cached = run_items.get(code, {})
        same = cached.get("image_bytes") == f.stat().st_size and cached.get("image_sha256")
        files.append({"path": f"images/{code}.webp", "bytes": f.stat().st_size,
                      "sha256": cached["image_sha256"] if same else sha256_file(f)})
    manifest["files"] = files
    write_json_atomic(ws.package_dir / "manifest.json", manifest)
    _write_qa_note(ws, manifest, doc)
    return {"status": manifest["status"], "image_count": manifest["image_count"],
            "detection_count": manifest["detection_count"], "schema_version": manifest["schema_version"],
            "manifest_sha256": sha256_file(ws.package_dir / "manifest.json")}


_BLADE_ORDER = {c: i for i, c in enumerate(all_blade_codes())}


def _ship_order(code: str) -> tuple[int, int]:
    if code in _BLADE_ORDER:
        return 0, _BLADE_ORDER[code]
    prefix, num = code.split("-")
    return (1 if prefix == "NAC" else 2), int(num)


def package_fingerprint(ws: Workspace) -> str | None:
    """SHA-256 of manifest.json; it lists every other file's SHA-256, so it pins the whole package."""
    p = ws.package_dir / "manifest.json"
    return sha256_file(p) if p.exists() else None


def _write_qa_note(ws: Workspace, manifest: dict, doc: dict) -> None:
    lines = [f"# QA note — {manifest['turbine_code']} {manifest['inspection_date']}", "",
             f"- Inspection ID: `{manifest['inspection_id']}`",
             f"- Model: {manifest['model_name']} {manifest['model_version']}",
             f"- Package schema: {manifest['schema_version']}  ·  status: **{manifest['status']}**",
             f"- Images: {manifest['image_count']}  ·  detections: {manifest['detection_count']}", ""]
    gaps = [p for p in doc["points"] + doc.get("components", []) if p["status"] != "inspected"]
    lines.append("## Failed / unavailable points")
    lines.append("")
    if gaps:
        lines += ["| Position | Status | Reason |", "|---|---|---|"]
        lines += [f"| {p['position_code']} | {p['status']} | {p['reason']} |" for p in gaps]
    else:
        lines.append("None — every point has an image.")
    review = (ws.read("review") or {}).get("points", {})
    removed = [(code, d) for code, rp in review.items() for d in (rp.get("removed") or {}).values()]
    lines += ["", "## Boxes removed in review (kept here for retraining)", ""]
    if removed:
        lines += ["| Position | Class | Confidence | Note |", "|---|---|---|---|"]
        lines += [f"| {c} | {d['class']} | {d['confidence']:.2f} | {d.get('note') or ''} |" for c, d in removed]
    else:
        lines.append("None.")
    ws.qa_note_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def compact_points_json(pkg_dir: Path) -> dict:
    return json.loads((Path(pkg_dir) / "points.json").read_text(encoding="utf-8"))


__all__ = ["build_package", "build_documents", "package_fingerprint", "kept_detections", "effective_status",
           "component_codes", "compact_points_json"]
