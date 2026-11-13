"""Run -> package -> validator, and the review / approval rules."""
import json
import shutil

import pytest

from compliq_studio.package import build_package, package_fingerprint
from compliq_studio.pipeline import RunError, run_inspection
from compliq_studio.review import apply_action, approve_package, bulk_approve, summary
from compliq_studio.scheme import all_blade_codes, is_ulid
from compliq_studio.validator import validate_package
from compliq_studio.workspace import Workspace

from conftest import demo_request


def load(ws, name):
    return json.loads((ws.package_dir / name).read_text())


def test_demo_run_builds_a_valid_1_1_package(demo_run):
    cfg, key, result = demo_run
    ws = Workspace(cfg.output_dir, key)
    assert result["state"] == "complete" and result["validation_ok"], result
    assert sorted(p.name for p in ws.package_dir.iterdir()) == ["images", "manifest.json", "points.json"]
    m, doc = load(ws, "manifest.json"), load(ws, "points.json")
    assert m["schema_version"] == "1.1" and is_ulid(m["inspection_id"]) and m["status"] == "complete"
    assert [p["position_code"] for p in doc["points"]] == all_blade_codes()
    assert {c["component"] for c in doc["components"]} == {"nacelle", "tower"}
    assert m["image_count"] == 258 == len(list(ws.images_dir.iterdir()))
    assert m["components"]["nacelle"]["point_count"] == 8 and m["components"]["tower"]["point_count"] == 10
    p = next(p for p in doc["points"] if p["position_code"] == "B1-TE-07")
    assert p["distance_m"] == 15.32 and p["zone"] == "root" and p["detections"]
    d = p["detections"][0]
    assert d["class"] == "trailing_edge_split" and 3 <= d["severity_suggested"] <= 5
    assert d["length_mm"] and d["severity_reason"].startswith("class min 3")
    # blade 3 photos carry no laser range in the sample, so their sizes are null
    b3 = [p for p in doc["points"] if p["blade"] == 3 and p["detections"]]
    assert b3 and all(x["length_mm"] is None and "size unknown" in x["severity_reason"]
                      for p in b3 for x in p["detections"])
    # the weak 0.18 box and the unknown "bird" class never reach the package
    run = ws.read("run")["items"]
    assert sum(it["dropped"]["below_threshold"] for it in run.values() if it.get("dropped")) >= 1
    assert run["B2-LE-09"]["dropped"]["unknown_class"] == {"bird": 1}
    assert all(x["class"] != "bird" for p in doc["points"] for x in p["detections"])
    # QA files stay outside the package
    assert (ws.annotated_dir / "B1-TE-07.jpg").exists() and ws.qa_note_path.exists()


def test_rerun_reuses_unchanged_photos_and_keeps_the_id(demo_run, sample_dir):
    cfg, key, first = demo_run
    ws = Workspace(cfg.output_dir, key)
    iid = ws.read("inspection")["inspection_id"]
    again = run_inspection(demo_request(sample_dir), cfg)
    assert again["reused"] == 258 and again["processed"] == 0
    assert ws.read("inspection")["inspection_id"] == iid


def test_schema_1_0_has_blades_only(cfg, sample_dir):
    result = run_inspection(demo_request(sample_dir, schema_version="1.0"), cfg)
    ws = Workspace(cfg.output_dir, result["workspace"])
    m, doc = load(ws, "manifest.json"), load(ws, "points.json")
    assert result["validation_ok"] and m["schema_version"] == "1.0" and set(doc) == {"points"}
    assert "components" not in m and m["image_count"] == 240
    assert not any(f.name.startswith(("NAC", "TWR")) for f in ws.images_dir.iterdir())


def test_not_filmed_side_makes_a_partial_package(cfg, sample_dir):
    req = demo_request(sample_dir, overrides={"B2-TE": {"not_filmed": "wind gust aborted pass"}})
    result = run_inspection(req, cfg)
    ws = Workspace(cfg.output_dir, result["workspace"])
    m, doc = load(ws, "manifest.json"), load(ws, "points.json")
    assert result["validation_ok"] and m["status"] == "partial" and m["image_count"] == 238
    gap = next(p for p in doc["points"] if p["position_code"] == "B2-TE-11")
    assert gap["status"] == "unavailable" and gap["reason"] == "wind gust aborted pass"
    assert gap["image"] is None and gap["detections"] == []


def test_run_refuses_bad_input(cfg, tmp_path, sample_dir):
    with pytest.raises(RunError):
        run_inspection(demo_request(tmp_path), cfg)                     # no photo folders
    with pytest.raises(RunError):
        run_inspection(demo_request(sample_dir, turbine_code=" "), cfg)  # no turbine code


@pytest.mark.parametrize("breakage, expected", [
    (lambda doc, m, pkg: doc["points"].pop(), "expected 240 points"),
    (lambda doc, m, pkg: doc["points"][1].update(position_code="B1-SS-01"), "duplicate position codes"),
    (lambda doc, m, pkg: doc["points"][3]["detections"][0]["bbox"].update(x_min=0.9, x_max=0.2), "invalid bbox"),
    (lambda doc, m, pkg: doc["points"][3]["detections"][0].update(severity_suggested=9), "outside"),
    (lambda doc, m, pkg: doc["points"][3]["detections"][0].update(**{"class": "rust"}), "unknown class rust"),
    (lambda doc, m, pkg: doc["points"][0].update(status="failed"), "need a reason"),
    (lambda doc, m, pkg: doc["points"][0].update(zone="tip"), "zone"),
    (lambda doc, m, pkg: m.update(status="partial"), "status must be 'complete'"),
    (lambda doc, m, pkg: m.update(image_count=1), "image_count"),
    (lambda doc, m, pkg: (pkg / "images" / "B1-SS-01.webp").write_bytes(b"RIFF0000WEBPxxxx"), "B1-SS-01"),
    (lambda doc, m, pkg: (pkg / "notes.txt").write_text("x"), "only manifest.json"),
])
def test_validator_catches_broken_packages(demo_run, tmp_path, breakage, expected):
    cfg, key, _ = demo_run
    src = Workspace(cfg.output_dir, key).package_dir
    pkg = tmp_path / "pkg"
    shutil.copytree(src, pkg)
    doc = json.loads((pkg / "points.json").read_text())
    m = json.loads((pkg / "manifest.json").read_text())
    assert doc["points"][3]["position_code"] == "B1-SS-04" and doc["points"][3]["detections"]  # sample has a CAT box here
    breakage(doc, m, pkg)
    (pkg / "points.json").write_text(json.dumps(doc))
    entry = next(f for f in m["files"] if f["path"] == "points.json")
    from compliq_studio.imaging import sha256_file
    entry.update(bytes=(pkg / "points.json").stat().st_size, sha256=sha256_file(pkg / "points.json"))
    (pkg / "manifest.json").write_text(json.dumps(m))
    report = validate_package(pkg, cfg)
    assert not report["ok"]
    assert any(expected in e for e in report["errors"]), report["errors"]


def test_review_and_approval_rules(demo_run):
    cfg, key, _ = demo_run
    ws = Workspace(cfg.output_dir, key)
    items = ws.read("run")["items"]
    with pytest.raises(ValueError):
        approve_package(ws, cfg, "SK")                          # nothing reviewed yet
    n = bulk_approve(ws, "SK", only_clean=True)
    with_findings = [c for c, it in items.items() if it.get("detections")]
    assert n == 258 - len(with_findings)
    # remove a false positive, mark one photo unusable, approve the rest
    target = with_findings[0]
    det = items[target]["detections"][0]["detection_id"]
    view = apply_action(ws, cfg, target, "remove_detection", by="SK", detection_id=det, note="glare")
    assert view["kept_count"] == len(items[target]["detections"]) - 1
    assert det not in json.dumps(json.loads((ws.package_dir / "points.json").read_text()))
    apply_action(ws, cfg, with_findings[1], "fail", by="SK", reason="Blurred")
    for c in with_findings:
        if c != with_findings[1]:
            apply_action(ws, cfg, c, "approve", by="SK")
    s = approve_package(ws, cfg, "SK")
    assert s["package_approved"] and s["approved_by"] == "SK"
    doc = json.loads((ws.package_dir / "points.json").read_text())
    rec = next(r for r in doc["points"] + doc["components"] if r["position_code"] == with_findings[1])
    assert rec["status"] == "failed" and rec["reason"] == "Blurred" and rec["image"] is None
    assert json.loads((ws.package_dir / "manifest.json").read_text())["status"] == "partial"
    assert "glare" in ws.qa_note_path.read_text()
    # any later change voids the approval
    fp = package_fingerprint(ws)
    apply_action(ws, cfg, target, "restore_detection", by="SK", detection_id=det)
    assert package_fingerprint(ws) != fp and not summary(ws)["package_approved"] and summary(ws)["approval_voided"]
    # unchanged rebuild keeps it
    approve_package(ws, cfg, "SK")
    build_package(ws, cfg)
    assert summary(ws)["package_approved"]
