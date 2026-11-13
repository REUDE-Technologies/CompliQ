"""Local web server for the browser app. Listens on 127.0.0.1 only; the browser UI in static/ calls /api/*.

One background job runs at a time (a model run, an upload, or making sample data); the UI polls /api/job.
"""
from __future__ import annotations

import copy
import os
import platform
import subprocess
import sys
import threading
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..config import Config, load_config, save_local_settings
from ..review import now_iso
from ..detector import DEMO_MODEL
from ..package import build_package, component_codes, effective_status, kept_detections
from ..pipeline import RunError, RunRequest, describe_model, run_inspection
from ..review import (apply_action, approve_package, bulk_approve, point_view, revoke_approval,
                      summary as review_summary)
from ..sample import SAMPLE_CAMERA, make_sample
from ..scanner import scan_input
from ..scheme import all_blade_codes, parse_blade_code, parse_component_code
from ..cloud import SECRET_FIELDS, Cloud, CloudError, CloudSettings
from ..validator import validate_package
from ..workspace import Workspace

STATIC = Path(__file__).resolve().parent / "static"
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]"}


class JobManager:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.job: dict[str, Any] | None = None
        self.cancel = threading.Event()

    def busy(self) -> bool:
        return bool(self.job and self.job["state"] == "running")

    def start(self, kind: str, label: str, fn: Callable[[Callable[[dict], None], threading.Event], Any],
              workspace: str | None = None) -> dict[str, Any]:
        with self.lock:
            if self.busy():
                raise HTTPException(409, f"Wait for the current job to finish: {self.job['label']}")
            self.cancel = threading.Event()
            job = {"id": uuid.uuid4().hex[:8], "kind": kind, "label": label, "state": "running",
                   "workspace": workspace, "progress": {}, "counts": {}, "events": [], "result": None, "error": None,
                   "details": [], "started_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                   "finished_at": None}
            self.job = job
        cancel = self.cancel

        def progress(event: dict) -> None:
            with self.lock:
                job["progress"] = event
                if "done" in event and "total" in event:
                    job["counts"] = {k: event.get(k) for k in ("done", "total", "elapsed_s", "eta_s")}
                if event.get("workspace"):
                    job["workspace"] = event["workspace"]
                if event.get("phase") != "running" or event.get("detections"):
                    job["events"] = (job["events"] + [{**event, "at": datetime.now().strftime("%H:%M:%S")}])[-40:]

        def runner() -> None:
            try:
                result = fn(progress, cancel)
                state = "cancelled" if (isinstance(result, dict) and result.get("state") == "cancelled") else "done"
                with self.lock:
                    job.update(state=state, result=result)
            except (RunError, CloudError, ValueError, FileNotFoundError, KeyError) as e:
                with self.lock:
                    job.update(state="cancelled" if "cancelled" in str(e).lower() else "error", error=str(e),
                               details=list(getattr(e, "details", []) or []))
            except Exception as e:  # unexpected: keep the trace for the log panel
                with self.lock:
                    job.update(state="error", error=f"{e.__class__.__name__}: {e}",
                               details=traceback.format_exc().splitlines()[-8:])
            finally:
                with self.lock:
                    job["finished_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

        threading.Thread(target=runner, daemon=True, name=f"job-{kind}").start()
        return job

    def snapshot(self) -> dict[str, Any] | None:
        with self.lock:
            return None if self.job is None else {**self.job, "events": list(self.job["events"])}


def public_settings(settings: dict) -> dict:
    """Settings for the browser: Cloudflare secrets are never sent back, only whether they are set."""
    out = copy.deepcopy(settings)
    cf = out.setdefault("cloudflare", {}) or {}
    for f in SECRET_FIELDS:
        cf[f"{f}_set"] = bool(cf.get(f))
        cf[f] = ""
    out["cloudflare"] = cf
    return out


def create_app(root: str | os.PathLike | None = None) -> FastAPI:
    app = FastAPI(title="CompliQ Inspection Studio", version=__version__, docs_url=None, redoc_url=None)
    jobs = JobManager()
    state: dict[str, Any] = {"cfg": load_config(root)}

    def cfg() -> Config:
        return state["cfg"]

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        host = (request.headers.get("host") or "").rsplit(":", 1)[0]
        if host not in ALLOWED_HOSTS:  # blocks DNS-rebinding pages
            return JSONResponse({"detail": "This app only answers on localhost"}, 403)
        if request.method in ("POST", "PUT", "DELETE") and request.headers.get("x-studio") != "1":
            return JSONResponse({"detail": "Missing X-Studio header"}, 403)  # blocks cross-site form posts
        return await call_next(request)

    def ws_or_404(key: str) -> Workspace:
        try:
            ws = Workspace(cfg().output_dir, key)
        except ValueError:
            raise HTTPException(404, "Inspection not found") from None
        if not ws.exists():
            raise HTTPException(404, "Inspection not found")
        return ws

    def guard_ws(key: str) -> None:
        snap = jobs.snapshot()
        if snap and snap["state"] == "running" and snap.get("workspace") == key:
            raise HTTPException(409, "This inspection is busy with a running job")

    # ---- basics ---------------------------------------------------------------
    @app.get("/")
    def index() -> FileResponse:
        return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-store"})

    @app.get("/api/info")
    def info() -> dict[str, Any]:
        c = cfg()
        model_path = c.resolve_path(c.get("model.path"))
        return {"version": __version__, "project": str(c.root), "output_dir": str(c.output_dir),
                "model_path": str(model_path) if model_path else None,
                "model_exists": bool(model_path and model_path.exists()), "settings": public_settings(c.settings),
                "classes": {k: {"label": v.label, "cat": [v.cat_min, v.cat_max], "threshold": v.threshold}
                            for k, v in c.classes.items()},
                "platform": platform.system(), "sample_camera": SAMPLE_CAMERA}

    @app.get("/api/settings")
    def get_settings() -> dict[str, Any]:
        return public_settings(cfg().settings)

    @app.put("/api/settings")
    def put_settings(updates: dict = Body(...)) -> dict[str, Any]:
        allowed = {"model", "export", "package", "inspection", "camera", "input", "components", "upload", "cloudflare"}
        bad = set(updates) - allowed
        if bad:
            raise HTTPException(400, f"Unknown settings sections: {sorted(bad)}")
        cf = updates.get("cloudflare")
        if isinstance(cf, dict):           # an empty secret field means "keep the saved one"
            for f in SECRET_FIELDS:
                if not cf.get(f):
                    cf.pop(f, None)
            for f in list(cf):
                if f.endswith("_set"):
                    cf.pop(f)
        save_local_settings(updates, cfg().root)
        try:
            state["cfg"] = load_config(cfg().root)
        except ValueError as e:
            raise HTTPException(400, str(e)) from None
        return public_settings(cfg().settings)

    @app.post("/api/browse")
    def browse(body: dict = Body(...)) -> dict[str, Any]:
        kind = body.get("kind", "folder")
        initial = body.get("initial") or str(cfg().root)
        script = ("import sys,tkinter as tk\nfrom tkinter import filedialog\nr=tk.Tk();r.withdraw()\n"
                  "r.attributes('-topmost',True)\n"
                  + ("p=filedialog.askdirectory(initialdir=sys.argv[1])\n" if kind == "folder" else
                     "p=filedialog.askopenfilename(initialdir=sys.argv[1],filetypes=[('Model','*.pt *.onnx'),"
                     "('All','*.*')])\n")
                  + "print(p or '')")
        try:
            out = subprocess.run([sys.executable, "-c", script, initial], capture_output=True, text=True,
                                 timeout=600)
        except (OSError, subprocess.TimeoutExpired) as e:
            return {"path": None, "error": f"Could not open a file dialog ({e}); type the path instead."}
        if out.returncode != 0:
            return {"path": None, "error": "No file dialog on this computer; type or paste the path instead."}
        return {"path": out.stdout.strip() or None}

    # ---- CompliQ (Cloudflare) -----------------------------------------------------
    def cloud() -> Cloud:
        try:
            return Cloud(CloudSettings.from_config(cfg()))
        except CloudError as e:
            raise HTTPException(400, str(e)) from None

    def cloud_call(fn):
        try:
            return fn()
        except CloudError as e:
            raise HTTPException(502, str(e)) from None

    @app.post("/api/cloud/test")
    def cloud_test() -> dict[str, Any]:
        c = cloud()
        return cloud_call(c.check)

    @app.get("/api/cloud/orgs")
    def cloud_orgs() -> list[dict[str, Any]]:
        c = cloud()
        return cloud_call(c.organizations)

    @app.get("/api/cloud/turbines")
    def cloud_turbines(org_id: str) -> list[dict[str, Any]]:
        c = cloud()
        return cloud_call(lambda: c.turbines(org_id))

    # ---- setup ----------------------------------------------------------------
    @app.post("/api/scan")
    def scan(body: dict = Body(...)) -> dict[str, Any]:
        path = (body.get("input_dir") or "").strip().strip('"')
        if not path:
            raise HTTPException(400, "Enter the photo folder")
        result = scan_input(path, cfg(), body.get("overrides") or {})
        data = result.to_dict()
        first = next((f.photos[0] for f in result.folders.values() if f.photos), None)
        if first is not None:
            from ..photo_meta import read_meta
            data["first_capture"] = read_meta(first, cfg().get("inspection.timezone", "+05:30"))["captured_at"]
            data["demo_data"] = first.with_name(first.name + ".truth.json").exists()
        key = Workspace.key_for(data.get("suggested_turbine") or "x", data.get("suggested_date") or "0000-00-00")
        data["existing"] = Workspace(cfg().output_dir, key).exists() if data.get("suggested_turbine") else False
        return data

    @app.post("/api/model")
    def model(body: dict = Body(...)) -> dict[str, Any]:
        path = (body.get("model_path") or "").strip().strip('"')
        if not path:
            raise HTTPException(400, "Enter the model path")
        try:
            return describe_model(path, cfg())
        except FileNotFoundError as e:
            raise HTTPException(404, str(e)) from None
        except Exception as e:
            raise HTTPException(400, f"Could not load the model: {e}") from None

    @app.post("/api/run")
    def run(body: dict = Body(...)) -> dict[str, Any]:
        fields = {k: body.get(k) for k in RunRequest.__dataclass_fields__ if k in body}
        try:
            req = RunRequest(**fields)
        except TypeError as e:
            raise HTTPException(400, str(e)) from None
        if req.model_path == DEMO_MODEL and not req.camera.get("sensor_width_mm"):
            req.camera = {**SAMPLE_CAMERA, **req.camera}
        key = Workspace.key_for(req.turbine_code or "x", (req.inspection_date or "0000-00-00")[:10])
        job = jobs.start("run", f"Run {req.turbine_code} {req.inspection_date[:10]}",
                         lambda progress, cancel: run_inspection(req, cfg(), progress, cancel), key)
        return job

    @app.post("/api/sample")
    def sample() -> dict[str, Any]:
        out = cfg().root / "samples"

        def work(progress, cancel):
            root = make_sample(out, progress=lambda d, t: progress({"phase": "sample", "done": d, "total": t}))
            return {"input_dir": str(root)}

        return jobs.start("sample", "Making sample photos", work)

    @app.get("/api/job")
    def job() -> dict[str, Any] | None:
        return jobs.snapshot()

    @app.post("/api/job/cancel")
    def cancel_job() -> dict[str, Any]:
        jobs.cancel.set()
        return {"ok": True}

    # ---- inspections ------------------------------------------------------------
    def ws_summary(ws: Workspace) -> dict[str, Any]:
        insp = ws.read("inspection") or {}
        run = ws.read("run") or {}
        items = run.get("items", {})
        validation = ws.read("validation") or {}
        upload = ws.read("upload") or {}
        dets = gaps = 0
        review = (ws.read("review") or {}).get("points", {})
        for code, it in items.items():
            status, _ = effective_status(it, review.get(code))
            if status == "inspected":
                dets += len(kept_detections(it, review.get(code, {})))
            else:
                gaps += 1
        return {"key": ws.key, "turbine_code": insp.get("turbine_code"), "inspection_date": insp.get("inspection_date"),
                "inspection_id": insp.get("inspection_id"), "schema_version": insp.get("schema_version"),
                "model": insp.get("model"), "run_state": run.get("state"), "photos": len(items) - gaps,
                "gaps": gaps, "detections": dets, "review": review_summary(ws),
                "validation_ok": validation.get("ok"), "validation_errors": len(validation.get("errors", [])),
                "upload": upload or None, "updated_at": insp.get("updated_at")}

    @app.get("/api/inspections")
    def inspections() -> list[dict[str, Any]]:
        return [ws_summary(ws) for ws in Workspace.list_all(cfg().output_dir)]

    @app.get("/api/inspections/{key}")
    def inspection(key: str) -> dict[str, Any]:
        ws = ws_or_404(key)
        insp = ws.read("inspection") or {}
        items = (ws.read("run") or {}).get("items", {})
        review = (ws.read("review") or {}).get("points", {})
        pts = []
        comps = component_codes(items)
        for code in all_blade_codes() + comps["nacelle"] + comps["tower"]:
            it = items.get(code)
            rp = review.get(code, {})
            status, reason = effective_status(it, rp)
            kept = kept_detections(it, rp) if it and it.get("status") == "inspected" else []
            pts.append({"code": code, "group": (it or {}).get("group", "blade"), "status": status, "reason": reason,
                        "review_state": rp.get("state", "pending") if it and it.get("status") == "inspected" else None,
                        "count": len(kept), "max_cat": max((d["severity_suggested"] for d in kept), default=None),
                        "flagged": any(d.get("flags") for d in kept)})
        return {**ws_summary(ws), "inspection": insp, "points": pts, "validation": ws.read("validation"),
                "package_dir": str(ws.package_dir), "qa_dir": str(ws.qa_dir),
                "removed": sum(len(r.get("removed") or {}) for r in review.values())}

    @app.get("/api/inspections/{key}/points/{code}")
    def point(key: str, code: str) -> dict[str, Any]:
        ws = ws_or_404(key)
        items = (ws.read("run") or {}).get("items", {})
        if code not in items:
            raise HTTPException(404, "Unknown position code")
        rp = (ws.read("review") or {}).get("points", {}).get(code)
        return point_view(code, items[code], rp)

    @app.get("/api/inspections/{key}/image/{code}")
    def image(key: str, code: str, kind: str = "webp") -> FileResponse:
        try:
            ws = Workspace(cfg().output_dir, key)
        except ValueError:
            raise HTTPException(404, "Inspection not found") from None
        if not (parse_blade_code(code) or parse_component_code(code)):
            raise HTTPException(404, "Unknown position code")
        path = (ws.webp_dir / f"{code}.webp") if kind == "webp" else (ws.annotated_dir / f"{code}.jpg")
        if not path.exists():
            raise HTTPException(404, "No image for this point")
        return FileResponse(path, headers={"Cache-Control": "no-cache"})

    @app.post("/api/inspections/{key}/review")
    def review(key: str, body: dict = Body(...)) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        try:
            view = apply_action(ws, cfg(), body.get("code", ""), body.get("action", ""), by=body.get("by"),
                                reason=body.get("reason"), detection_id=body.get("detection_id"),
                                note=body.get("note"))
        except KeyError as e:
            raise HTTPException(404, str(e).strip("'")) from None
        except ValueError as e:
            raise HTTPException(400, str(e)) from None
        return {"point": view, "review": review_summary(ws)}

    @app.post("/api/inspections/{key}/bulk")
    def bulk(key: str, body: dict = Body(...)) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        n = bulk_approve(ws, body.get("by"), only_clean=body.get("action") != "approve_all")
        return {"approved": n, "review": review_summary(ws)}

    @app.post("/api/inspections/{key}/approve")
    def approve(key: str, body: dict = Body(...)) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        try:
            return {"review": approve_package(ws, cfg(), body.get("by", "")), "validation": ws.read("validation")}
        except ValueError as e:
            raise HTTPException(400, str(e)) from None

    @app.post("/api/inspections/{key}/revoke")
    def revoke(key: str, body: dict = Body(default={})) -> dict[str, Any]:
        guard_ws(key)
        return {"review": revoke_approval(ws_or_404(key), body.get("by"))}

    @app.post("/api/inspections/{key}/validate")
    def validate(key: str) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        build_package(ws, cfg())
        report = validate_package(ws.package_dir, cfg())
        ws.write("validation", report)
        return {"validation": report, "review": review_summary(ws)}

    @app.post("/api/inspections/{key}/schema")
    def schema(key: str, body: dict = Body(...)) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        version = str(body.get("schema_version"))
        if version not in ("1.0", "1.1"):
            raise HTTPException(400, "Package format must be 1.0 or 1.1")
        insp = ws.read("inspection")
        insp["schema_version"] = version
        ws.write("inspection", insp)
        build_package(ws, cfg())
        report = validate_package(ws.package_dir, cfg())
        ws.write("validation", report)
        return {"validation": report, "review": review_summary(ws)}

    @app.post("/api/inspections/{key}/turbine")
    def change_turbine(key: str, body: dict = Body(...)) -> dict[str, Any]:
        """Point the package at another turbine (code + blade length). Rebuilds it, so approve it again."""
        guard_ws(key)
        ws = ws_or_404(key)
        code = str(body.get("code") or "").strip()
        length = body.get("blade_length_m")
        if not code:
            raise HTTPException(400, "Choose a turbine")
        insp = ws.read("inspection")
        insp["turbine_code"] = code
        if length not in (None, ""):
            insp["blade_length_m"] = float(length)
        if body.get("org_id"):
            insp["cloud_target"] = {"org_id": body["org_id"], "org_name": body.get("org_name")}
        ws.write("inspection", insp)
        build_package(ws, cfg())
        report = validate_package(ws.package_dir, cfg())
        ws.write("validation", report)
        ws.log(f"turbine changed to {code} (blade length {insp.get('blade_length_m')} m); approve again")
        return {"validation": report, "review": review_summary(ws)}

    @app.post("/api/inspections/{key}/publish")
    def publish(key: str, body: dict = Body(...)) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        s = review_summary(ws)
        if not s["package_approved"]:
            raise HTTPException(400, "Approve the package in Review first" + (
                " (it changed after approval, so approve it again)" if s["approval_voided"] else ""))
        org_id, turbine = body.get("org_id"), body.get("turbine") or {}
        if not org_id or not turbine.get("code"):
            raise HTTPException(400, "Choose the organization and the turbine")
        c = cloud()
        conf = cfg()
        insp = ws.read("inspection") or {}

        def work(progress, cancel):
            report = validate_package(ws.package_dir, conf)
            ws.write("validation", report)
            if not report["ok"]:
                raise CloudError("The package no longer passes validation", report["errors"][:20])
            try:
                result = c.upload(ws.package_dir, org_id, turbine, s["approved_by"], s["approved_at"],
                                  progress=lambda e: progress({**e, "workspace": key}), cancel=cancel,
                                  parallel=int(conf.get("upload.parallel", 4)))
            except CloudError as e:
                ws.write("upload", {**(ws.read("upload") or {}), "status": "incomplete", "error": str(e),
                                    "details": e.details[:20], "at": now_iso()})
                ws.log(f"publish failed: {e}")
                raise
            result.update(org_name=body.get("org_name"), turbine=turbine.get("code"), approved_by=s["approved_by"])
            ws.write("upload", result)
            insp["cloud_target"] = {"org_id": org_id, "org_name": body.get("org_name")}
            ws.write("inspection", insp)
            ws.log(f"published to CompliQ ({body.get('org_name')}, {turbine.get('code')}): "
                   f"{result['images_sent']} images sent")
            return result

        return jobs.start("publish", f"Publish {key}", work, key)

    @app.post("/api/inspections/{key}/unpublish")
    def unpublish(key: str, body: dict = Body(default={})) -> dict[str, Any]:
        guard_ws(key)
        ws = ws_or_404(key)
        insp = ws.read("inspection") or {}
        if str(body.get("confirm", "")).strip().upper() != str(insp.get("turbine_code", "")).upper():
            raise HTTPException(400, "Type the turbine code to confirm")
        c = cloud()

        def work(progress, cancel):
            result = c.delete(insp["inspection_id"], body.get("by"),
                              progress=lambda e: progress({**e, "workspace": key}))
            ws.write("upload", {**(ws.read("upload") or {}), "status": "deleted", "deleted_at": now_iso(),
                                "deleted_by": body.get("by"), "images_deleted": result.get("images_deleted")})
            ws.log(f"deleted from CompliQ by {body.get('by')}: {result}")
            return result

        return jobs.start("unpublish", f"Delete {key} from CompliQ", work, key)

    @app.post("/api/inspections/{key}/open")
    def open_folder(key: str, body: dict = Body(...)) -> dict[str, Any]:
        ws = ws_or_404(key)
        target = ws.qa_dir if body.get("which") == "qa" else ws.package_dir
        try:
            if sys.platform.startswith("win"):
                os.startfile(str(target))  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                subprocess.Popen(["open", str(target)])
            else:
                subprocess.Popen(["xdg-open", str(target)])
        except OSError as e:
            return {"ok": False, "path": str(target), "error": str(e)}
        return {"ok": True, "path": str(target)}

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app
