"""The Run step: photo by photo, run the model, measure, suggest a CAT, save the clean WebP and an
annotated QA copy, then build and validate the package (ML spec steps 6-10)."""
from __future__ import annotations

import hashlib
import json
import threading
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from ulid import ULID

from . import __version__
from .config import Config
from .detector import DEMO_MODEL, Detector, RawDetection, load_detector, model_info
from .imaging import export_webp, load_rgb, render_annotated
from .package import build_package
from .photo_meta import mm_per_px, read_meta
from .review import annotation_footer, sync_review
from .scanner import PlannedItem, scan_input
from .scheme import parse_blade_code, zone_for
from .severity import suggest_severity
from .validator import validate_package
from .workspace import Workspace

ProgressFn = Callable[[dict[str, Any]], None]


class RunError(Exception):
    def __init__(self, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.details = details or []


@dataclass
class RunRequest:
    input_dir: str
    turbine_code: str
    inspection_date: str                 # ISO 8601 with offset; a bare date gets the settings time zone
    blade_length_m: float | None = None
    model_path: str | None = None        # None = settings model.path; "demo" = sample truth boxes
    source_video: str | None = None      # reference to where the originals live (Drive path)
    camera: dict[str, Any] = field(default_factory=dict)
    overrides: dict[str, dict] = field(default_factory=dict)
    schema_version: str | None = None
    new_inspection: bool = False         # new inspection_id even if this turbine/date exists
    fresh: bool = False                  # re-process every photo instead of reusing unchanged results
    cloud_target: dict[str, Any] = field(default_factory=dict)   # CompliQ organization picked in Setup


def normalise_date(value: str, tz: str) -> str:
    value = (value or "").strip()
    if not value:
        raise RunError("Inspection date is required")
    if len(value) == 10:
        value += "T00:00:00"
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as e:
        raise RunError(f"Inspection date must look like 2026-11-04T10:30:00+05:30 ({e})") from None
    if dt.tzinfo is None:
        dt = datetime.fromisoformat(dt.isoformat(timespec="seconds") + tz)
    return dt.isoformat(timespec="seconds")


def _sig(obj: Any) -> str:
    return hashlib.sha1(json.dumps(obj, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _source_sig(p: Path) -> dict[str, Any]:
    st = p.stat()
    return {"path": str(p.resolve()), "size": st.st_size, "mtime_ns": st.st_mtime_ns}


def _post_process(raw: list[RawDetection], item: PlannedItem, cfg: Config, w: int, h: int,
                  mmpp_full: float | None) -> tuple[list[dict], dict[str, Any]]:
    """Class mapping, per-class thresholds, clamping, size in mm, suggested CAT (spec export code)."""
    side = point = zone = None
    if item.group == "blade":
        _, side, point = parse_blade_code(item.code)  # type: ignore[misc]
        zone = zone_for(point, cfg.severity.zones)
    dets: list[dict] = []
    dropped: dict[str, Any] = {"below_threshold": 0, "unknown_class": {}}
    for r in raw:
        code = cfg.class_for_model_name(r.cls_name)
        if code is None:
            dropped["unknown_class"][r.cls_name] = dropped["unknown_class"].get(r.cls_name, 0) + 1
            continue
        cdef = cfg.classes[code]
        if r.confidence < cdef.threshold:
            dropped["below_threshold"] += 1
            continue
        x0, y0, x1, y1 = (min(max(v, 0.0), 1.0) for v in (r.x0, r.y0, r.x1, r.y1))
        bx = {"x_min": round(x0, 4), "y_min": round(y0, 4), "x_max": round(x1, 4), "y_max": round(y1, 4)}
        if bx["x_max"] <= bx["x_min"] or bx["y_max"] <= bx["y_min"]:
            continue
        sides_px = sorted([(x1 - x0) * w, (y1 - y0) * h])
        length_mm = round(sides_px[1] * mmpp_full, 1) if mmpp_full else None
        width_mm = round(sides_px[0] * mmpp_full, 1) if mmpp_full else None
        cat, reason = suggest_severity(cdef, length_mm, zone, cfg.severity)
        flags = []
        if cdef.sides and side and side not in cdef.sides:
            flags.append(f"{cdef.label} is expected only on {'/'.join(cdef.sides)}")
        dets.append({"detection_id": str(ULID()), "class": code, "confidence": round(float(r.confidence), 3),
                     "bbox": bx, "length_mm": length_mm, "width_mm": width_mm, "severity_suggested": cat,
                     "severity_reason": reason, "model_class": r.cls_name, "flags": flags})
    dets.sort(key=lambda d: (-d["severity_suggested"], -d["confidence"]))
    return dets, dropped


class _Run:
    def __init__(self, req: RunRequest, cfg: Config, progress: ProgressFn | None, cancel: threading.Event | None):
        self.req, self.cfg = req, cfg
        self.progress = progress or (lambda _e: None)
        self.cancel = cancel or threading.Event()
        self.tz = cfg.get("inspection.timezone", "+05:30")

    # ---- detectors -----------------------------------------------------------
    def _detector_for(self, group: str, main: Detector | None) -> tuple[Detector | None, dict | None]:
        if group == "blade":
            return main, main.info if main else None
        choice = str(self.cfg.get(f"components.{group}_model", "same") or "same")
        if choice == "none":
            return None, None
        if choice == "same":
            return main, main.info if main else None
        path = str(self.cfg.resolve_path(choice))
        det = load_detector(path, {**self.cfg.get("model", {}), "name": None, "version": None},
                            list(self.cfg.classes), self._conf_floor())
        return det, det.info

    def _conf_floor(self) -> float:
        return max(0.001, min(c.threshold for c in self.cfg.classes.values()))

    # ---- one photo -----------------------------------------------------------
    def _process(self, ws: Workspace, item: PlannedItem, det: Detector | None, analysed: bool) -> dict[str, Any]:
        assert item.photo is not None
        t0 = time.perf_counter()
        img = load_rgb(item.photo)
        w, h = img.size
        meta = read_meta(item.photo, self.tz)
        cam = {**(self.cfg.get("camera") or {}), **{k: v for k, v in self.req.camera.items() if v not in (None, "")}}
        if meta["lrf_distance_m"]:
            dist, dist_src = meta["lrf_distance_m"], "photo laser range"
        elif item.group == "blade" and cam.get("distance_to_blade_m"):
            dist, dist_src = float(cam["distance_to_blade_m"]), "settings"
        else:
            dist, dist_src = None, None
        focal = float(cam["focal_length_mm"]) if cam.get("focal_length_mm") else meta["focal_length_mm"]
        sensor = float(cam["sensor_width_mm"]) if cam.get("sensor_width_mm") else None
        mmpp_full = mm_per_px(dist, focal, sensor, max(w, h))
        raw = det.detect(img, item.photo) if det else []
        dets, dropped = _post_process(raw, item, self.cfg, w, h, mmpp_full)
        exp = self.cfg.get("export", {})
        webp = export_webp(img, ws.webp_dir / f"{item.code}.webp", int(exp.get("long_edge", 1600)),
                           int(exp.get("webp_quality", 80)), int(exp.get("max_image_bytes", 2_000_000)))
        # sizes were measured on the full-resolution frame; points.json mm_per_px refers to the delivered WebP
        mmpp_webp = round(mmpp_full * max(w, h) / max(webp["width"], webp["height"]), 4) if mmpp_full else None
        zone = zone_for(int(item.code[-2:]), self.cfg.severity.zones) if item.group == "blade" else None
        record = {
            "position_code": item.code, "group": item.group, "key": item.key,
            "source": str(item.photo.relative_to(self.req_input)), "source_abs": str(item.photo.resolve()),
            "source_sig": _source_sig(item.photo), "status": "inspected", "reason": None, "zone": zone,
            "orig_width": w, "orig_height": h, "image_width": webp["width"], "image_height": webp["height"],
            "image_bytes": webp["bytes"], "image_sha256": webp["sha256"], "webp_quality": webp["quality"],
            "mm_per_px": mmpp_webp, "mm_per_px_full": mmpp_full, "distance_to_target_m": dist,
            "distance_source": dist_src, "focal_length_mm": focal, "sensor_width_mm": sensor,
            "captured_at": meta["captured_at"], "relative_altitude_m": meta["relative_altitude_m"],
            "camera_model": meta["model"], "analysed": analysed, "detections": dets, "dropped": dropped,
            "processed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        labels = {c: d.label for c, d in self.cfg.classes.items()}
        render_annotated(img, dets, labels, ws.annotated_dir / f"{item.code}.jpg",
                         int(exp.get("annotated_long_edge", 2400)),
                         footer=annotation_footer(item.code, record, len(dets), self.blade_length))
        record["inference_ms"] = round((time.perf_counter() - t0) * 1000)
        return record

    # ---- whole run -----------------------------------------------------------
    def execute(self) -> dict[str, Any]:
        req, cfg = self.req, self.cfg
        if not req.turbine_code.strip():
            raise RunError("Turbine code is required, e.g. WTG-001")
        date = normalise_date(req.inspection_date, self.tz)
        self.blade_length = float(req.blade_length_m) if req.blade_length_m not in (None, "") else None
        if self.blade_length is not None and self.blade_length <= 0:
            raise RunError("Blade length must be a positive number of metres")
        schema = str(req.schema_version or cfg.get("package.schema_version", "1.1"))
        if schema not in ("1.0", "1.1"):
            raise RunError("Package format must be 1.0 or 1.1")

        scan = scan_input(req.input_dir, cfg, req.overrides)
        if not scan.ok:
            details = list(scan.issues) + [f"{k}: {i}" for k, f in scan.folders.items() for i in f.issues]
            raise RunError("The input folder has problems to fix before running", details)
        self.req_input = scan.input_dir

        out = cfg.output_dir
        key = Workspace.key_for(req.turbine_code, date)
        ws = Workspace(out, key)
        previous = ws.read("inspection") if ws.exists() else None
        uploaded = (ws.read("upload") or {}).get("status") == "published"
        if previous and (req.new_inspection or uploaded):
            if uploaded and not req.new_inspection:
                raise RunError(f"{key} was already uploaded. Start it as a new inspection to run it again.")
            n = 2
            while Workspace(out, f"{key}-{n}").exists():
                n += 1
            ws, previous = Workspace(out, f"{key}-{n}"), None
        ws.qa_dir.mkdir(parents=True, exist_ok=True)

        model_path = req.model_path or str(cfg.resolve_path(cfg.get("model.path", "models/model.pt")))
        if model_path != DEMO_MODEL:
            model_path = str(cfg.resolve_path(model_path))
        m_settings = dict(cfg.get("model", {}))
        self._emit({"phase": "loading_model", "message": f"Loading {Path(model_path).name}"})
        main = load_detector(model_path, m_settings, list(cfg.classes), self._conf_floor())
        unknown = [n for n in main.names.values() if cfg.class_for_model_name(n) is None]

        inspection = {
            "inspection_id": (previous or {}).get("inspection_id") or str(ULID()),
            "turbine_code": req.turbine_code.strip(), "inspection_date": date,
            "blade_length_m": self.blade_length, "source_video": (req.source_video or "").strip() or None,
            "schema_version": schema, "input_dir": str(scan.input_dir), "model": main.info,
            "model_classes": main.names, "unknown_model_classes": unknown, "camera": req.camera,
            "overrides": req.overrides,
            "cloud_target": req.cloud_target or (previous or {}).get("cloud_target") or {},
            "created_at": (previous or {}).get("created_at")
            or datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "app_version": __version__,
        }
        comp_models: dict[str, Any] = {}
        detectors: dict[str, tuple[Detector | None, dict | None]] = {"blade": (main, main.info)}
        for comp in ("nacelle", "tower"):
            detectors[comp] = self._detector_for(comp, main)
            info = detectors[comp][1]
            comp_models[comp] = ({"model_name": info["model_name"], "model_version": info["model_version"]}
                                 if info else None)
        inspection["component_models"] = comp_models
        ws.write("inspection", inspection)
        ws.log(f"run started: {key} model={main.info.get('model_name')} {main.info.get('model_version')} "
               f"schema={schema} input={scan.input_dir}")
        if unknown:
            ws.log(f"model classes not among the six codes (skipped): {unknown}")

        sev = cfg.severity
        severity_sig = {"zones": sev.zones, "steps": sev.length_steps, "tip": [sev.tip_zone, sev.tip_add,
                                                                              sorted(sev.tip_classes)]}
        proc_sig = {g: _sig({"model": (d[1] or {}).get("sha256") or (d[1] or {}).get("model_name"),
                             "model_settings": m_settings, "classes": {c: vars(v) for c, v in cfg.classes.items()},
                             "map": cfg.model_name_map, "severity": severity_sig, "export": cfg.get("export"),
                             "camera": {**(cfg.get("camera") or {}), **req.camera}, "analysed": d[0] is not None})
                    for g, d in detectors.items()}
        old_run = ws.read("run") or {}
        old_items: dict[str, dict] = old_run.get("items", {}) if previous else {}
        plan = scan.plan(include_components=True)
        run: dict[str, Any] = {"started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                               "finished_at": None, "state": "running", "items": {}, "proc_sig": proc_sig,
                               "total": len(plan)}
        todo = [it for it in plan if it.photo is not None]
        t_start, processed, reused = time.perf_counter(), 0, 0
        for idx, item in enumerate(plan, start=1):
            if self.cancel.is_set():
                run["state"] = "cancelled"
                break
            if item.photo is None:
                run["items"][item.code] = {"position_code": item.code, "group": item.group, "key": item.key,
                                           "status": "unavailable", "reason": item.unavailable_reason,
                                           "detections": []}
                continue
            old = old_items.get(item.code)
            if (not req.fresh and old and old.get("status") == "inspected"
                    and old.get("source_sig") == _source_sig(item.photo)
                    and old_run.get("proc_sig", {}).get(item.group) == proc_sig[item.group]
                    and (ws.webp_dir / f"{item.code}.webp").exists()
                    and (ws.annotated_dir / f"{item.code}.jpg").exists()):
                run["items"][item.code] = old
                reused += 1
                rec = old
            else:
                det = detectors[item.group][0]
                try:
                    rec = self._process(ws, item, det, analysed=det is not None)
                except Exception as e:  # one bad photo must not stop the inspection
                    ws.log(f"{item.code}: failed on {item.photo.name}: {e}\n{traceback.format_exc()}")
                    rec = {"position_code": item.code, "group": item.group, "key": item.key,
                           "source": str(item.photo.relative_to(scan.input_dir)),
                           "source_abs": str(item.photo.resolve()), "source_sig": _source_sig(item.photo),
                           "status": "failed", "reason": f"could not process photo: {e}", "detections": []}
                run["items"][item.code] = rec
                processed += 1
                ws.log(f"{item.code}: {item.photo.name} -> {rec['status']}, {len(rec.get('detections', []))} "
                       f"detections, {rec.get('inference_ms', '-')} ms")
            done = sum(1 for c in run["items"] if run["items"][c].get("source_sig"))
            elapsed = time.perf_counter() - t_start
            rate = elapsed / processed if processed else 0
            remaining = max(0, len(todo) - done)
            self._emit({"phase": "running", "done": done, "total": len(todo), "index": idx, "code": item.code,
                        "photo": item.photo.name, "status": rec["status"],
                        "detections": len(rec.get("detections", [])), "elapsed_s": round(elapsed, 1),
                        "eta_s": round(rate * remaining) if processed else None, "workspace": ws.key,
                        "reused": reused})
            if processed % 10 == 0:
                ws.write("run", run)
        if run["state"] == "running":
            run["state"] = "complete"
        run["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if run["state"] != "complete":  # keep earlier results for photos this run did not reach
            run["items"] = {**old_items, **run["items"]}
        ws.write("run", run)
        sync_review(ws, run["items"], old_items)
        if run["state"] != "complete":
            ws.log("run cancelled; finished photos are kept, run again to continue")
            self._emit({"phase": "cancelled", "workspace": ws.key})
            return {"workspace": ws.key, "state": "cancelled"}
        self._emit({"phase": "packaging", "message": "Writing the package and validating"})
        built = build_package(ws, cfg)
        report = validate_package(ws.package_dir, cfg, max_component_photos={
            "nacelle": int(cfg.get("input.nacelle_max_photos", 40)),
            "tower": int(cfg.get("input.tower_max_photos", 60))})
        ws.write("validation", report)
        n_det = sum(len(it.get("detections", [])) for it in run["items"].values())
        ws.log(f"run finished: {processed} processed, {reused} reused, {n_det} detections, "
               f"validation {'ok' if report['ok'] else str(len(report['errors'])) + ' errors'}")
        result = {"workspace": ws.key, "state": "complete", "processed": processed, "reused": reused,
                  "detections": n_det, "package": built, "validation_ok": report["ok"],
                  "validation_errors": report["errors"][:20], "unknown_model_classes": unknown}
        self._emit({"phase": "complete", **result})
        return result

    def _emit(self, event: dict[str, Any]) -> None:
        try:
            self.progress(event)
        except Exception:
            pass


def run_inspection(req: RunRequest, cfg: Config, progress: ProgressFn | None = None,
                   cancel: threading.Event | None = None) -> dict[str, Any]:
    return _Run(req, cfg, progress, cancel).execute()


def describe_model(model_path: str, cfg: Config) -> dict[str, Any]:
    """For the Setup screen: model name/version and how its classes map to the six codes."""
    path = model_path if model_path == DEMO_MODEL else str(cfg.resolve_path(model_path))
    det = load_detector(path, dict(cfg.get("model", {})), list(cfg.classes),
                        max(0.001, min(c.threshold for c in cfg.classes.values())))
    mapping = {name: cfg.class_for_model_name(name) for name in det.names.values()}
    missing = [c for c in cfg.classes if c not in mapping.values()]
    return {"info": det.info, "classes": mapping, "unknown": [n for n, c in mapping.items() if c is None],
            "not_covered": missing}


__all__ = ["RunRequest", "RunError", "run_inspection", "describe_model", "normalise_date", "model_info"]
