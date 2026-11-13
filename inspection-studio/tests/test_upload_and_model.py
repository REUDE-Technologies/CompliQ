"""Publishing straight to CompliQ (D1 + R2) against the fake Cloudflare, the browser app's API, and the real
Ultralytics code path."""
import json
import sqlite3
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from compliq_studio.cloud import Cloud, CloudError
from compliq_studio.pipeline import RunRequest, run_inspection
from compliq_studio.review import approve_package, bulk_approve
from compliq_studio.workspace import Workspace

from conftest import demo_request

H = {"X-Studio": "1"}
TURBINE = {"code": "WTG-001", "name": "WTG-001 Kayathar", "site": "Kayathar", "state": "Tamil Nadu",
           "blade_length_m": 48.5, "blade_serials": ["5297", "5310", "5288"], "manufacturer": "Gamesa", "model": "G97"}


def approved(cfg, key):
    ws = Workspace(cfg.output_dir, key)
    bulk_approve(ws, "SK", only_clean=False)
    approve_package(ws, cfg, "SK")
    return ws


def q(db, sql, *args):
    con = sqlite3.connect(db)
    try:
        return con.execute(sql, args).fetchall()
    finally:
        con.close()


def test_connection_orgs_and_turbines_from_dashboard(fake_cloud):
    cs, _, db = fake_cloud
    cloud = Cloud(cs)
    assert cloud.check() == {"ok": True, "organizations": 2, "problems": [], "bucket": "compliq-files"}
    assert [o["name"] for o in cloud.organizations()] == ["REUDE Technologies", "Acme Wind"]
    # a turbine that only exists in the dashboard's own saved data shows up in the list
    cloud.r2.s3.put_object(Bucket="compliq-files", Key="org/org-acme/data/reude_fleet_db.json", Body=json.dumps(
        {"turbines": [{"id": 3, "assetId": "WTG-009", "name": "WTG-009 Bhuj", "site": "Bhuj", "rotorDia": 120,
                       "gps": {"lat": 23.3, "lng": 70.6}, "blades": ["7001", "7002", "7003"]}], "defects": []}).encode())
    con = sqlite3.connect(db)
    con.execute("INSERT INTO fleet_data (org_id, key, r2_key, bytes) VALUES "
                "('org-acme', 'reude_fleet_db', 'org/org-acme/data/reude_fleet_db.json', 1)")
    con.commit()
    con.close()
    [t] = cloud.turbines("org-acme")
    assert (t["code"], t["in_dashboard"], t["in_database"], t["blade_length_m"]) == ("WTG-009", True, False, 60.0)
    assert t["blade_serials"] == ["7001", "7002", "7003"] and t["latitude"] == 23.3


def test_wrong_keys_and_missing_migration(fake_cloud, tmp_path):
    cs, _, db = fake_cloud
    bad = Cloud(type(cs)(**{**cs.__dict__, "api_token": "nope"}))
    with pytest.raises(CloudError, match="refused the API token"):
        bad.organizations()
    bad_r2 = Cloud(type(cs)(**{**cs.__dict__, "r2_access_key_id": "nope"}))
    with pytest.raises(CloudError, match="refused the access keys"):
        bad_r2.r2.check()
    with pytest.raises(CloudError, match="not set up"):
        Cloud(type(cs)(account_id="", d1_database_id=""))
    con = sqlite3.connect(db)                          # simulate a database without migration 0002
    con.execute("ALTER TABLE inspections DROP COLUMN approved_by")
    con.commit()
    con.close()
    assert "migration 0002" in Cloud(cs).check()["problems"][0]


def test_publish_resume_republish_delete(demo_run, fake_cloud):
    cfg, key, _ = demo_run
    cs, app, db = fake_cloud
    ws = approved(cfg, key)
    cloud = Cloud(cs)
    stop, seen = threading.Event(), []

    def progress(e):
        if e.get("phase") == "images" and e.get("code"):
            seen.append(e["code"])
            if len(seen) == 40:
                stop.set()

    with pytest.raises(CloudError, match="cancelled"):
        cloud.upload(ws.package_dir, "org-acme", TURBINE, "SK", "2026-11-04T12:00:00Z", progress=progress, cancel=stop)
    assert q(db, "SELECT COUNT(*) FROM inspections") == [(0,)]          # nothing visible yet
    res = cloud.upload(ws.package_dir, "org-acme", TURBINE, "SK", "2026-11-04T12:00:00Z")
    assert res["status"] == "published" and res["images_already_there"] >= 40
    assert res["images_sent"] + res["images_already_there"] == 258
    iid = res["inspection_id"]
    [(status, approved_by, images, dets, tool)] = q(db, "SELECT status, approved_by, image_count, detection_count, "
                                                    "upload_tool FROM inspections WHERE id = ?", iid)
    assert (status, approved_by, images) == ("published", "SK", 258) and tool.startswith("inspection-studio")
    assert q(db, "SELECT COUNT(*), SUM(component = 'blade'), SUM(component = 'nacelle') FROM inspection_points") \
        == [(258, 240, 8)]
    assert q(db, "SELECT COUNT(*), COUNT(DISTINCT trend) FROM detections") == [(dets, 1)]
    assert q(db, "SELECT code, name, blade_length_m, added_by FROM turbines") == [("WTG-001", "WTG-001 Kayathar", 48.5, "SK")]
    assert q(db, "SELECT blade, serial FROM blades ORDER BY blade") == [(1, "5297"), (2, "5310"), (3, "5288")]
    nac = q(db, "SELECT position_code, blade, side, zone, point, drone_altitude_m FROM inspection_points "
                "WHERE component = 'nacelle' ORDER BY point LIMIT 1")
    assert nac == [("NAC-01", None, None, None, 1, 92.0)]
    keys = sorted(p.name for p in (Path(db).parent / "r2" / "org" / "org-acme" / "insp" / iid).glob("*.webp"))
    assert len(keys) == 258 and keys[0] == "B1-LE-01.webp"
    # the same package again: nothing written twice
    again = cloud.upload(ws.package_dir, "org-acme", TURBINE, "SK", None)
    assert again["already_published"] and q(db, "SELECT COUNT(*) FROM inspections") == [(1,)]
    # delete: rows (cascade) and images go, the activity log keeps a line
    out = cloud.delete(iid, "SK")
    assert out["deleted"] and out["images_deleted"] == 258
    assert q(db, "SELECT COUNT(*) FROM inspections") == [(0,)] and q(db, "SELECT COUNT(*) FROM detections") == [(0,)]
    assert not list((Path(db).parent / "r2" / "org" / "org-acme" / "insp" / iid).glob("*.webp"))
    assert [r[0] for r in q(db, "SELECT type FROM activity_events ORDER BY id")] == ["inspection_published",
                                                                                     "inspection_deleted"]
    # and it can be published again afterwards
    assert cloud.upload(ws.package_dir, "org-acme", TURBINE, "SK", None)["images_sent"] == 258


def test_second_inspection_gets_a_trend(cfg, sample_dir, fake_cloud):
    cs, _, db = fake_cloud
    cloud = Cloud(cs)
    first = run_inspection(demo_request(sample_dir, schema_version="1.0"), cfg)
    cloud.upload(approved(cfg, first["workspace"]).package_dir, "org-acme", TURBINE, "SK", None)
    second = run_inspection(demo_request(sample_dir, schema_version="1.0", inspection_date="2026-12-04T10:30:00+05:30"), cfg)
    res = cloud.upload(approved(cfg, second["workspace"]).package_dir, "org-acme", TURBINE, "SK", None)
    trends = dict(q(db, "SELECT trend, COUNT(*) FROM detections WHERE inspection_id = ? GROUP BY trend", res["inspection_id"]))
    assert trends.get("stable", 0) > 0 and "new" not in trends   # same defects, same sizes
    assert q(db, "SELECT COUNT(*) FROM turbines") == [(1,)]


def test_turbine_rules(fake_cloud):
    cloud = Cloud(fake_cloud[0])
    with pytest.raises(CloudError, match="blade serials"):
        cloud.ensure_turbine("org-acme", {**TURBINE, "blade_serials": ["1", ""]}, "SK")
    with pytest.raises(CloudError, match="blade length"):
        cloud.ensure_turbine("org-acme", {**TURBINE, "blade_length_m": None}, "SK")
    tid = cloud.ensure_turbine("org-acme", TURBINE, "SK")
    assert cloud.ensure_turbine("org-acme", {"code": "WTG-001"}, "SK") == tid      # existing: serials not needed


def test_wrong_turbine_or_other_org(demo_run, fake_cloud):
    cfg, key, _ = demo_run
    ws = approved(cfg, key)
    cloud = Cloud(fake_cloud[0])
    with pytest.raises(CloudError, match="is selected"):
        cloud.upload(ws.package_dir, "org-acme", {**TURBINE, "code": "WTG-777"}, "SK", None)
    cloud.upload(ws.package_dir, "org-acme", TURBINE, "SK", None)
    reude = cloud.organizations()[0]["id"]
    with pytest.raises(CloudError, match="another organization"):
        cloud.upload(ws.package_dir, reude, TURBINE, "SK", None)


def test_app_api_flow(cfg, sample_dir, fake_cloud, monkeypatch):
    from compliq_studio.app import server

    cs, _, db = fake_cloud
    cfg.settings["cloudflare"] = {**cs.__dict__}
    monkeypatch.setattr(server, "load_config", lambda root=None: cfg)
    monkeypatch.setattr(server, "save_local_settings", lambda updates, root=None: None)
    c = TestClient(server.create_app(), base_url="http://localhost")
    info = c.get("/api/info").json()
    assert info["settings"]["cloudflare"]["api_token"] == "" and info["settings"]["cloudflare"]["api_token_set"]
    assert c.post("/api/scan", json={"input_dir": str(sample_dir)}).status_code == 403   # no X-Studio header
    assert c.post("/api/cloud/test", headers=H).json()["ok"]
    orgs = c.get("/api/cloud/orgs").json()
    acme = next(o for o in orgs if o["name"] == "Acme Wind")
    job = c.post("/api/run", headers=H, json={"input_dir": str(sample_dir), "turbine_code": "WTG-001",
                                              "inspection_date": "2026-11-04T10:30:00+05:30", "blade_length_m": 48.5,
                                              "model_path": "demo", "schema_version": "1.0",
                                              "cloud_target": {"org_id": acme["id"], "org_name": "Acme Wind"}}).json()

    def wait():
        for _ in range(600):
            j = c.get("/api/job").json()
            if j["state"] != "running":
                return j
            time.sleep(0.2)

    job = wait()
    assert job["state"] == "done", job
    key = job["result"]["workspace"]
    assert c.get(f"/api/inspections/{key}").json()["inspection"]["cloud_target"]["org_id"] == acme["id"]
    assert c.get(f"/api/inspections/{key}/image/..%2F..%2Fsecret").status_code == 404
    body = {"org_id": acme["id"], "org_name": "Acme Wind", "turbine": TURBINE}
    assert c.post(f"/api/inspections/{key}/publish", headers=H, json=body).status_code == 400    # not approved
    c.post(f"/api/inspections/{key}/bulk", headers=H, json={"action": "approve_all", "by": "SK"})
    assert c.post(f"/api/inspections/{key}/approve", headers=H, json={"by": "SK"}).status_code == 200
    c.post(f"/api/inspections/{key}/publish", headers=H, json=body)
    job = wait()
    assert job["state"] == "done" and job["result"]["status"] == "published", job
    assert c.get("/api/inspections").json()[0]["upload"]["status"] == "published"
    assert [t["code"] for t in c.get(f"/api/cloud/turbines?org_id={acme['id']}").json()] == ["WTG-001"]
    assert c.post(f"/api/inspections/{key}/unpublish", headers=H, json={"by": "SK", "confirm": "nope"}).status_code == 400
    c.post(f"/api/inspections/{key}/unpublish", headers=H, json={"by": "SK", "confirm": "wtg-001"})
    job = wait()
    assert job["state"] == "done" and q(db, "SELECT COUNT(*) FROM inspections") == [(0,)]
    # switching the package to another turbine rebuilds it and voids the approval
    r = c.post(f"/api/inspections/{key}/turbine", headers=H, json={"code": "WTG-002", "blade_length_m": 50}).json()
    assert r["validation"]["ok"] and not r["review"]["package_approved"] and r["review"]["approval_voided"]


def _untrained_model(path: Path, names):
    import torch
    from ultralytics.nn.tasks import DetectionModel

    m = DetectionModel("yolo11n.yaml", nc=len(names), verbose=False)
    m.names = dict(enumerate(names))
    torch.save({"model": m.half(), "train_args": {"imgsz": 320, "task": "detect"}}, path)
    (path.parent / "model.json").write_text(json.dumps({"model_name": "test-untrained", "model_version": "9.9.9"}))


@pytest.mark.parametrize("tiled", [False, True])
def test_real_ultralytics_path(cfg, tmp_path, tiled):
    pytest.importorskip("ultralytics")
    names = ["leading_edge_erosion", "coating_gelcoat_damage", "crack", "trailing_edge_split",
             "lightning_damage", "rust"]                          # 'rust' is not a CompliQ class
    model = tmp_path / "models" / "model.pt"
    model.parent.mkdir()
    _untrained_model(model, names)
    root = tmp_path / "photos"
    (root / "B1-SS").mkdir(parents=True)
    for i in (1, 2):                                             # numbered: P01, P02; the rest unavailable
        Image.new("RGB", (900, 600), (90 + i * 40, 140, 200)).save(root / "B1-SS" / f"{i:02d}.jpg")
    for c in cfg.classes.values():                               # random weights: let low scores through
        object.__setattr__(c, "threshold", 0.0)
    cfg.settings["model"].update(imgsz=320, tiled=tiled, tile_size=400, tile_overlap=0.2)
    overrides = {k: {"not_filmed": "test"} for k in
                 [f"B{b}-{s}" for b in (1, 2, 3) for s in ("SS", "LE", "PS", "TE")] if k != "B1-SS"}
    req = RunRequest(input_dir=str(root), turbine_code="WTG-002", inspection_date="2026-11-04",
                     blade_length_m=50, model_path=str(model), overrides=overrides,
                     camera={"distance_to_blade_m": 10, "focal_length_mm": 24, "sensor_width_mm": 13.2})
    result = run_inspection(req, cfg)
    assert result["validation_ok"], result["validation_errors"]
    assert result["unknown_model_classes"] == ["rust"]
    ws = Workspace(cfg.output_dir, result["workspace"])
    m = json.loads((ws.package_dir / "manifest.json").read_text())
    assert m["model_name"] == "test-untrained" and m["model_version"] == "9.9.9" and m["status"] == "partial"
    assert m["inspection_date"] == "2026-11-04T00:00:00+05:30"
    p1 = json.loads((ws.package_dir / "points.json").read_text())["points"][0]
    assert p1["status"] == "inspected" and p1["image_width"] == 900 and p1["mm_per_px"]
    assert p1["detections"] and all(d["length_mm"] is not None for d in p1["detections"])
    assert all(d["class"] != "rust" for d in p1["detections"])
