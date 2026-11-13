# CompliQ: Inspection Studio + Dashboard

Two programs that share one Cloudflare database. They never talk to each other directly.

```
ML laptop                                      Cloudflare                          Browser
CompliQ Inspection Studio  ── API keys ──►  D1 (compliq-db)      ◄── Worker ──  CompliQ dashboard
photos → model → review → approve → publish   R2 (compliq-files)       (/api)    Inspections tab, Fleet
```

| Folder | What it is | Who runs it |
|---|---|---|
| `inspection-studio/` | Local browser app (Python): runs the model on one inspection's photos, review and approval, publishes to D1 + R2 | each ML engineer, on their laptop |
| `compliq-cloudflare/` | The dashboard pages (`public/`) and the Worker that serves them and the `/api` (`src/`), plus the D1 migrations | whoever deploys the site (backend) |

Organizations and accounts are created in the dashboard (Admin). The studio only reads the organization list,
adds turbines, and publishes inspections. The dashboard shows an inspection as soon as it is published.

## 1 · Dashboard: deploy or update (once, then for each change)

You need Node.js 20+ and the Cloudflare account. In `compliq-cloudflare/`:

```sh
npm install
npx wrangler login
npm run db:migrate:remote     # applies migrations not yet run, including 0002_inspection_tool.sql (needed by the studio)
npm run deploy
```

If the site is not deployed yet, first follow "Deploy, step by step" in `compliq-cloudflare/README.md` (create the
database and bucket, put the `database_id` in `wrangler.jsonc`, create the admin).

Then create the keys for the ML laptops (one set per laptop, so you can revoke one):

| Key | Where |
|---|---|
| Account ID | Cloudflare dashboard, right-hand sidebar |
| D1 database ID | `database_id` in `wrangler.jsonc` |
| API token | My Profile → API Tokens → Create custom token → **Account · D1 · Edit** |
| R2 access key ID + secret | R2 → Manage API tokens → **Object Read & Write**, bucket `compliq-files` only |

Send them privately (not by email or chat in plain text if you can avoid it).

**Run the dashboard on your computer instead:**

```sh
npm run db:migrate:local
node scripts/create-admin.mjs admin@reude.tech --local
npm run dev                   # http://localhost:8787, sign in with organization "Admin"
```

## 2 · Inspection Studio: install and connect (each ML laptop)

1. Copy `inspection-studio/` to the laptop. Put the model in `models/model.pt` (and `models/model.json` with its
   name and version).
2. Windows: double-click `start.bat` (Mac/Linux: `./start.sh`). The first start installs Python packages into
   `.venv` (needs Python 3.10+ and internet, several minutes), then opens <http://localhost:8765>.
3. **Settings → CompliQ connection:** paste the five keys from step 1, then **Save and test connection**. It
   should list your organizations. The keys stay in `config/settings.local.yaml` on that laptop.

## 3 · Inspect a turbine

In the studio:

1. **New run:** pick the photo folder (14 sub-folders: `B1-SS` … `B3-TE`, plus nacelle and tower),
   the turbine code, date and blade length. **Pick from CompliQ…** fills the code and blade length of a turbine
   that is already there. Run.
2. **Review:** go through the blade map, approve photos, remove false boxes, then **Approve package…**.
3. **Package → Publish to CompliQ:** pick the organization, pick the turbine or add a new one (location, make,
   sizes, blade serials), and **Publish**.

In the dashboard, anyone in that organization opens **Inspections**: the turbine, the blade map, each photo with
its boxes, and the findings. Administrators, Fleet Operators and Maintenance Engineers can confirm, reject or
set the final CAT of a finding. New turbines also appear in **Fleet**.

Published the wrong thing? Studio → Package → **Delete from CompliQ…**, fix, approve and publish again.

## 4 · Updating

- **Dashboard:** change the files, `npm run deploy`. Run `npm run db:migrate:remote` first if there is a new file in
  `migrations/`.
- **Studio on a teammate's laptop:** replace `compliq_studio/`, `requirements.txt`, `start.bat` and `start.sh` (or
  `git pull`). Keep `config/settings.local.yaml`, `models/` and `output/`. The start script installs any new package
  by itself; the `.venv` is not rebuilt.

More detail: `inspection-studio/README.md` (photos, run, review keys, package format, command line, tests) and
`compliq-cloudflare/README.md` (deploy, security, API routes, Inspections tab).
