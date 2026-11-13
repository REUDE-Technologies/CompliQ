# CompliQ Inspection Studio

A local app for the ML team. It runs the blade model on one turbine's inspection photos and writes the
package exactly as the ML spec describes. A reviewer approves the package, and then the app publishes it
straight into CompliQ's Cloudflare database (D1) and image storage (R2). The dashboard reads it from there
at once: there is no other connection between this app and the dashboard.

```
14 photo folders ──► Run model ──► clean WebP + annotated QA copy per photo ──► package (manifest.json, points.json, images/)
                                                                             └► Review & approve ──► Publish to CompliQ (D1 + R2)
```

## Start

**Windows:** double-click `start.bat`. The first start installs the packages into `.venv`, which takes a few
minutes. After that it opens <http://localhost:8765> in your browser.
**Mac / Linux:** `./start.sh`.

You need Python 3.10 or newer. If you already have an environment with `ultralytics`, the app uses it as is.
On Windows, pip installs the CPU build of PyTorch. To use an NVIDIA GPU, install the CUDA build from
pytorch.org first. The app picks the GPU automatically (Settings → Device).

**Try it before the model is ready:** on the Inspections screen, click **Try with sample data**. This draws
258 synthetic photos and runs them with a *demo model* that replays the drawn defects. The photos are clearly
drawings. You can then test review and approval end to end. (Publishing sample data would put a fake turbine in
CompliQ, so delete it afterwards if you try that.)

## 1 · Photo folder

Pick one folder per turbine inspection with 14 sub-folders. Names are matched loosely, so `B1-SS`, `B1_SS`,
`Blade 1/SS` and `blade1 suction` all work.

| Folder | Photos | Position codes |
|---|---|---|
| `B1-SS`, `B1-LE`, `B1-PS`, `B1-TE`, … `B3-TE` | 20 each, P01 at the root → P20 at the tip | `B1-SS-01` … `B3-TE-20` (240) |
| `NACELLE` (also *nacelle, nasal, rotor, hub*) | any number up to `nacelle_max_photos` (40) | `NAC-01` … |
| `TOWER` (also *tower, pole*) | any number up to `tower_max_photos` (60) | `TWR-01` … |

- **Which photo is which point:** if every photo name carries its point (`01.jpg`, `P05.jpg`, `B1-SS-07.jpg`),
  the number decides, and any missing number becomes *unavailable*. Otherwise the photos are taken in file-name
  order (or capture-time order, a setting). In that case the folder needs exactly 20 photos.
- **⇄ Flip:** use this on a folder whose pass was flown tip → root.
- **Not filmed:** marks all 20 points of a side *unavailable* with your reason. The package status becomes `partial`.

## 2 · Run

For every photo, the app does the following (ML spec steps 6–10):

1. Runs `model.pt` on the full-resolution, upright frame. Optional *small-defect mode* adds overlapping
   tiles, SAHI-style.
2. Keeps the boxes at or above each class's threshold (`config/classes.yaml`). Boxes are stored as 0–1
   fractions of the frame.
3. Measures the size in mm when the distance is known. The distance comes from the photo's DJI laser range
   (`LRFTargetDistance`) or from Settings. Size in mm = distance × sensor width ÷ (focal length × image width).
4. Suggests a CAT using `config/severity_rules.yaml` (class minimum, +1/+2 by length, +1 at the tip for
   erosion and lightning, capped at the class maximum).
5. Saves a **clean WebP** (longest edge 1,600 px, quality 80, under 2 MB) and an **annotated JPEG** for QA.

Then it writes and validates the package. If you run again later, photos that haven't changed reuse their
earlier results, and the inspection keeps its `inspection_id`.

## 3 · Review and approve

The review screen shows a blade map: 3 blades × 4 sides × 20 points, plus nacelle and tower. Each square is
coloured by its highest suggested CAT, using the dashboard's colours. Click a square to see the photo with its
boxes.

| Key | Action |
|---|---|
| `A` | approve this photo and go to the next one to review |
| `U` | mark the photo unusable (it becomes `failed` with your reason) |
| `R` | undo the decision |
| `1`–`9`, then `X` | pick a box, then remove it (a false positive) |
| `←` `→` `N` | previous / next / next to review |
| `B` / `F` | show or hide boxes / switch to actual size |

**Approve clean photos** approves, in one step, every photo that has no findings. Once every photo has a
decision, **Approve package…** records who approved it and the package's fingerprint (the SHA-256 of
`manifest.json`). If anything changes after that, the approval is void and you approve again. Boxes you remove
are listed in `qa_note.md` for ML1's retraining.

## 4 · Publish to CompliQ

**One-time setup on each ML laptop** (Settings → *CompliQ connection*). Ask whoever runs the Cloudflare account
for these five values, paste them, and click **Save and test connection**:

| Field | Where it comes from |
|---|---|
| Account ID | Cloudflare dashboard, right-hand sidebar of the account |
| D1 database ID | `database_id` of `compliq-db` (in the dashboard project's `wrangler.jsonc`, or Storage & Databases → D1) |
| API token | My Profile → API Tokens → *Create custom token* → permission **Account · D1 · Edit** |
| R2 access key ID + secret | R2 → *Manage API tokens* → **Object Read & Write**, limited to the bucket `compliq-files` |

They are saved in `config/settings.local.yaml` on that laptop only and never shown again in the app (the boxes
say *saved*). Only someone with these keys can publish. Treat the file like a password: the D1 token can change
anything in the CompliQ database. To revoke a laptop, delete its tokens in Cloudflare.

**Publishing an inspection** (Package screen, after **Approve package…**):

1. Pick the **organization**. Organizations and accounts are created in the dashboard (Admin); the list comes
   from the database.
2. Pick the **turbine**, or **+ Add a new turbine…** and enter its details: code, name, site, state, GPS,
   manufacturer, model, blade length, rotor diameter, hub height, rated power, year, and the three blade serial
   numbers (A = B1, B = B2, C = B3). The code and blade length must match the package; if they don't, the app
   offers to switch the package to the picked turbine (this re-applies sizes and voids the approval).
3. Click **Publish**. The app sends the 240 WebP images to R2 (`org/<org>/insp/<inspection>/<code>.webp`,
   4 at a time, with a SHA-256 check), then writes the inspection, points and detections to D1, works out each
   finding's trend against the turbine's previous inspection (*new*, *worsening*, *stable*), and marks it
   published. The approver's name and time go with it.

Every step is safe to repeat: if publishing is interrupted, click Publish again and only the missing images
are sent. A package already published is not sent twice.

**Fixing a mistake:** on the Package screen, **Delete from CompliQ…** (type the turbine code to confirm) removes
that inspection, its findings and its images. The turbine stays. Fix the package, approve it again and publish.

Package format **1.0** (blades only) is the default and is what the dashboard shows today. The database is
ready for nacelle and tower photos (format 1.1) when you start sending them.

## Output

```
output/
  WTG-001_2026-11-04/          the package (what gets published)
    manifest.json  points.json  images/B1-SS-01.webp …
  WTG-001_2026-11-04_qa/       stays on your machine
    annotated/  webp/  run.json  review.json  validation.json  upload.json  qa_note.md  run_log.txt
```

**Package format** (Settings, or per inspection on the Package screen):

- **1.0** (default) is exactly the current ML spec: blades only.
- **1.1** adds `NAC-xx` / `TWR-xx` records under `points.json → components` and a `components` summary in the
  manifest. The database already accepts them (migration `0002`); the dashboard shows them as extra strips under
  the blade map. Switching formats rebuilds the package without running the model again.

## Model and config

- Put the model in `models/model.pt`, with `models/model.json` = `{"model_name": "...", "model_version": "..."}`.
- `config/classes.yaml` holds the six class codes, dashboard labels, CAT ranges, per-class thresholds, and
  `model_name_map` for models whose class names differ from the codes.
- `config/severity_rules.yaml` holds the draft CAT thresholds. The blade engineer has to approve them.
- `config/settings.yaml` holds the defaults. The Settings screen saves your changes to `settings.local.yaml`.

## Command line

```
python -m compliq_studio sample
python -m compliq_studio scan     "D:\Inspections\WTG-001_2026-11-04"
python -m compliq_studio run      "D:\Inspections\WTG-001_2026-11-04" --turbine WTG-001 --date 2026-11-04T10:30:00+05:30 --blade-length 48.5
python -m compliq_studio validate output\WTG-001_2026-11-04
python -m compliq_studio upload   output\WTG-001_2026-11-04 --org "Acme Wind"
python -m compliq_studio delete   output\WTG-001_2026-11-04 --by "Your Name"
```

`upload` publishes with the keys in Settings. It refuses a package that has not been approved in the app, and the
turbine must already be in CompliQ (add new turbines from the app). `delete` asks you to type the turbine code.

## Tests

`pip install -r requirements-dev.txt`, then `pytest`. The tests cover the spec's rules and examples, the
scanner, every validation rule, review and approval, publishing (resume, republish, delete, trends, wrong keys,
missing migration) against `tools/fake_cloudflare.py`, which serves the D1 and R2 APIs from a SQLite file with
the real CompliQ migrations, the app's API, and the real Ultralytics path with a small untrained model.

## Updating the app on a teammate's laptop

Replace the `compliq_studio/` folder (or `git pull`), and also `requirements.txt`, `start.bat` and `start.sh`.
Keep `config/settings.local.yaml`, `models/` and `output/`. `start.bat` checks the packages at every start and
installs what is missing (this version adds `boto3` for R2), so the `.venv` is not rebuilt.

## Notes on the package

- **`mm_per_px`** in `points.json` is for the delivered WebP's pixels, so it matches `image_width` and the box
  fractions. Sizes are measured on the full-resolution frame, as the spec says.
- **`frame_timestamp_ms`** is `null`, because the inputs are photos, not video frames.
