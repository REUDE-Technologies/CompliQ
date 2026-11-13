"""Direct connection to CompliQ's Cloudflare storage — no dashboard login.

    D1 (database)       Cloudflare REST API  POST /accounts/{account}/d1/database/{db}/query   (API token, D1 Edit)
    R2 (image storage)  S3-compatible API    https://{account}.r2.cloudflarestorage.com       (R2 access keys)

The tool writes exactly what the dashboard's Worker reads: one inspection row, its points, its detections and
one WebP per inspected point at org/{org_id}/insp/{inspection_id}/{code}.webp. It never touches the
dashboard's own saved data; the dashboard merges turbines added here into its fleet when it loads.
Needs migration 0002_inspection_tool.sql on the database.
"""
from __future__ import annotations

import json
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

import requests

from . import __version__

Progress = Callable[[dict[str, Any]], None]
BATCH_SIZE = 40                      # statements per D1 call (the free plan counts a batch as one query)
SECRET_FIELDS = ("api_token", "r2_secret_access_key")

# Same rule the Worker runs on publish (src/inspections.ts): same class at the same position code in this
# turbine's previous published inspection -> none: new, length grew > 10 %: worsening, else stable.
TREND_SQL = """UPDATE detections SET trend = (
  SELECT CASE WHEN prev.id IS NULL THEN 'new'
              WHEN COALESCE(detections.length_mm, 0) > COALESCE(prev.length_mm, 0) * 1.1 THEN 'worsening'
              ELSE 'stable' END
    FROM (SELECT 1) LEFT JOIN (
      SELECT d2.id, d2.length_mm FROM detections d2
        JOIN inspection_points p2 ON p2.id = d2.point_id
        JOIN inspection_points p1 ON p1.id = detections.point_id
       WHERE d2.inspection_id = (SELECT i2.id FROM inspections i2
                                  WHERE i2.turbine_id = ? AND i2.status = 'published' AND i2.inspection_date < ?
                                  ORDER BY i2.inspection_date DESC LIMIT 1)
         AND p2.position_code = p1.position_code AND d2.class = detections.class
         AND d2.review_status != 'rejected'
       ORDER BY d2.length_mm DESC LIMIT 1) prev)
WHERE inspection_id = ?"""


class CloudError(Exception):
    def __init__(self, message: str, details: list[str] | None = None):
        super().__init__(message)
        self.details = details or []


@dataclass
class CloudSettings:
    account_id: str = ""
    d1_database_id: str = ""
    api_token: str = ""
    r2_bucket: str = "compliq-files"
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    api_base: str = "https://api.cloudflare.com/client/v4"
    r2_endpoint: str = ""
    timeout_s: float = 60

    @classmethod
    def from_config(cls, cfg: Any) -> "CloudSettings":
        s = dict(cfg.get("cloudflare", {}) or {})
        keep = {k: (str(v).strip() if v is not None else "") for k, v in s.items() if k in cls.__dataclass_fields__}
        if "timeout_s" in keep:
            keep["timeout_s"] = float(keep["timeout_s"] or 60)
        return cls(**{k: v for k, v in keep.items() if v != "" or k in ("r2_endpoint",)})

    def missing(self) -> list[str]:
        names = {"account_id": "Account ID", "d1_database_id": "D1 database ID", "api_token": "API token",
                 "r2_bucket": "R2 bucket", "r2_access_key_id": "R2 access key ID",
                 "r2_secret_access_key": "R2 secret access key"}
        return [label for f, label in names.items() if not getattr(self, f)]

    @property
    def endpoint(self) -> str:
        return self.r2_endpoint or f"https://{self.account_id}.r2.cloudflarestorage.com"


# ---------------------------------------------------------------- D1 over the REST API
class D1:
    def __init__(self, s: CloudSettings):
        self.s = s
        self.url = f"{s.api_base.rstrip('/')}/accounts/{s.account_id}/d1/database/{s.d1_database_id}/query"
        self.http = requests.Session()
        self.http.headers.update({"Authorization": f"Bearer {s.api_token}",
                                  "User-Agent": f"compliq-inspection-studio/{__version__}"})

    def _post(self, body: dict) -> list[dict]:
        last = None
        for attempt in range(4):
            try:
                r = self.http.post(self.url, json=body, timeout=self.s.timeout_s)
            except (requests.ConnectionError, requests.Timeout) as e:
                last = CloudError(f"Could not reach Cloudflare ({e.__class__.__name__}). Check the connection.")
                time.sleep(1.5 * (attempt + 1))
                continue
            if r.status_code in (429, 500, 502, 503, 504):
                last = CloudError(f"Cloudflare answered {r.status_code}; try again in a minute.")
                time.sleep(1.5 * (attempt + 1))
                continue
            try:
                data = r.json()
            except ValueError:
                raise CloudError(f"Cloudflare answered {r.status_code} without JSON") from None
            if r.status_code in (401, 403) or (not data.get("success") and any(
                    e.get("code") in (10000, 9109, 7403) for e in data.get("errors", []))):
                raise CloudError("Cloudflare refused the API token. Check the token, account ID and that the "
                                 "token has 'D1: Edit' on this account.")
            if not data.get("success", False):
                msgs = [str(e.get("message", e)) for e in data.get("errors", [])] or [f"HTTP {r.status_code}"]
                raise CloudError(f"Database error: {msgs[0]}", msgs)
            return data.get("result") or []
        raise last or CloudError("Cloudflare did not answer")

    def query(self, sql: str, params: Iterable[Any] = ()) -> list[dict]:
        result = self._post({"sql": sql, "params": list(params)})
        return (result[0].get("results") if result else []) or []

    def batch(self, statements: list[tuple[str, list[Any]]]) -> list[list[dict]]:
        if not statements:
            return []
        result = self._post({"batch": [{"sql": sql, "params": list(p)} for sql, p in statements]})
        return [(r.get("results") or []) for r in result]


# ---------------------------------------------------------------- R2 over the S3 API
class R2:
    def __init__(self, s: CloudSettings):
        import boto3
        from botocore.config import Config

        self.bucket = s.r2_bucket
        self.s3 = boto3.client(
            "s3", endpoint_url=s.endpoint, region_name="auto",
            aws_access_key_id=s.r2_access_key_id, aws_secret_access_key=s.r2_secret_access_key,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"},
                          retries={"max_attempts": 4, "mode": "standard"},
                          request_checksum_calculation="when_required",       # what R2 expects from new boto3
                          response_checksum_validation="when_required",
                          connect_timeout=15, read_timeout=s.timeout_s))

    @staticmethod
    def _explain(e: Exception) -> CloudError:
        code = getattr(e, "response", {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else ""
        if code in ("AccessDenied", "InvalidAccessKeyId", "SignatureDoesNotMatch", "Unauthorized"):
            return CloudError("R2 refused the access keys. Check the key ID, secret and that the key has "
                              "'Object Read & Write' on the bucket.")
        if code == "NoSuchBucket":
            return CloudError("R2 bucket not found. Check the bucket name (compliq-files).")
        return CloudError(f"R2 error: {e}")

    def check(self) -> None:
        try:
            self.s3.list_objects_v2(Bucket=self.bucket, MaxKeys=1, Prefix="org/")
        except Exception as e:
            raise self._explain(e) from None

    def sha_of(self, key: str) -> str | None:
        try:
            head = self.s3.head_object(Bucket=self.bucket, Key=key)
        except Exception as e:
            if getattr(e, "response", {}).get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return None
            raise self._explain(e) from None
        return (head.get("Metadata") or {}).get("sha256")

    def put(self, key: str, data: bytes, sha256: str, content_type: str = "image/webp") -> None:
        try:
            self.s3.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type,
                               Metadata={"sha256": sha256})
        except Exception as e:
            raise self._explain(e) from None

    def get_json(self, key: str) -> Any:
        try:
            obj = self.s3.get_object(Bucket=self.bucket, Key=key)
        except Exception as e:
            if getattr(e, "response", {}).get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return None
            raise self._explain(e) from None
        return json.loads(obj["Body"].read().decode("utf-8"))

    def delete(self, key: str) -> None:
        try:
            self.s3.delete_object(Bucket=self.bucket, Key=key)
        except Exception as e:
            raise self._explain(e) from None


# ---------------------------------------------------------------- the service the app uses
def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _num(v: Any) -> float | None:
    try:
        return float(v) if v not in (None, "", "—") else None
    except (TypeError, ValueError):
        return None


class Cloud:
    def __init__(self, s: CloudSettings):
        missing = s.missing()
        if missing:
            raise CloudError("Cloudflare connection is not set up: " + ", ".join(missing) +
                             ". Fill them in under Settings → Cloudflare.")
        self.s = s
        self.d1 = D1(s)
        self._r2: R2 | None = None

    @property
    def r2(self) -> R2:
        if self._r2 is None:
            self._r2 = R2(self.s)
        return self._r2

    # ---- connection -------------------------------------------------------
    def check(self) -> dict[str, Any]:
        orgs = self.d1.query("SELECT COUNT(*) AS n FROM organizations")
        problems = []
        try:
            self.d1.query("SELECT component, captured_at FROM inspection_points LIMIT 0")
            self.d1.query("SELECT name, added_by FROM turbines LIMIT 0")
            self.d1.query("SELECT approved_by FROM inspections LIMIT 0")
        except CloudError:
            problems.append("The database is missing migration 0002_inspection_tool.sql. In the compliq-cloudflare "
                            "folder run: npm run db:migrate:remote")
        self.r2.check()
        return {"ok": not problems, "organizations": orgs[0]["n"] if orgs else 0, "problems": problems,
                "bucket": self.s.r2_bucket}

    # ---- organizations and turbines ---------------------------------------------
    def organizations(self) -> list[dict]:
        return self.d1.query("SELECT id, name, org_key, is_platform FROM organizations "
                             "ORDER BY is_platform DESC, name COLLATE NOCASE")

    def turbines(self, org_id: str) -> list[dict]:
        """The organization's turbines: those already in the database plus those in the dashboard's fleet."""
        rows = self.d1.query(
            """SELECT t.id, t.code, t.name, t.site, t.state, t.latitude, t.longitude, t.manufacturer, t.model,
                      t.blade_length_m, t.rotor_diameter_m, t.hub_height_m, t.rated_power_mw, t.commissioned_year,
                      (SELECT json_group_array(serial) FROM (SELECT serial FROM blades b WHERE b.turbine_id = t.id
                         ORDER BY b.blade)) AS blade_serials,
                      (SELECT COUNT(*) FROM inspections i WHERE i.turbine_id = t.id AND i.status = 'published')
                         AS inspections
                 FROM turbines t WHERE t.org_id = ? ORDER BY t.code""", [org_id])
        out: dict[str, dict] = {}
        for r in rows:
            r = dict(r)
            r["blade_serials"] = json.loads(r.get("blade_serials") or "[]")
            r.update(in_database=True, in_dashboard=False, d1_id=r.pop("id"))
            out[r["code"].upper()] = r
        for t in self._dashboard_turbines(org_id):
            code = str(t.get("assetId") or "").strip()
            if not code:
                continue
            serials = [str(b) for b in (t.get("blades") or []) if str(b).strip()][:3]
            gps = t.get("gps") or {}
            dash = {"code": code, "name": t.get("name") or code, "site": t.get("site"), "state": t.get("state"),
                    "latitude": _num(gps.get("lat")), "longitude": _num(gps.get("lng")),
                    "manufacturer": t.get("manufacturer"), "model": t.get("model"),
                    "blade_length_m": _num(t.get("bladeLength")) or (round(_num(t.get("rotorDia")) / 2, 1)
                                                                     if _num(t.get("rotorDia")) else None),
                    "rotor_diameter_m": _num(t.get("rotorDia")), "hub_height_m": _num(t.get("hubHeight")),
                    "rated_power_mw": _num(t.get("power")),
                    "commissioned_year": int(t["commYear"]) if _num(t.get("commYear")) else None,
                    "blade_serials": serials}
            key = code.upper()
            if key in out:
                out[key]["in_dashboard"] = True
                for k, v in dash.items():          # fill gaps in the database copy from the dashboard
                    if out[key].get(k) in (None, "", []) and v not in (None, "", []):
                        out[key][k] = v
            else:
                out[key] = {**dash, "in_database": False, "in_dashboard": True, "d1_id": None, "inspections": 0}
        return sorted(out.values(), key=lambda r: r["code"])

    def _dashboard_turbines(self, org_id: str) -> list[dict]:
        rows = self.d1.query("SELECT r2_key FROM fleet_data WHERE org_id = ? AND key = 'reude_fleet_db'", [org_id])
        if not rows:
            return []
        try:
            data = self.r2.get_json(rows[0]["r2_key"])
        except (CloudError, ValueError):
            return []
        return list((data or {}).get("turbines") or [])

    def ensure_turbine(self, org_id: str, t: dict, added_by: str | None) -> str:
        """Returns the database id of turbine t in org_id, adding it (and its three blade serials) if needed."""
        code = str(t.get("code") or "").strip()
        length = _num(t.get("blade_length_m"))
        serials = [str(s).strip() for s in (t.get("blade_serials") or [])]
        problems = []
        if not code:
            problems.append("turbine code is required")
        if not length or length <= 0:
            problems.append("blade length (m) is required")
        if len(serials) != 3 or not all(serials):
            problems.append("all three blade serials (A, B, C) are required")
        rows = self.d1.query("SELECT id FROM turbines WHERE org_id = ? AND code = ?", [org_id, code])
        stmts: list[tuple[str, list[Any]]] = []
        if rows:
            tid = rows[0]["id"]
            have = {r["blade"] for r in self.d1.query("SELECT blade FROM blades WHERE turbine_id = ?", [tid])}
            if len(have) < 3 and (len(serials) != 3 or not all(serials)):
                raise CloudError(f"{code} has no blade serials in the database yet; enter all three.")
            for i, s in enumerate(serials, start=1):
                if i not in have and s:
                    stmts.append(("INSERT INTO blades (turbine_id, blade, serial) VALUES (?, ?, ?)", [tid, i, s]))
            stmts.append(("UPDATE turbines SET blade_length_m = COALESCE(blade_length_m, ?) WHERE id = ?",
                          [length, tid]))
            self.d1.batch(stmts)
            return tid
        if problems:
            raise CloudError("Cannot add the turbine: " + "; ".join(problems))
        tid = str(uuid.uuid4())
        stmts.append((
            """INSERT INTO turbines (id, org_id, code, name, site, state, latitude, longitude, manufacturer, model,
                 blade_length_m, rotor_diameter_m, hub_height_m, rated_power_mw, commissioned_year, added_by)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [tid, org_id, code, t.get("name") or code, t.get("site") or None, t.get("state") or None,
             _num(t.get("latitude")), _num(t.get("longitude")), t.get("manufacturer") or None, t.get("model") or None,
             length, _num(t.get("rotor_diameter_m")), _num(t.get("hub_height_m")), _num(t.get("rated_power_mw")),
             int(_num(t.get("commissioned_year"))) if _num(t.get("commissioned_year")) else None, added_by]))
        for i, s in enumerate(serials, start=1):
            stmts.append(("INSERT INTO blades (turbine_id, blade, serial) VALUES (?, ?, ?)", [tid, i, s]))
        self.d1.batch(stmts)
        return tid

    # ---- upload ------------------------------------------------------------
    def upload(self, pkg_dir: str | Path, org_id: str, turbine: dict, approved_by: str, approved_at: str | None,
               progress: Progress | None = None, cancel: threading.Event | None = None,
               parallel: int = 4) -> dict[str, Any]:
        emit = progress or (lambda _e: None)
        cancel = cancel or threading.Event()
        pkg = Path(pkg_dir)
        manifest = json.loads((pkg / "manifest.json").read_text(encoding="utf-8"))
        doc = json.loads((pkg / "points.json").read_text(encoding="utf-8"))
        iid = manifest["inspection_id"]
        if str(turbine.get("code", "")).upper() != str(manifest["turbine_code"]).upper():
            raise CloudError(f"This package is for {manifest['turbine_code']} but turbine {turbine.get('code')} "
                             "is selected.")
        records = list(doc["points"]) + list(doc.get("components") or [])

        emit({"phase": "checking", "message": "Checking the database"})
        self.check_schema()
        existing = self.d1.query("SELECT id, org_id, status FROM inspections WHERE id = ?", [iid])
        if existing and existing[0]["org_id"] != org_id:
            raise CloudError("This inspection ID is already used by another organization. Start it as a new "
                             "inspection in the tool and approve it again.")
        if existing and existing[0]["status"] == "published":
            emit({"phase": "done", "message": "Already published"})
            return {"status": "published", "inspection_id": iid, "already_published": True,
                    "org_id": org_id, "turbine_code": manifest["turbine_code"], "images_sent": 0,
                    "images_already_there": manifest["image_count"]}
        emit({"phase": "turbine", "message": f"Checking turbine {turbine['code']}"})
        turbine_id = self.ensure_turbine(org_id, turbine, approved_by)
        if existing:                                   # an earlier attempt stopped half-way: start the rows again
            self.d1.query("DELETE FROM inspections WHERE id = ?", [iid])

        # 1. images first, so the inspection is never visible without its photos
        sha = {f["path"]: f["sha256"] for f in manifest["files"]}
        todo = [r for r in records if r["status"] == "inspected"]
        key = lambda code: f"org/{org_id}/insp/{iid}/{code}.webp"   # noqa: E731 - same layout as the Worker
        sent = skipped = 0
        lock = threading.Lock()
        emit({"phase": "images", "done": 0, "total": len(todo), "message": f"Sending {len(todo)} images"})

        def one(rec: dict) -> None:
            nonlocal sent, skipped
            if cancel.is_set():
                raise CloudError("Upload cancelled. Upload again to continue; images already sent are skipped.")
            code, want = rec["position_code"], sha[rec["image"]]
            if self.r2.sha_of(key(code)) == want:
                with lock:
                    skipped += 1
            else:
                self.r2.put(key(code), (pkg / rec["image"]).read_bytes(), want)
                with lock:
                    sent += 1
            with lock:
                emit({"phase": "images", "done": sent + skipped, "total": len(todo), "code": code})

        with ThreadPoolExecutor(max_workers=max(1, parallel)) as pool:
            futures = [pool.submit(one, r) for r in todo]
            errors = []
            for f in as_completed(futures):
                try:
                    f.result()
                except CloudError as e:
                    errors.append(str(e))
        if errors:
            raise CloudError(errors[0] if cancel.is_set() else f"{len(errors)} images failed to upload", errors[:10])

        # 2. rows, in batches; the inspection stays 'uploading' (hidden from viewers) until the last batch
        emit({"phase": "database", "message": "Writing the inspection to the database"})
        stmts: list[tuple[str, list[Any]]] = [(
            """INSERT INTO inspections (id, org_id, turbine_id, inspection_date, status, package_status, schema_version,
                 model_name, model_version, source_video, expected_points, image_count, detection_count,
                 approved_by, approved_at, upload_tool)
               VALUES (?, ?, ?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [iid, org_id, turbine_id, manifest["inspection_date"], manifest["status"], manifest["schema_version"],
             manifest["model_name"], manifest["model_version"], manifest.get("source_video"),
             manifest["expected_point_count"], manifest["image_count"], manifest["detection_count"],
             approved_by, approved_at, f"inspection-studio {__version__}"])]
        for rec in records:
            component = rec.get("component", "blade")
            inspected = rec["status"] == "inspected"
            dets = rec.get("detections") or []
            stmts.append((
                """INSERT INTO inspection_points (inspection_id, position_code, component, blade, side, point, zone,
                     distance_m, frame_timestamp_ms, captured_at, drone_altitude_m, status, reason, image_key,
                     image_sha256, image_width, image_height, image_uploaded, mm_per_px, detection_count, max_severity)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [iid, rec["position_code"], component, rec.get("blade"), rec.get("side"),
                 rec.get("point") if component == "blade" else rec.get("seq"), rec.get("zone"),
                 rec.get("distance_m"), rec.get("frame_timestamp_ms"), rec.get("captured_at"),
                 rec.get("drone_altitude_m"), rec["status"], rec.get("reason"),
                 key(rec["position_code"]) if inspected else None, sha.get(rec["image"]) if inspected else None,
                 rec.get("image_width"), rec.get("image_height"), 1 if inspected else 0, rec.get("mm_per_px"),
                 len(dets), max((d["severity_suggested"] for d in dets), default=None)]))
            for d in dets:
                b = d["bbox"]
                stmts.append((
                    """INSERT INTO detections (id, point_id, inspection_id, class, confidence, x_min, y_min, x_max,
                         y_max, length_mm, width_mm, severity_suggested, severity_reason)
                       SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM inspection_points
                        WHERE inspection_id = ? AND position_code = ?""",
                    [d["detection_id"], iid, d["class"], d["confidence"], b["x_min"], b["y_min"], b["x_max"],
                     b["y_max"], d.get("length_mm"), d.get("width_mm"), d["severity_suggested"],
                     d.get("severity_reason"), iid, rec["position_code"]]))
        try:
            for i in range(0, len(stmts), BATCH_SIZE):
                if cancel.is_set():
                    raise CloudError("Upload cancelled before publishing. Upload again to finish.")
                self.d1.batch(stmts[i:i + BATCH_SIZE])
                emit({"phase": "database", "done": min(i + BATCH_SIZE, len(stmts)), "total": len(stmts)})
            # 3. trend + publish: from here on the dashboard shows it to everyone in the organization
            emit({"phase": "publishing", "message": "Publishing"})
            self.d1.batch([
                (TREND_SQL, [turbine_id, manifest["inspection_date"], iid]),
                ("UPDATE inspections SET status = 'published', published_at = ? WHERE id = ?", [_now(), iid]),
                ("INSERT INTO activity_events (org_id, user_id, sector, type, detail_json) VALUES (?, NULL, 'wind', "
                 "'inspection_published', ?)",
                 [org_id, json.dumps({"inspection_id": iid, "turbine": manifest["turbine_code"],
                                      "approved_by": approved_by, "tool": f"inspection-studio {__version__}"})]),
            ])
        except CloudError as e:
            try:
                self.d1.query("DELETE FROM inspections WHERE id = ? AND status != 'published'", [iid])
            except CloudError:
                pass
            if "UNIQUE constraint failed: detections.id" in str(e):
                raise CloudError("A detection ID in this package is already used by another inspection. Re-run "
                                 "the photos with 'Re-process every photo' to get new IDs.") from None
            raise
        result = {"status": "published", "inspection_id": iid, "org_id": org_id, "turbine_id": turbine_id,
                  "turbine_code": manifest["turbine_code"], "images_sent": sent, "images_already_there": skipped,
                  "detections": manifest["detection_count"], "finished_at": _now()}
        emit({"phase": "done", **result})
        return result

    def check_schema(self) -> None:
        try:
            self.d1.query("SELECT component FROM inspection_points LIMIT 0")
        except CloudError:
            raise CloudError("The database is missing migration 0002_inspection_tool.sql. In the compliq-cloudflare "
                             "folder run: npm run db:migrate:remote") from None

    # ---- delete ------------------------------------------------------------
    def delete(self, inspection_id: str, by: str | None, progress: Progress | None = None) -> dict[str, Any]:
        emit = progress or (lambda _e: None)
        rows = self.d1.query("SELECT org_id FROM inspections WHERE id = ?", [inspection_id])
        if not rows:
            return {"deleted": False, "inspection_id": inspection_id, "message": "Not in the database"}
        org_id = rows[0]["org_id"]
        keys = [r["image_key"] for r in self.d1.query(
            "SELECT image_key FROM inspection_points WHERE inspection_id = ? AND image_key IS NOT NULL", [inspection_id])]
        emit({"phase": "database", "message": "Deleting the inspection rows"})
        self.d1.batch([
            ("DELETE FROM inspections WHERE id = ?", [inspection_id]),      # cascades to points, detections, reviews
            ("INSERT INTO activity_events (org_id, user_id, sector, type, detail_json) VALUES (?, NULL, 'wind', "
             "'inspection_deleted', ?)",
             [org_id, json.dumps({"inspection_id": inspection_id, "by": by, "tool": f"inspection-studio {__version__}"})]),
        ])
        failed = []
        for i, k in enumerate(keys, start=1):
            try:
                self.r2.delete(k)
            except CloudError as e:
                failed.append(f"{k}: {e}")
            emit({"phase": "images", "done": i, "total": len(keys)})
        return {"deleted": True, "inspection_id": inspection_id, "images_deleted": len(keys) - len(failed),
                "image_errors": failed[:10], "at": _now()}
