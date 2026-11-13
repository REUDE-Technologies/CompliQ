"""Command line.

    python -m compliq_studio app                      start the browser app (default)
    python -m compliq_studio sample                   make synthetic sample photos in samples/
    python -m compliq_studio scan  <photo folder>     check the 14 folders
    python -m compliq_studio run   <photo folder> --turbine WTG-001 --date 2026-11-04T10:30:00+05:30 --blade-length 48.5
    python -m compliq_studio validate <package folder>
    python -m compliq_studio upload   <package folder> --org "Acme Wind"
    python -m compliq_studio delete   <package folder> --by "SK"

Approval happens in the app's Review screen; `upload` refuses a package that is not approved.
Uploads go straight to CompliQ's Cloudflare database and storage with the keys saved in Settings
(config/settings.local.yaml). The turbine must already be in CompliQ; add new turbines in the app.
"""
from __future__ import annotations

import argparse
import json
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

from .config import load_config


def _free_port(preferred: int) -> int:
    for port in [preferred] + list(range(preferred + 1, preferred + 20)):
        with socket.socket() as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("No free port found for the app")


def cmd_app(args: argparse.Namespace) -> int:
    import uvicorn

    from .app.server import create_app

    port = _free_port(args.port)
    url = f"http://localhost:{port}/"
    print(f"CompliQ Inspection Studio — {url}  (Ctrl+C to stop)")
    if not args.no_browser:
        threading.Thread(target=lambda: (time.sleep(1.2), webbrowser.open(url)), daemon=True).start()
    uvicorn.run(create_app(), host="127.0.0.1", port=port, log_level="warning")
    return 0


def cmd_sample(args: argparse.Namespace) -> int:
    from .sample import SAMPLE_CAMERA, make_sample

    cfg = load_config()
    out = Path(args.out) if args.out else cfg.root / "samples"
    print("Making 258 synthetic photos (about 40 s)…")
    root = make_sample(out)
    print(f"Done: {root}\nRun it with model 'demo', e.g.\n  python -m compliq_studio run \"{root}\" --turbine WTG-001 "
          f"--date 2026-11-04T10:30:00+05:30 --blade-length 48.5 --model demo "
          f"--sensor-width {SAMPLE_CAMERA['sensor_width_mm']}")
    return 0


def cmd_scan(args: argparse.Namespace) -> int:
    from .scanner import scan_input

    result = scan_input(args.input, load_config())
    data = result.to_dict()
    for key, f in data["folders"].items():
        mark = "OK " if not f["issues"] else "FIX"
        print(f"[{mark}] {key:8} {f['photo_count']:3} photos  {f['path'] or '-':30} {f['mode']}")
        for i in f["issues"]:
            print(f"        ! {i}")
        for w in f["warnings"]:
            print(f"        · {w}")
    for w in data["warnings"]:
        print(f"· {w}")
    print("Ready to run." if data["ok"] else "Fix the folders marked FIX before running.")
    return 0 if data["ok"] else 1


def cmd_run(args: argparse.Namespace) -> int:
    from .pipeline import RunError, RunRequest, run_inspection

    cfg = load_config()
    camera = {k: v for k, v in {"distance_to_blade_m": args.distance, "focal_length_mm": args.focal,
                                "sensor_width_mm": args.sensor_width}.items() if v is not None}
    req = RunRequest(input_dir=args.input, turbine_code=args.turbine, inspection_date=args.date,
                     blade_length_m=args.blade_length, model_path=args.model, source_video=args.source,
                     camera=camera, schema_version=args.schema, new_inspection=args.new, fresh=args.fresh)

    def progress(e: dict) -> None:
        if e.get("phase") == "running":
            eta = f", about {e['eta_s']} s left" if e.get("eta_s") is not None else ""
            print(f"\r{e['done']:>3}/{e['total']}  {e['code']:8} {e['detections']} found{eta}      ", end="", flush=True)
        elif e.get("message"):
            print(f"\n{e['message']}")

    try:
        result = run_inspection(req, cfg, progress)
    except RunError as e:
        print(f"\n{e}")
        for d in e.details:
            print(f"  - {d}")
        return 1
    print(f"\n{json.dumps(result, indent=2)}")
    print(f"Package: {cfg.output_dir / result['workspace']}\nReview and approve it in the app before uploading.")
    return 0 if result.get("validation_ok") else 2


def cmd_validate(args: argparse.Namespace) -> int:
    from .validator import validate_package

    report = validate_package(args.package, load_config())
    for e in report["errors"]:
        print(f"ERROR    {e}")
    for w in report["warnings"]:
        print(f"warning  {w}")
    print(f"{'Valid' if report['ok'] else 'Not valid'}: {report['stats']}")
    return 0 if report["ok"] else 1


def _cloud_workspace(package: str):
    from .cloud import Cloud, CloudSettings
    from .workspace import Workspace

    pkg = Path(package).resolve()
    ws = Workspace(pkg.parent, pkg.name)
    if not ws.exists():
        raise SystemExit(f"{pkg} is not a package made by this app (no {pkg.name}_qa folder next to it).")
    return ws, Cloud(CloudSettings.from_config(load_config()))


def cmd_upload(args: argparse.Namespace) -> int:
    from .cloud import CloudError
    from .review import summary

    try:
        ws, cloud = _cloud_workspace(args.package)
        s = summary(ws)
        if not s["package_approved"]:
            print("This package is not approved (or changed after approval). Approve it in the app's Review screen.")
            return 1
        insp = ws.read("inspection")
        orgs = cloud.organizations()
        wanted = (args.org or "").lower()
        org = next((o for o in orgs if wanted and wanted in (o["name"].lower(), o["org_key"], o["id"])), None) or \
            next((o for o in orgs if o["id"] == (insp.get("cloud_target") or {}).get("org_id")), None)
        if org is None:
            print("Choose the organization with --org. Organizations: " + ", ".join(o["name"] for o in orgs))
            return 1
        code = insp["turbine_code"]
        turbine = next((t for t in cloud.turbines(org["id"]) if t["code"].upper() == code.upper()), None)
        if turbine is None:
            print(f"{code} is not in {org['name']} yet. Add it when publishing from the app (Package screen).")
            return 1

        def progress(e: dict) -> None:
            if e.get("total"):
                print(f"\r{e['phase']:9} {e.get('done', 0)}/{e['total']}   ", end="", flush=True)
            elif e.get("message"):
                print(f"\n{e['message']}")

        result = cloud.upload(ws.package_dir, org["id"], turbine, s["approved_by"], s["approved_at"], progress=progress)
    except CloudError as e:
        print(f"\n{e}")
        for d in e.details[:20]:
            print(f"  - {d}")
        print("Run the same command again to finish; images already sent are skipped.")
        return 1
    result.update(org_name=org["name"], turbine=code, approved_by=s["approved_by"])
    ws.write("upload", result)
    print(f"\nPublished {result['inspection_id']} to {org['name']} ({result['images_sent']} images sent).")
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    from .cloud import CloudError
    from .review import now_iso

    ws, cloud = _cloud_workspace(args.package)
    insp = ws.read("inspection")
    answer = input(f"Delete {insp['turbine_code']} {insp['inspection_date'][:10]} from CompliQ? Type the turbine code: ")
    if answer.strip().upper() != insp["turbine_code"].upper():
        print("Not deleted.")
        return 1
    try:
        result = cloud.delete(insp["inspection_id"], args.by)
    except CloudError as e:
        print(e)
        return 1
    ws.write("upload", {**(ws.read("upload") or {}), "status": "deleted", "deleted_at": now_iso(), "deleted_by": args.by})
    print(f"Deleted ({result.get('images_deleted', 0)} images)." if result["deleted"] else result.get("message"))
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="compliq_studio", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd")
    a = sub.add_parser("app", help="start the browser app")
    a.add_argument("--port", type=int, default=8765)
    a.add_argument("--no-browser", action="store_true")
    s = sub.add_parser("sample", help="make synthetic sample photos")
    s.add_argument("--out")
    sc = sub.add_parser("scan", help="check an input folder")
    sc.add_argument("input")
    r = sub.add_parser("run", help="run the model and build the package")
    r.add_argument("input")
    r.add_argument("--turbine", required=True)
    r.add_argument("--date", required=True, help="e.g. 2026-11-04T10:30:00+05:30")
    r.add_argument("--blade-length", type=float)
    r.add_argument("--model", help="path to model.pt (default from settings) or 'demo'")
    r.add_argument("--source", help="where the originals live, e.g. 'Drive: Inspections/2026/WTG-001'")
    r.add_argument("--distance", type=float, help="distance to blade in m, when photos have no laser range")
    r.add_argument("--focal", type=float, help="focal length in mm (default: from EXIF)")
    r.add_argument("--sensor-width", type=float, help="sensor width in mm")
    r.add_argument("--schema", choices=["1.0", "1.1"])
    r.add_argument("--fresh", action="store_true", help="re-process every photo")
    r.add_argument("--new", action="store_true", help="new inspection_id even if this turbine/date exists")
    v = sub.add_parser("validate", help="validate a package folder")
    v.add_argument("package")
    u = sub.add_parser("upload", help="publish an approved package to CompliQ")
    u.add_argument("package")
    u.add_argument("--org", help="organization name (default: the one picked in the app)")
    dl = sub.add_parser("delete", help="delete a published package from CompliQ")
    dl.add_argument("package")
    dl.add_argument("--by", required=True, help="your name, for the activity log")
    args = ap.parse_args(argv)
    handlers = {"app": cmd_app, "sample": cmd_sample, "scan": cmd_scan, "run": cmd_run, "validate": cmd_validate,
                "upload": cmd_upload, "delete": cmd_delete}
    if args.cmd is None:
        args = ap.parse_args(["app"] + (argv or sys.argv[1:]))
    return handlers[args.cmd](args)
