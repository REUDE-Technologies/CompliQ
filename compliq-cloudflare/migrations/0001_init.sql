-- 0001_init.sql : CompliQ on Cloudflare D1 (SQLite)
-- Accounts and organizations keep the shape the existing dashboard expects
-- (orgKey, sector, role names); the inspection tables come from the ML/backend plan.

CREATE TABLE organizations (
  id           TEXT PRIMARY KEY,                         -- UUID
  name         TEXT NOT NULL,
  org_key      TEXT NOT NULL UNIQUE,                     -- same rule as the old server: lowercase letters/digits only
  is_platform  INTEGER NOT NULL DEFAULT 0 CHECK (is_platform IN (0, 1)),   -- 1 = REUDE Technologies (runs the platform)
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE users (
  id                    TEXT PRIMARY KEY,
  org_id                TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,                   -- stored lowercase
  first_name            TEXT NOT NULL DEFAULT '',
  last_name             TEXT NOT NULL DEFAULT '',
  role                  TEXT NOT NULL CHECK (role IN ('Administrator', 'Fleet Operator', 'Maintenance Engineer',
                                                      'Data Analyst', 'Site Manager', 'Editor', 'Viewer')),
  sector                TEXT NOT NULL CHECK (sector IN ('wind', 'solar')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'disabled')),
  global_admin          INTEGER NOT NULL DEFAULT 0 CHECK (global_admin IN (0, 1)),
  provisioned           INTEGER NOT NULL DEFAULT 0 CHECK (provisioned IN (0, 1)),
  must_change_password  INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  password_hash         TEXT NOT NULL,                   -- pbkdf2$<iterations>$<salt>$<hash>, or scrypt$... from the old server
  phone                 TEXT NOT NULL DEFAULT '',
  bio                   TEXT NOT NULL DEFAULT '',
  gst                   TEXT NOT NULL DEFAULT '',
  pan                   TEXT NOT NULL DEFAULT '',
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at         TEXT,
  UNIQUE (email, org_id, sector)                         -- same rule as before: one account per email, organization and dashboard
);
CREATE INDEX idx_users_org ON users(org_id, sector, status);
CREATE INDEX idx_users_email ON users(email);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,                          -- SHA-256 of the token; the token itself is never stored
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at  TEXT NOT NULL,
  user_agent  TEXT,
  ip          TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE auth_failures (                             -- for login / sign-up rate limiting
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('login', 'register')),
  email       TEXT,
  ip          TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_auth_failures_email ON auth_failures(kind, email, created_at);
CREATE INDEX idx_auth_failures_ip ON auth_failures(kind, ip, created_at);

CREATE TABLE fleet_data (                                -- the dashboard's JSON store; the JSON itself lives in R2
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key         TEXT NOT NULL CHECK (key IN ('reude_fleet_db', 'reude_solar_db')),
  r2_key      TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (org_id, key)
);

CREATE TABLE activity_events (
  id           INTEGER PRIMARY KEY,
  org_id       TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  sector       TEXT,
  type         TEXT NOT NULL,                            -- login, upload, report, upload_started, inspection_published, ...
  detail_json  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_activity_type_time ON activity_events(type, created_at);
CREATE INDEX idx_activity_org_time ON activity_events(org_id, created_at);

-- ---------- inspections (from the ML / backend plan) ----------

CREATE TABLE turbines (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,                         -- e.g. WTG-001, unique inside one organization
  site            TEXT,
  latitude        REAL,
  longitude       REAL,
  manufacturer    TEXT,
  model           TEXT,
  blade_length_m  REAL,
  status          TEXT NOT NULL DEFAULT 'operational',
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (org_id, code)
);

CREATE TABLE blades (
  turbine_id  TEXT NOT NULL REFERENCES turbines(id) ON DELETE CASCADE,
  blade       INTEGER NOT NULL CHECK (blade BETWEEN 1 AND 3),   -- 1-3 as used in inspection packages
  serial      TEXT NOT NULL,                                     -- serial shown in the dashboard, e.g. 5297
  PRIMARY KEY (turbine_id, blade)
);

CREATE TABLE inspections (
  id               TEXT PRIMARY KEY,                     -- inspection_id (ULID) from manifest.json
  org_id           TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  turbine_id       TEXT NOT NULL REFERENCES turbines(id) ON DELETE CASCADE,
  inspection_date  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'uploading'
                   CHECK (status IN ('uploading', 'published', 'failed', 'superseded')),
  package_status   TEXT NOT NULL CHECK (package_status IN ('complete', 'partial')),
  schema_version   TEXT NOT NULL,
  model_name       TEXT NOT NULL,
  model_version    TEXT NOT NULL,
  source_video     TEXT,                                 -- internal only: never sent to read-only roles
  expected_points  INTEGER NOT NULL,
  image_count      INTEGER NOT NULL,
  detection_count  INTEGER NOT NULL,
  uploaded_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  published_at     TEXT
);
CREATE INDEX idx_inspections_turbine ON inspections(turbine_id, inspection_date);
CREATE INDEX idx_inspections_org ON inspections(org_id, status);

CREATE TABLE inspection_points (
  id                  INTEGER PRIMARY KEY,
  inspection_id       TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  position_code       TEXT NOT NULL,                     -- B1-SS-01 ... B3-TE-20
  blade               INTEGER NOT NULL CHECK (blade BETWEEN 1 AND 3),
  side                TEXT NOT NULL CHECK (side IN ('SS', 'LE', 'PS', 'TE')),   -- suction side, leading edge, pressure side, trailing edge
  point               INTEGER NOT NULL CHECK (point BETWEEN 1 AND 20),
  zone                TEXT NOT NULL CHECK (zone IN ('root', 'mid', 'tip')),
  distance_m          REAL,
  frame_timestamp_ms  INTEGER,
  status              TEXT NOT NULL CHECK (status IN ('inspected', 'failed', 'unavailable')),
  reason              TEXT,
  image_key           TEXT,                              -- R2 object key; NULL when no image
  image_sha256        TEXT,
  image_width         INTEGER,
  image_height        INTEGER,
  image_uploaded      INTEGER NOT NULL DEFAULT 0 CHECK (image_uploaded IN (0, 1)),
  mm_per_px           REAL,
  detection_count     INTEGER NOT NULL DEFAULT 0,
  max_severity        INTEGER CHECK (max_severity BETWEEN 1 AND 5),   -- colours the dot on the blade map
  UNIQUE (inspection_id, position_code),
  CHECK ((status = 'inspected') = (image_key IS NOT NULL))
);

CREATE TABLE defect_classes (
  code     TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  cat_min  INTEGER NOT NULL CHECK (cat_min BETWEEN 1 AND 5),
  cat_max  INTEGER NOT NULL CHECK (cat_max BETWEEN 1 AND 5),
  CHECK (cat_min <= cat_max)
);

CREATE TABLE severity_levels (
  cat        INTEGER PRIMARY KEY CHECK (cat BETWEEN 1 AND 5),
  name       TEXT NOT NULL,
  condition  TEXT NOT NULL,
  action     TEXT NOT NULL,
  colour     TEXT NOT NULL
);

CREATE TABLE detections (
  id                  TEXT PRIMARY KEY,                  -- detection_id (ULID) from points.json
  point_id            INTEGER NOT NULL REFERENCES inspection_points(id) ON DELETE CASCADE,
  inspection_id       TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  class               TEXT NOT NULL REFERENCES defect_classes(code),
  confidence          REAL CHECK (confidence BETWEEN 0 AND 1),
  x_min               REAL NOT NULL CHECK (x_min >= 0 AND x_min < 1),
  y_min               REAL NOT NULL CHECK (y_min >= 0 AND y_min < 1),
  x_max               REAL NOT NULL CHECK (x_max > 0 AND x_max <= 1),
  y_max               REAL NOT NULL CHECK (y_max > 0 AND y_max <= 1),
  length_mm           REAL,
  width_mm            REAL,
  severity_suggested  INTEGER CHECK (severity_suggested BETWEEN 1 AND 5),
  severity_reason     TEXT,
  severity            INTEGER CHECK (severity BETWEEN 1 AND 5),     -- final CAT, set by a reviewer
  trend               TEXT CHECK (trend IN ('new', 'stable', 'worsening')),
  review_status       TEXT NOT NULL DEFAULT 'pending'
                      CHECK (review_status IN ('pending', 'confirmed', 'rejected', 'corrected')),
  source              TEXT NOT NULL DEFAULT 'model' CHECK (source IN ('model', 'reviewer')),
  updated_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at          TEXT,
  CHECK (x_min < x_max AND y_min < y_max)
);
CREATE INDEX idx_detections_point ON detections(point_id);
CREATE INDEX idx_detections_inspection ON detections(inspection_id, class);

CREATE TABLE reviews (
  id            INTEGER PRIMARY KEY,
  detection_id  TEXT NOT NULL REFERENCES detections(id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL CHECK (action IN ('confirm', 'reject', 'correct', 'add', 'set_severity')),
  before_json   TEXT,
  after_json    TEXT,
  note          TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_reviews_detection ON reviews(detection_id);

-- ---------- reference data ----------
INSERT INTO defect_classes (code, label, cat_min, cat_max) VALUES
  ('leading_edge_erosion',   'Leading Edge Erosion',            1, 4),
  ('coating_gelcoat_damage', 'Coating & Gelcoat Damage',        1, 3),
  ('crack',                  'Cracks',                          2, 5),
  ('trailing_edge_split',    'Trailing Edge Split / Debonding', 3, 5),
  ('lightning_damage',       'Lightning Strike Damage',         2, 5),
  ('delamination',           'Delamination',                    3, 5);

INSERT INTO severity_levels (cat, name, condition, action, colour) VALUES
  (1, 'Cosmetic', 'Surface marks with no effect on blade integrity or performance', 'No action; record for next inspection', '#2F6FB3'),
  (2, 'Minor',    'Minor coating damage or early erosion; no structural impact', 'Monitor; repair at convenience', '#2E9D58'),
  (3, 'Moderate', 'Damage reaching the laminate surface; will progress if untreated', 'Repair at next scheduled maintenance (within 6 months)', '#C99A06'),
  (4, 'Serious',  'Structural laminate damage; progression risk to blade integrity', 'Repair within 1-3 months; increased monitoring', '#E07B2E'),
  (5, 'Critical', 'Structural failure risk; major cracks, TE split or severe lightning damage', 'Stop turbine; immediate repair. Client notified within 24 hours', '#D03B3B');

-- The platform organization. The first administrator is added with scripts/create-admin.mjs (no passwords live in code).
INSERT INTO organizations (id, name, org_key, is_platform) VALUES
  ('00000000-0000-0000-0000-000000000001', 'REUDE Technologies', 'reudetechnologies', 1);
