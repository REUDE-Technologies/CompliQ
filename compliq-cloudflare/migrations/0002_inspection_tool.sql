-- 0002_inspection_tool.sql
-- What the CompliQ Inspection Studio (the ML team's upload tool) needs:
--   1. inspection_points can hold nacelle and tower photos (package schema 1.1) next to the 240 blade points.
--      Ready now and empty until the ML team uploads nacelle/tower photos.
--   2. turbines carry the details the dashboard shows (name, state, rotor, hub height, power, year),
--      so a turbine the ML engineer adds in the tool appears in the dashboard's fleet.
--   3. inspections record who approved them in the tool (the tool has no dashboard login).
--   4. defect_classes say which part of the turbine a class applies to.
--
-- inspection_points has to be rebuilt to change its CHECK rules. D1 enforces foreign keys, so dropping it
-- would cascade-delete every detection and review, so they are copied out first and put back afterwards.
-- Tested against SQLite with foreign keys on: detections and reviews survive, cascades still work.

PRAGMA defer_foreign_keys = ON;

CREATE TABLE detections_backup AS SELECT * FROM detections;
CREATE TABLE reviews_backup AS SELECT * FROM reviews;

CREATE TABLE inspection_points_new (
  id                  INTEGER PRIMARY KEY,
  inspection_id       TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  position_code       TEXT NOT NULL,                     -- B1-SS-01 … B3-TE-20, NAC-01 …, TWR-01 …
  component           TEXT NOT NULL DEFAULT 'blade' CHECK (component IN ('blade', 'nacelle', 'tower')),
  blade               INTEGER CHECK (blade BETWEEN 1 AND 3),
  side                TEXT CHECK (side IN ('SS', 'LE', 'PS', 'TE')),
  point               INTEGER NOT NULL CHECK (point BETWEEN 1 AND 99),   -- blade: 1-20 root to tip, nacelle/tower: photo number
  zone                TEXT CHECK (zone IN ('root', 'mid', 'tip')),
  distance_m          REAL,
  frame_timestamp_ms  INTEGER,
  captured_at         TEXT,                              -- nacelle/tower: photo time
  drone_altitude_m    REAL,                              -- nacelle/tower: drone height above take-off
  status              TEXT NOT NULL CHECK (status IN ('inspected', 'failed', 'unavailable')),
  reason              TEXT,
  image_key           TEXT,
  image_sha256        TEXT,
  image_width         INTEGER,
  image_height        INTEGER,
  image_uploaded      INTEGER NOT NULL DEFAULT 0 CHECK (image_uploaded IN (0, 1)),
  mm_per_px           REAL,
  detection_count     INTEGER NOT NULL DEFAULT 0,
  max_severity        INTEGER CHECK (max_severity BETWEEN 1 AND 5),
  UNIQUE (inspection_id, position_code),
  CHECK ((status = 'inspected') = (image_key IS NOT NULL)),
  CHECK (CASE component
           WHEN 'blade' THEN blade IS NOT NULL AND side IS NOT NULL AND zone IS NOT NULL AND point <= 20
           ELSE blade IS NULL AND side IS NULL AND zone IS NULL END)
);

INSERT INTO inspection_points_new
  (id, inspection_id, position_code, component, blade, side, point, zone, distance_m, frame_timestamp_ms,
   status, reason, image_key, image_sha256, image_width, image_height, image_uploaded, mm_per_px,
   detection_count, max_severity)
SELECT id, inspection_id, position_code, 'blade', blade, side, point, zone, distance_m, frame_timestamp_ms,
       status, reason, image_key, image_sha256, image_width, image_height, image_uploaded, mm_per_px,
       detection_count, max_severity
FROM inspection_points;

DROP TABLE inspection_points;                          -- cascades, the backups above put the rows back
ALTER TABLE inspection_points_new RENAME TO inspection_points;
CREATE INDEX idx_points_inspection ON inspection_points(inspection_id, component);

INSERT INTO detections SELECT * FROM detections_backup;
INSERT INTO reviews SELECT * FROM reviews_backup;
DROP TABLE detections_backup;
DROP TABLE reviews_backup;

-- Turbine details entered by the ML engineer (the dashboard merges these turbines into its fleet).
ALTER TABLE turbines ADD COLUMN name TEXT;
ALTER TABLE turbines ADD COLUMN state TEXT;
ALTER TABLE turbines ADD COLUMN rotor_diameter_m REAL;
ALTER TABLE turbines ADD COLUMN hub_height_m REAL;
ALTER TABLE turbines ADD COLUMN rated_power_mw REAL;
ALTER TABLE turbines ADD COLUMN commissioned_year INTEGER;
ALTER TABLE turbines ADD COLUMN added_by TEXT;         -- name typed in the tool

-- Approval recorded by the tool (uploaded_by stays NULL: the tool does not sign in as a dashboard user).
ALTER TABLE inspections ADD COLUMN approved_by TEXT;
ALTER TABLE inspections ADD COLUMN approved_at TEXT;
ALTER TABLE inspections ADD COLUMN upload_tool TEXT;   -- e.g. "inspection-studio 0.2.0"

-- Which part of the turbine a class applies to. Nacelle and tower classes come later.
ALTER TABLE defect_classes ADD COLUMN applies_to TEXT NOT NULL DEFAULT 'blade'
  CHECK (applies_to IN ('blade', 'nacelle', 'tower', 'any'));
