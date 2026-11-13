"""Review and approval. A reviewer approves each photo, may remove wrong boxes or mark a photo unusable,
then approves the package. Approval is tied to the package's fingerprint (manifest SHA-256), so any later
change to the package voids it and Upload locks again."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .config import Config
from .imaging import load_rgb, render_annotated
from .package import build_package, kept_detections, package_fingerprint
from .scheme import distance_m
from .validator import validate_package
from .workspace import Workspace

STATES = ("pending", "approved", "failed")
MAX_HISTORY = 2000


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def empty_review() -> dict[str, Any]:
    return {"points": {}, "package": {"approved": False, "by": None, "at": None, "fingerprint": None},
            "history": []}


def sync_review(ws: Workspace, items: dict[str, dict], previous: dict[str, dict]) -> dict[str, Any]:
    """After a run: keep the review of photos whose results did not change; reset the rest to pending."""
    review = ws.read("review") or empty_review()
    pts = review.setdefault("points", {})
    for code, it in items.items():
        old = previous.get(code)
        same = (old is not None and old.get("source_sig") == it.get("source_sig")
                and [d["detection_id"] for d in old.get("detections", [])]
                == [d["detection_id"] for d in it.get("detections", [])])
        if code not in pts or not same:
            pts[code] = {"state": "pending", "reason": None, "removed": {}, "by": None, "at": None}
    for code in list(pts):
        if code not in items:
            del pts[code]
    review["package"] = {"approved": False, "by": None, "at": None, "fingerprint": None}
    ws.write("review", review)
    return review


def reviewable(items: dict[str, dict]) -> list[str]:
    """Photos that need a reviewer's decision: everything the run produced an image for."""
    return [c for c, it in items.items() if it.get("status") == "inspected"]


def summary(ws: Workspace) -> dict[str, Any]:
    items = (ws.read("run") or {}).get("items", {})
    review = ws.read("review") or empty_review()
    pts = review.get("points", {})
    codes = reviewable(items)
    counts = {s: 0 for s in STATES}
    for c in codes:
        counts[pts.get(c, {}).get("state", "pending")] += 1
    pkg = review.get("package") or {}
    fp = package_fingerprint(ws)
    approved = bool(pkg.get("approved")) and pkg.get("fingerprint") == fp
    return {"reviewable": len(codes), **counts, "all_reviewed": counts["pending"] == 0 and bool(codes),
            "package_approved": approved, "approved_by": pkg.get("by") if approved else None,
            "approved_at": pkg.get("at") if approved else None,
            "approval_voided": bool(pkg.get("approved")) and not approved}


def _rerender(ws: Workspace, cfg: Config, code: str, item: dict, rp: dict) -> None:
    src = item.get("source_abs")
    try:
        img = load_rgb(src) if src else load_rgb(ws.webp_dir / f"{code}.webp")
    except (OSError, ValueError):
        img = load_rgb(ws.webp_dir / f"{code}.webp")
    labels = {c: d.label for c, d in cfg.classes.items()}
    kept = kept_detections(item, rp)
    insp = ws.read("inspection") or {}
    render_annotated(img, kept, labels, ws.annotated_dir / f"{code}.jpg",
                     int(cfg.get("export.annotated_long_edge", 2400)),
                     footer=annotation_footer(code, item, len(kept), insp.get("blade_length_m")),
                     removed=list((rp.get("removed") or {}).values()))


def annotation_footer(code: str, item: dict, n_kept: int, blade_length: float | None) -> str:
    parts = [code]
    if item.get("group") == "blade":
        point = int(code[-2:])
        parts.append(item.get("zone") or "")
        d = distance_m(point, blade_length)
        if d is not None:
            parts.append(f"{d:.2f} m from root")
    parts.append(f"{n_kept} finding{'s' if n_kept != 1 else ''}")
    parts.append("QA copy - not uploaded")
    return "  ·  ".join(p for p in parts if p)


def apply_action(ws: Workspace, cfg: Config, code: str, action: str, by: str | None = None,
                 reason: str | None = None, detection_id: str | None = None, note: str | None = None) -> dict:
    items = (ws.read("run") or {}).get("items", {})
    if code not in items:
        raise KeyError(f"unknown position code {code}")
    item = items[code]
    if item.get("status") != "inspected":
        raise ValueError(f"{code} has no photo to review ({item.get('status')}: {item.get('reason')})")
    review = ws.read("review") or empty_review()
    rp = review["points"].setdefault(code, {"state": "pending", "reason": None, "removed": {}, "by": None, "at": None})
    rp.setdefault("removed", {})
    changes_package = False
    if action == "approve":
        if rp["state"] == "failed":
            raise ValueError("restore the photo before approving it")
        rp.update(state="approved", by=by, at=now_iso())
    elif action == "reset":
        if rp["state"] == "failed":
            changes_package = True
        rp.update(state="pending", reason=None, by=by, at=now_iso())
    elif action == "fail":
        if not (reason or "").strip():
            raise ValueError("give a reason, e.g. 'blurred' or 'wrong side'")
        rp.update(state="failed", reason=reason.strip(), by=by, at=now_iso())
        changes_package = True
    elif action in ("remove_detection", "restore_detection"):
        det = next((d for d in item.get("detections", []) if d["detection_id"] == detection_id), None)
        if det is None:
            raise KeyError(f"{code}: no detection {detection_id}")
        if action == "remove_detection":
            rp["removed"][detection_id] = {**{k: det[k] for k in ("detection_id", "class", "confidence", "bbox",
                                                                 "severity_suggested")},
                                           "note": (note or "").strip() or None, "by": by, "at": now_iso()}
        else:
            rp["removed"].pop(detection_id, None)
        changes_package = True
    else:
        raise ValueError(f"unknown action {action}")
    review.setdefault("history", []).append({"at": now_iso(), "by": by, "code": code, "action": action,
                                             "detection_id": detection_id, "reason": reason})
    review["history"] = review["history"][-MAX_HISTORY:]
    ws.write("review", review)
    if changes_package:
        build_package(ws, cfg)
        if action in ("remove_detection", "restore_detection"):
            _rerender(ws, cfg, code, item, rp)
    return point_view(code, item, rp)


def bulk_approve(ws: Workspace, by: str | None, only_clean: bool) -> int:
    items = (ws.read("run") or {}).get("items", {})
    review = ws.read("review") or empty_review()
    n = 0
    for code in reviewable(items):
        rp = review["points"].setdefault(code, {"state": "pending", "reason": None, "removed": {}})
        if rp.get("state") != "pending":
            continue
        if only_clean and kept_detections(items[code], rp):
            continue
        rp.update(state="approved", by=by, at=now_iso())
        n += 1
    review.setdefault("history", []).append({"at": now_iso(), "by": by, "code": "*",
                                             "action": "approve_clean" if only_clean else "approve_all", "count": n})
    ws.write("review", review)
    return n


def approve_package(ws: Workspace, cfg: Config, by: str) -> dict[str, Any]:
    if not (by or "").strip():
        raise ValueError("enter the approver's name")
    s = summary(ws)
    if s["pending"]:
        raise ValueError(f"{s['pending']} photos still need a decision")
    build_package(ws, cfg)
    report = validate_package(ws.package_dir, cfg)
    ws.write("validation", report)
    if not report["ok"]:
        raise ValueError(f"the package has {len(report['errors'])} validation errors; fix them first")
    review = ws.read("review") or empty_review()
    review["package"] = {"approved": True, "by": by.strip(), "at": now_iso(), "fingerprint": package_fingerprint(ws)}
    review.setdefault("history", []).append({"at": now_iso(), "by": by, "code": "*", "action": "approve_package"})
    ws.write("review", review)
    return summary(ws)


def revoke_approval(ws: Workspace, by: str | None) -> dict[str, Any]:
    review = ws.read("review") or empty_review()
    review["package"] = {"approved": False, "by": None, "at": None, "fingerprint": None}
    review.setdefault("history", []).append({"at": now_iso(), "by": by, "code": "*", "action": "revoke_approval"})
    ws.write("review", review)
    return summary(ws)


def point_view(code: str, item: dict, rp: dict | None) -> dict[str, Any]:
    """Everything the review screen shows for one photo."""
    rp = rp or {}
    removed = rp.get("removed") or {}
    dets = []
    for d in item.get("detections", []):
        dets.append({**d, "removed": d["detection_id"] in removed,
                     "removed_note": (removed.get(d["detection_id"]) or {}).get("note")})
    kept = [d for d in dets if not d["removed"]]
    return {
        "code": code, "group": item.get("group"), "status": item.get("status"), "reason": item.get("reason"),
        "review_state": rp.get("state", "pending") if item.get("status") == "inspected" else None,
        "review_reason": rp.get("reason"), "reviewed_by": rp.get("by"), "reviewed_at": rp.get("at"),
        "zone": item.get("zone"), "source": item.get("source"), "captured_at": item.get("captured_at"),
        "image_width": item.get("image_width"), "image_height": item.get("image_height"),
        "orig_width": item.get("orig_width"), "orig_height": item.get("orig_height"),
        "mm_per_px": item.get("mm_per_px"), "distance_to_target_m": item.get("distance_to_target_m"),
        "distance_source": item.get("distance_source"),
        "detections": dets, "kept_count": len(kept),
        "max_cat": max((d["severity_suggested"] for d in kept), default=None),
        "flags": sorted({f for d in kept for f in d.get("flags", [])}),
        "dropped": item.get("dropped"),
    }
