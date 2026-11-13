// Inspection routes from the ML / backend plan: turbines, blade map points, images, upload and review.
import { Hono } from "hono";
import { type Env, type C, type User, requireUser, isGlobalAdmin, canReview, now, fail, readJson } from "./auth";
import { sha256 } from "./security";

export const inspections = new Hono<Env>();
for (const path of ["/classes", "/severity-levels", "/turbines", "/turbines/*", "/analytics/*", "/fleet/*", "/inspections",
  "/inspections/*", "/points/*", "/detections/*"]) {
  inspections.use(path, requireUser);
  // Blade inspections belong to the wind dashboard; solar accounts get 404 here.
  inspections.use(path, async (c, next) => {
    const u = c.get("user");
    if (u.sector !== "wind" && !isGlobalAdmin(u)) return c.json({ error: "Not found" }, 404);
    await next();
  });
}

// ---------- reference data ----------
inspections.get("/classes", async (c) =>
  c.json({ classes: (await c.env.DB.prepare("SELECT code, label, cat_min, cat_max FROM defect_classes").all()).results }));
inspections.get("/severity-levels", async (c) =>
  c.json({ levels: (await c.env.DB.prepare("SELECT cat, name, condition, action, colour FROM severity_levels ORDER BY cat").all()).results }));

// ---------- reading inspections (organization-scoped) ----------
type InspectionRow = { id: string; org_id: string; turbine_id: string; status: string; inspection_date: string };

async function ownedInspection(db: D1Database, u: User, id: string) {
  return db.prepare(`SELECT i.*, t.code AS turbine_code, t.blade_length_m FROM inspections i JOIN turbines t ON t.id = i.turbine_id
                      WHERE i.id = ? AND (? = 1 OR i.org_id = ?)`)
    .bind(id, isGlobalAdmin(u) ? 1 : 0, u.org_id).first<InspectionRow>();
}
const visible = (u: User, i: InspectionRow | null) =>
  !!i && (i.status === "published" || canReview(u));

// ---------- turbines and fleet ----------
// Global admin sees every organization (or one with ?org_id=); everyone else only their own.
const orgScope = (c: C, u: User) => (isGlobalAdmin(u) ? c.req.query("org_id") ?? null : u.org_id);
const LATEST = `(SELECT id FROM inspections WHERE turbine_id = t.id AND status = 'published'
                  ORDER BY inspection_date DESC LIMIT 1)`;

inspections.get("/turbines", async (c) => {
  const org = orgScope(c, c.get("user"));
  // Turbine details come from migration 0002 (added by the ML team's Inspection Studio); the dashboard merges
  // these turbines into its fleet list and shows their inspections on the Inspections tab.
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.org_id, o.name AS org_name, t.code, t.name, t.site, t.state, t.latitude, t.longitude,
            t.manufacturer, t.model, t.blade_length_m, t.rotor_diameter_m, t.hub_height_m, t.rated_power_mw,
            t.commissioned_year, t.status,
            (SELECT json_group_array(serial) FROM (SELECT serial FROM blades b WHERE b.turbine_id = t.id ORDER BY b.blade))
              AS blade_serials,
            li.id AS latest_inspection_id, li.inspection_date AS latest_inspection_date,
            li.image_count AS latest_image_count, li.package_status AS latest_package_status,
            (SELECT MAX(COALESCE(d.severity, d.severity_suggested)) FROM detections d
              WHERE d.inspection_id = li.id AND d.review_status != 'rejected') AS worst_cat,
            (SELECT COUNT(*) FROM detections d WHERE d.inspection_id = li.id AND d.review_status != 'rejected') AS defects
       FROM turbines t JOIN organizations o ON o.id = t.org_id LEFT JOIN inspections li ON li.id = ${LATEST}
      WHERE (? IS NULL OR t.org_id = ?) ORDER BY o.name, t.code`).bind(org, org).all();
  return c.json({ turbines: results.map((t) => ({ ...t, blade_serials: JSON.parse(String(t.blade_serials ?? "[]")) })) });
});

// Analytics uses the most recent published inspection per turbine so old inspections don't inflate active counts.
// The organization scope comes from the authenticated user (global admins may request an org_id filter).
inspections.get("/analytics/anomalies", async (c) => {
  const org = orgScope(c, c.get("user"));
  const { results } = await c.env.DB.prepare(
    `SELECT d.id, d.class AS type, COALESCE(d.severity, d.severity_suggested, 1) AS severity,
            d.review_status AS status, d.source, i.turbine_id AS turbineId, t.code AS assetCode,
            i.inspection_date AS inspDate
       FROM detections d
       JOIN inspections i ON i.id = d.inspection_id
       JOIN turbines t ON t.id = i.turbine_id
      WHERE i.status = 'published'
        AND i.id = (SELECT latest.id FROM inspections latest
                     WHERE latest.turbine_id = i.turbine_id AND latest.status = 'published'
                     ORDER BY latest.inspection_date DESC, latest.published_at DESC, latest.id DESC LIMIT 1)
        AND COALESCE(d.review_status, 'pending') != 'rejected'
        AND (? IS NULL OR i.org_id = ?)
      ORDER BY i.inspection_date DESC, t.code, d.id`).bind(org, org).all();
  return c.json({ defects: results });
});

inspections.get("/turbines/:id", async (c) => {
  const org = orgScope(c, c.get("user"));
  const id = c.req.param("id");
  const t = await c.env.DB.prepare("SELECT * FROM turbines WHERE id = ? AND (? IS NULL OR org_id = ?)").bind(id, org, org).first();
  if (!t) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB.prepare("SELECT blade, serial FROM blades WHERE turbine_id = ? ORDER BY blade").bind(id).all();
  return c.json({ turbine: t, blades: results });
});

inspections.get("/turbines/:id/inspections", async (c) => {
  const u = c.get("user");
  const org = orgScope(c, u);
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.inspection_date, i.status, i.package_status, i.model_name, i.model_version, i.image_count,
            i.detection_count, i.published_at,
            (SELECT MAX(COALESCE(d.severity, d.severity_suggested)) FROM detections d
              WHERE d.inspection_id = i.id AND d.review_status != 'rejected') AS worst_cat
       FROM inspections i JOIN turbines t ON t.id = i.turbine_id
      WHERE i.turbine_id = ? AND (? IS NULL OR t.org_id = ?) AND (i.status = 'published' OR ? = 1)
      ORDER BY i.inspection_date DESC`)
    .bind(c.req.param("id"), org, org, canReview(u) ? 1 : 0).all();
  return c.json({ inspections: results });
});

inspections.get("/fleet/summary", async (c) => {
  const org = orgScope(c, c.get("user"));
  const latest = `SELECT ${LATEST} AS id FROM turbines t WHERE (?1 IS NULL OR t.org_id = ?1)`;
  const live = `FROM detections d WHERE d.inspection_id IN (${latest}) AND d.review_status != 'rejected'`;
  const [byCat, byClass, turbines] = await c.env.DB.batch([
    c.env.DB.prepare(`SELECT COALESCE(d.severity, d.severity_suggested) AS cat, COUNT(*) AS n ${live} GROUP BY 1 ORDER BY 1`).bind(org),
    c.env.DB.prepare(`SELECT d.class, COUNT(*) AS n ${live} GROUP BY 1 ORDER BY 2 DESC`).bind(org),
    c.env.DB.prepare(`SELECT COUNT(*) AS total, SUM(${LATEST} IS NOT NULL) AS inspected FROM turbines t
                       WHERE (?1 IS NULL OR t.org_id = ?1)`).bind(org),
  ]);
  return c.json({ by_cat: byCat.results, by_class: byClass.results, turbines: turbines.results[0] });
});

inspections.get("/inspections/:id/points", async (c) => {
  const u = c.get("user");
  const id = c.req.param("id");
  const insp = await ownedInspection(c.env.DB, u, id);
  if (!visible(u, insp)) return c.json({ error: "Not found" }, 404);   // same answer for "other org" and "missing"
  const [points, detections, blades] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT id, position_code, component, blade, side, point, zone, distance_m, captured_at, drone_altitude_m,
              status, reason, image_width, image_height, mm_per_px, detection_count, max_severity
         FROM inspection_points WHERE inspection_id = ?
        ORDER BY CASE component WHEN 'blade' THEN 0 WHEN 'nacelle' THEN 1 ELSE 2 END, blade,
                 CASE side WHEN 'SS' THEN 0 WHEN 'LE' THEN 1 WHEN 'PS' THEN 2 ELSE 3 END, point`).bind(id),
    c.env.DB.prepare(
      `SELECT id, point_id, class, confidence, x_min, y_min, x_max, y_max, length_mm, width_mm,
              severity_suggested, severity_reason, severity, trend, review_status, source
         FROM detections WHERE inspection_id = ?`).bind(id),
    c.env.DB.prepare("SELECT blade, serial FROM blades WHERE turbine_id = ? ORDER BY blade").bind(insp!.turbine_id),
  ]);
  const { source_video, ...publicFields } = insp as InspectionRow & { source_video?: string | null };
  const inspection = canReview(u) ? { ...publicFields, source_video } : publicFields;
  return c.json({ inspection, blades: blades.results, points: points.results, detections: detections.results });
});

inspections.get("/points/:id/image", async (c) => {
  const u = c.get("user");
  const row = await c.env.DB.prepare(
    `SELECT p.image_key, i.id, i.org_id, i.turbine_id, i.status, i.inspection_date
       FROM inspection_points p JOIN inspections i ON i.id = p.inspection_id
      WHERE p.id = ? AND (? = 1 OR i.org_id = ?)`)
    .bind(Number(c.req.param("id")), isGlobalAdmin(u) ? 1 : 0, u.org_id)
    .first<InspectionRow & { image_key: string | null }>();
  if (!row?.image_key || !visible(u, row)) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.FILES.get(row.image_key);
  if (!obj) return c.json({ error: "Image missing" }, 404);
  return new Response(obj.body, {
    headers: { "content-type": "image/webp", "cache-control": "private, max-age=86400", etag: obj.httpEtag },
  });
});

// ---------- upload: create -> images -> complete ----------
const SIDES = ["SS", "LE", "PS", "TE"] as const;
const ZONE = (p: number) => (p <= 7 ? "root" : p <= 14 ? "mid" : "tip");
type Det = { detection_id: string; class: string; confidence: number;
  bbox: { x_min: number; y_min: number; x_max: number; y_max: number };
  length_mm: number | null; width_mm: number | null; severity_suggested: number; severity_reason?: string };
type Pt = { position_code: string; blade: number; side: string; point: number; zone: string; distance_m: number | null;
  frame_timestamp_ms: number | null; status: string; reason: string | null; image: string | null;
  image_width: number | null; image_height: number | null; mm_per_px: number | null; detections: Det[] };
type Manifest = { schema_version: string; inspection_id: string; turbine_code: string; inspection_date: string;
  model_name: string; model_version: string; status: string; expected_point_count: number; image_count: number;
  detection_count: number; source_video?: string; files: { path: string; bytes: number; sha256: string }[] };

function validatePackage(m: Manifest, points: Pt[], classes: Map<string, [number, number]>) {
  const errors: string[] = [];
  const files = new Map(m.files.map((f) => [f.path, f]));
  if (points.length !== 240) errors.push(`expected 240 points, got ${points.length}`);
  const seen = new Set<string>();
  const detIds = new Set<string>();
  let images = 0, dets = 0, missing = 0;
  for (const p of points) {
    const code = `B${p.blade}-${p.side}-${String(p.point).padStart(2, "0")}`;
    if (p.position_code !== code) errors.push(`${p.position_code}: does not match blade/side/point`);
    if (seen.has(code)) errors.push(`${code}: duplicate`);
    seen.add(code);
    if (![1, 2, 3].includes(p.blade) || !SIDES.includes(p.side as (typeof SIDES)[number]) || p.point < 1 || p.point > 20)
      errors.push(`${code}: blade/side/point out of range`);
    if (p.zone !== ZONE(p.point)) errors.push(`${code}: zone should be ${ZONE(p.point)}`);
    if (p.status === "inspected") {
      images++;
      if (!p.image || !files.has(p.image) || !p.image.endsWith(".webp")) errors.push(`${code}: image missing from manifest`);
      if (!p.image_width || !p.image_height) errors.push(`${code}: image size missing`);
    } else if (p.status === "failed" || p.status === "unavailable") {
      missing++;
      if (!p.reason) errors.push(`${code}: ${p.status} needs a reason`);
      if (p.image || p.detections.length) errors.push(`${code}: ${p.status} point cannot have an image or detections`);
    } else errors.push(`${code}: unknown status ${p.status}`);
    for (const d of p.detections) {
      dets++;
      if (!d.detection_id || detIds.has(d.detection_id)) errors.push(`${code}: detection_id missing or repeated`);
      detIds.add(d.detection_id);
      const range = classes.get(d.class);
      const b = d.bbox;
      if (!range) errors.push(`${code}: unknown class ${d.class}`);
      else if (!(d.severity_suggested >= range[0] && d.severity_suggested <= range[1]))
        errors.push(`${code}: CAT ${d.severity_suggested} outside ${d.class} range ${range[0]}-${range[1]}`);
      if (!(d.confidence >= 0 && d.confidence <= 1)) errors.push(`${code}: confidence must be 0-1`);
      if (!(b && b.x_min >= 0 && b.y_min >= 0 && b.x_max <= 1 && b.y_max <= 1 && b.x_min < b.x_max && b.y_min < b.y_max))
        errors.push(`${code}: invalid bbox`);
    }
  }
  if (m.image_count !== images) errors.push(`manifest image_count ${m.image_count} but ${images} inspected points`);
  if (m.detection_count !== dets) errors.push(`manifest detection_count ${m.detection_count} but ${dets} detections`);
  if ((missing > 0) !== (m.status === "partial")) errors.push("status must be partial exactly when points are failed/unavailable");
  return errors;
}

inspections.post("/inspections", async (c) => {
  const u = c.get("user");
  if (!canReview(u)) return c.json({ error: "Not allowed" }, 403);
  const { manifest: m, points, org_id } =
    await readJson<{ manifest: Manifest; points: { points: Pt[] }; org_id?: string }>(c, 5 * 1024 * 1024);
  // Shape checks first, so a malformed package gets a clear 422 instead of a server error.
  if (!m || typeof m !== "object" || !Array.isArray(m.files) || !points || !Array.isArray(points.points) ||
      points.points.some((p) => !p || typeof p !== "object" || !Array.isArray(p.detections)))
    return c.json({ errors: ["body must be { manifest, points: { points: [...] } } with a detections array on every point"] }, 422);
  if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(String(m.inspection_id)))
    return c.json({ errors: ["manifest.inspection_id must be a ULID (26 characters)"] }, 422);
  if (Number.isNaN(Date.parse(String(m.inspection_date))))
    return c.json({ errors: ["manifest.inspection_date must be an ISO date"] }, 422);
  const orgId = isGlobalAdmin(u) && org_id ? String(org_id) : u.org_id;
  const db = c.env.DB;

  const existing = await db.prepare("SELECT id, org_id, status FROM inspections WHERE id = ?").bind(m.inspection_id).first<InspectionRow>();
  if (existing) {                                     // same package again: never duplicate, report what is left
    if (existing.org_id !== orgId) return c.json({ error: "inspection_id already used" }, 409);
    const { results } = await db.prepare(
      "SELECT position_code FROM inspection_points WHERE inspection_id = ? AND status = 'inspected' AND image_uploaded = 0")
      .bind(m.inspection_id).all<{ position_code: string }>();
    return c.json({ inspection_id: existing.id, status: existing.status, missing_images: results.map((r) => r.position_code) });
  }

  const turbine = await db.prepare("SELECT id FROM turbines WHERE org_id = ? AND code = ?")
    .bind(orgId, m.turbine_code).first<{ id: string }>();
  if (!turbine) return c.json({ errors: [`turbine ${m.turbine_code} not found in your organization`] }, 422);
  const { results: cls } = await db.prepare("SELECT code, cat_min, cat_max FROM defect_classes")
    .all<{ code: string; cat_min: number; cat_max: number }>();
  const errors = validatePackage(m, points.points, new Map(cls.map((r) => [r.code, [r.cat_min, r.cat_max]])));
  if (errors.length) return c.json({ errors }, 422);

  const sha = new Map(m.files.map((f) => [f.path, f.sha256]));
  const key = (code: string) => `org/${orgId}/insp/${m.inspection_id}/${code}.webp`;
  const stmts: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO inspections (id, org_id, turbine_id, inspection_date, package_status, schema_version,
                  model_name, model_version, source_video, expected_points, image_count, detection_count, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(m.inspection_id, orgId, turbine.id, m.inspection_date, m.status, m.schema_version, m.model_name,
        m.model_version, m.source_video ?? null, m.expected_point_count, m.image_count, m.detection_count, u.id),
  ];
  for (const p of points.points) {
    const sev = p.detections.length ? Math.max(...p.detections.map((d) => d.severity_suggested)) : null;
    stmts.push(db.prepare(
      `INSERT INTO inspection_points (inspection_id, position_code, blade, side, point, zone, distance_m, frame_timestamp_ms,
         status, reason, image_key, image_sha256, image_width, image_height, mm_per_px, detection_count, max_severity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(m.inspection_id, p.position_code, p.blade, p.side, p.point, p.zone, p.distance_m, p.frame_timestamp_ms,
        p.status, p.reason, p.image ? key(p.position_code) : null, p.image ? sha.get(p.image) ?? null : null,
        p.image_width, p.image_height, p.mm_per_px, p.detections.length, sev));
    for (const d of p.detections) {
      stmts.push(db.prepare(
        `INSERT INTO detections (id, point_id, inspection_id, class, confidence, x_min, y_min, x_max, y_max,
           length_mm, width_mm, severity_suggested, severity_reason)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM inspection_points WHERE inspection_id = ? AND position_code = ?`)
        .bind(d.detection_id, m.inspection_id, d.class, d.confidence, d.bbox.x_min, d.bbox.y_min, d.bbox.x_max,
          d.bbox.y_max, d.length_mm, d.width_mm, d.severity_suggested, d.severity_reason ?? null,
          m.inspection_id, p.position_code));
    }
  }
  stmts.push(db.prepare("INSERT INTO activity_events (org_id, user_id, type, detail_json) VALUES (?, ?, 'upload_started', ?)")
    .bind(orgId, u.id, JSON.stringify({ inspection_id: m.inspection_id, turbine: m.turbine_code })));
  try {
    await db.batch(stmts);                              // one round trip; D1 runs a batch as one transaction
  } catch (e) {
    if (String(e).includes("detections.id"))
      return c.json({ errors: ["a detection_id in this package is already used by another inspection; generate new ULIDs"] }, 422);
    throw e;
  }
  const missing = points.points.filter((p) => p.status === "inspected").map((p) => p.position_code);
  return c.json({ inspection_id: m.inspection_id, status: "uploading", missing_images: missing }, 201);
});

inspections.put("/inspections/:id/images/:code", async (c) => {
  const u = c.get("user");
  if (!canReview(u)) return c.json({ error: "Not allowed" }, 403);
  const insp = await ownedInspection(c.env.DB, u, c.req.param("id"));
  if (!insp || insp.status !== "uploading") return c.json({ error: "Inspection is not accepting images" }, 409);
  const p = await c.env.DB.prepare(
    "SELECT id, image_key, image_sha256 FROM inspection_points WHERE inspection_id = ? AND position_code = ?")
    .bind(insp.id, c.req.param("code")).first<{ id: number; image_key: string | null; image_sha256: string }>();
  if (!p?.image_key) return c.json({ error: "This point has no image" }, 404);
  const body = await c.req.arrayBuffer();
  if (body.byteLength > 2_000_000) return c.json({ error: "Image over 2 MB; re-export at 1,600 px" }, 413);
  const hash = await sha256(body);
  if (hash !== p.image_sha256) return c.json({ error: "Checksum does not match manifest" }, 400);
  await c.env.FILES.put(p.image_key, body, { httpMetadata: { contentType: "image/webp" }, sha256: hash });
  await c.env.DB.prepare("UPDATE inspection_points SET image_uploaded = 1 WHERE id = ?").bind(p.id).run();
  return c.json({ ok: true });
});

inspections.post("/inspections/:id/complete", async (c) => {
  const u = c.get("user");
  if (!canReview(u)) return c.json({ error: "Not allowed" }, 403);
  const insp = await ownedInspection(c.env.DB, u, c.req.param("id"));
  if (!insp) return c.json({ error: "Not found" }, 404);
  if (insp.status === "published") return c.json({ status: "published" });
  const { results } = await c.env.DB.prepare(
    "SELECT position_code FROM inspection_points WHERE inspection_id = ? AND status = 'inspected' AND image_uploaded = 0")
    .bind(insp.id).all<{ position_code: string }>();
  if (results.length) return c.json({ error: "Images missing", missing_images: results.map((r) => r.position_code) }, 409);
  await c.env.DB.batch([
    // Trend: same class at the same position code in this turbine's previous published inspection
    c.env.DB.prepare(
      `UPDATE detections SET trend = (
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
       WHERE inspection_id = ?`).bind(insp.turbine_id, insp.inspection_date, insp.id),
    c.env.DB.prepare("UPDATE inspections SET status = 'published', published_at = ? WHERE id = ?").bind(now(), insp.id),
    c.env.DB.prepare("INSERT INTO activity_events (org_id, user_id, type, detail_json) VALUES (?, ?, 'inspection_published', ?)")
      .bind(insp.org_id, u.id, JSON.stringify({ inspection_id: insp.id })),
  ]);
  return c.json({ status: "published" });
});

// ---------- review ----------
inspections.patch("/detections/:id", async (c) => {
  const u = c.get("user");
  if (!canReview(u)) return c.json({ error: "Not allowed" }, 403);
  const b = await readJson<{ class?: string; severity?: number; review_status?: string; note?: string }>(c);
  if (b.review_status !== undefined && !["pending", "confirmed", "rejected", "corrected"].includes(String(b.review_status)))
    return c.json({ error: "review_status must be pending, confirmed, rejected or corrected" }, 400);
  if (b.severity != null && !Number.isInteger(b.severity)) return c.json({ error: "severity must be a whole CAT number" }, 400);
  if (b.note != null) b.note = String(b.note).slice(0, 2000);
  const d = await c.env.DB.prepare(
    `SELECT d.* FROM detections d JOIN inspections i ON i.id = d.inspection_id
      WHERE d.id = ? AND (? = 1 OR i.org_id = ?)`).bind(c.req.param("id"), isGlobalAdmin(u) ? 1 : 0, u.org_id)
    .first<{ id: string; point_id: number; class: string; severity: number | null; review_status: string }>();
  if (!d) return c.json({ error: "Not found" }, 404);
  const range = await c.env.DB.prepare("SELECT cat_min, cat_max FROM defect_classes WHERE code = ?")
    .bind(b.class ?? d.class).first<{ cat_min: number; cat_max: number }>();
  if (!range) return c.json({ error: "Unknown class" }, 400);
  if (b.severity != null && (b.severity < range.cat_min || b.severity > range.cat_max))
    return c.json({ error: `CAT must be ${range.cat_min}-${range.cat_max} for this class` }, 400);
  const after = { class: b.class ?? d.class, severity: b.severity ?? d.severity, review_status: b.review_status ?? "confirmed" };
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE detections SET class = ?, severity = ?, review_status = ?, updated_by = ?, updated_at = ? WHERE id = ?")
      .bind(after.class, after.severity, after.review_status, u.id, now(), d.id),
    c.env.DB.prepare(
      `UPDATE inspection_points SET max_severity = (SELECT MAX(COALESCE(severity, severity_suggested)) FROM detections
         WHERE point_id = inspection_points.id AND review_status != 'rejected') WHERE id = ?`).bind(d.point_id),
    c.env.DB.prepare("INSERT INTO reviews (detection_id, user_id, action, before_json, after_json, note) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(d.id, u.id, after.review_status === "rejected" ? "reject" : b.class ? "correct" : b.severity ? "set_severity" : "confirm",
        JSON.stringify({ class: d.class, severity: d.severity, review_status: d.review_status }), JSON.stringify(after), b.note ?? null),
  ]);
  return c.json({ detection: { id: d.id, ...after } });
});

