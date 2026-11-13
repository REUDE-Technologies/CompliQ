# CompliQ on Cloudflare

This folder is the whole CompliQ site: your pages in `public/` plus one Cloudflare Worker that replaces
`backend/server.js`, MongoDB Atlas and Vercel.

| Before | Now |
|---|---|
| Express `backend/server.js` | `src/` (Worker): same `/api/...` routes and responses, plus the inspection routes |
| MongoDB Atlas | **D1** (accounts, organizations, inspections) + **R2** (dashboard data, inspection images) |
| Vercel (`vercel.json`, `cleanUrls`) | the same Worker serves `public/`; `/dashboard` still works like on Vercel |
| Public r2.dev bucket for the Kayathar G97 images | the same bucket, served at `/media/...` to signed-in REUDE users only |
| `atlas-credential.env` | no secrets needed |

Fits the Cloudflare free plan for testing.

## What was changed in `public/`

| File | Change |
|---|---|
| `inspections-view.js`, `inspections-view.css` (new) | The **Inspections** tab: ML inspections published from CompliQ Inspection Studio (see below) |
| `dashboard.html` | Inspections button in the sidebar, its view, and the two files above |
| `dashboard.js` | Page title for the tab; opens it; adds turbines from the database to the fleet list at start (`initApp`) |
| `api.js` | Sends `X-Requested-With` and the session cookie; a user with a temporary password is sent to `account.html` |
| `admin.html` | "Organization created" alert shows the real one-time password instead of the old shared `Operator@reude2026` |
| `dashboard.js` | `G97_REMOTE` points to `/media/Kayathar_Gamesa_G97` instead of the public r2.dev address |
| `_headers` (new) | Security headers for every page |

Everything else in `public/` is exactly your files.

## Inspections from the ML team

The ML team publishes inspections from **CompliQ Inspection Studio** (a separate app on their laptops) straight
into D1 and R2 with Cloudflare API keys. The dashboard never talks to the studio; it reads the same database:

| What the ML engineer does in the studio | What the dashboard shows |
|---|---|
| Picks the organization (created here, in Admin) | Only that organization's users see it; the global admin sees all, with an organization filter |
| Picks a turbine or adds a new one (code, site, GPS, make, blade length, serials…) | **Fleet**: new turbines appear in the organization's fleet list with their last inspection date and finding count |
| Publishes the approved package | **Inspections** tab: turbine list → inspection date → blade map (3 blades × SS/LE/PS/TE × 20 points, coloured by worst CAT) → photo with boxes → findings table (worst first, worsening first) |
| Deletes a published inspection | It disappears from the tab; the turbine stays |

Administrator, Fleet Operator and Maintenance Engineer can **Confirm**, **Reject** or set the **final CAT** of each
finding on the Inspections tab (`PATCH /api/detections/:id`, logged in `reviews`). Viewers see published data only.

Turbines from the studio are added to the fleet list in the browser only. They are saved into the organization's
fleet data the next time someone saves it (for example by adding a defect). Their **health** is
`100 − 10 × worst CAT` (100 with no findings) and their status is *critical* at CAT 4–5, *warning* at CAT 3.
The hand-entered defects in the existing Asset and Report views are unchanged.

**Migration `0002_inspection_tool.sql`** must run before the studio publishes (`npm run db:migrate:remote` runs
every migration not yet applied). It adds turbine details (name, state, rotor, hub height, power, year), the
approver on inspections, and the nacelle/tower columns (`component`, nullable blade/side) that stay empty until the
ML team sends format 1.1 packages. Existing detections and reviews are kept.

**Keys for the ML laptops** (give them privately; one set per laptop lets you revoke one without the others):
- Account ID and the `compliq-db` database ID.
- An API token: My Profile → API Tokens → custom token, **Account · D1 · Edit**, limited to this account.
- An R2 token: R2 → Manage API tokens → **Object Read & Write**, limited to the bucket `compliq-files`.
  It shows an access key ID and a secret.

## Deploy, step by step

You need Node.js 20+ and a free Cloudflare account.

**1. Install and sign in**

```sh
npm install
npx wrangler login
```

**2. Create the database and storage**

```sh
npx wrangler d1 create compliq-db           # copy the database_id it prints into wrangler.jsonc
npx wrangler r2 bucket create compliq-files
npm run db:migrate:remote                   # creates the tables (0001) and the inspection-tool columns (0002)
```

**3. Connect the G97 image bucket.** In the Cloudflare dashboard, open R2, find the bucket behind
`pub-8e9091debbe04bb3a5c42871ef2e7bc8.r2.dev`, and put its name in `wrangler.jsonc` in place of
`replace-with-g97-bucket-name`. (Do not switch off its public URL until step 7 works.)

**4. Move your data from Atlas** (one time, from a computer that can reach Atlas):

```sh
cd tools/migrate && npm install
node --env-file=/path/to/backend/atlas-credential.env migrate-from-atlas.mjs ./out
cd ../..
npx wrangler d1 execute compliq-db --remote --file tools/migrate/out/import.sql
sh tools/migrate/out/upload-fleet-data.sh
```

Accounts still using a password from the old `server.js` get a one-time password, listed in
`tools/migrate/out/temporary-passwords.csv`. Give those out privately, then delete the `out/` folder.
Everyone else keeps their password.

If `admin@reude.tech` is not in that CSV and you do not know its password, or you have no Atlas data, set it yourself:

```sh
node scripts/create-admin.mjs admin@reude.tech --remote
node scripts/create-admin.mjs solar-admin@reude.tech --solar --remote
```

**5. Deploy**

```sh
npm run deploy          # prints https://compliq.<your-account>.workers.dev
```

**6. Test on the workers.dev address** while Vercel keeps running:
- sign in as global admin (organization "Admin"), create a test organization, note the one-time password
- sign in as that operator: you are sent to the account page to set a password, then the dashboard works
- sign in as a REUDE wind user: Kayathar G97 station images load
- sign in as a Viewer: the dashboard shows data (saving is refused; that is intended)
- solar admin: solar dashboard and solar admin page

**7. Switch over**
- Custom domain (optional): Cloudflare dashboard, Workers, compliq, Settings, Domains & Routes, add your domain.
- In R2, on the G97 bucket, turn **off** "Public Development URL" (r2.dev). The images then need sign-in.
- Turn off the Vercel project. Delete the Atlas cluster (at minimum change its password).
- In your git repository: delete `backend/` (including `database.db`) and `vercel.json`, and replace the rest with this folder.

## Day-to-day

| Task | How |
|---|---|
| Deploy a change | `npm run deploy` |
| Reset someone's password | `node scripts/reset-password.mjs user@org.com --org "Org Name" --remote` (prints a one-time password) |
| Reset the admin's password | `node scripts/create-admin.mjs admin@reude.tech --remote` |
| See errors / logs | Cloudflare dashboard, Workers, compliq, Logs (or `npx wrangler tail`) |
| Look at the data | `npx wrangler d1 execute compliq-db --remote --command "SELECT email, role, status FROM users"` |
| Back up the database | `npx wrangler d1 export compliq-db --remote --output backup.sql` |
| Publish an ML inspection | from CompliQ Inspection Studio (Package screen → Publish to CompliQ) |
| Remove a wrong inspection | Studio → Package screen → Delete from CompliQ…, or `DELETE FROM inspections WHERE id = '<id>'` in D1 (findings go with it; delete the images under `org/<org>/insp/<id>/` in R2) |

## Run it on your computer

```sh
npm run db:migrate:local
node scripts/create-admin.mjs admin@reude.tech --local
npm run dev             # http://localhost:8787
```

Sign in as the admin (organization "Admin"), create an organization, then sign in as its operator. To see inspections
locally, point the studio at a local stand-in: stop `npm run dev`, start
`python tools/fake_cloudflare.py --db .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<the long name>.sqlite --r2 local_r2`
from the studio folder, set Settings → Advanced to `http://127.0.0.1:8789/client/v4` and `http://127.0.0.1:8789`
with token `test-token`, key `test-key` / `test-secret`, and publish. The images land in `local_r2/`; copy them into
local R2 with `node scripts/load-local-r2.mjs <studio folder>/local_r2`, stop the stand-in, then `npm run dev` again.

The older route still works too: `tools/sample-package/` is a test package (239 images, 15 detections) for turbine
`WTG-001`, sent with `tools/upload_package.py` through the Worker's `/api/inspections` routes. Create the turbine first:

```sh
npx wrangler d1 execute compliq-db --local --command "INSERT INTO turbines (id, org_id, code, site, manufacturer, model, blade_length_m) SELECT 't-01', id, 'WTG-001', 'Tamil Nadu - Kayathar', 'Gamesa', 'G97', 48.5 FROM organizations WHERE org_key = 'yourorg'; INSERT INTO blades VALUES ('t-01',1,'5297'),('t-01',2,'5298'),('t-01',3,'5301');"
```

## Behaviour your team will notice

- **Temporary passwords** (new organization operators, resets, migrated default passwords) must be changed at first sign-in; the site sends them to the account page.
- **Viewer and Data Analyst are read-only**: their dashboard shows data but saving gives "could not sync". Editor, Site Manager, Maintenance Engineer, Fleet Operator and Administrator can save.
- **8 wrong passwords in 15 minutes** locks that email for 15 minutes.
- **Passwords** need 8+ characters, an upper-case letter, a number and a symbol, and must not contain the email name.
- **Names, organization names and saved dashboard data cannot contain HTML** (`<`, `>`, quotes in names). The admin pages show these values unescaped, so this stops one user planting script in another user's browser.
- Error messages in the pages still say "MongoDB"; that is only text in the pages.
- Sessions last 24 hours (`SESSION_TTL_HOURS` in `wrangler.jsonc`).
- The page security policy (`public/_headers`) is in report-only mode. After deploying, open each page with the browser console open; if no "Content Security Policy" warnings appear, rename `Content-Security-Policy-Report-Only` to `Content-Security-Policy` and deploy again.

## Security: what changed

| Problem in the old backend | Now |
|---|---|
| `database.db` (old SQLite file) stores passwords **in plain text** | Not used. Delete it from the repository and from every copy. |
| Admin and 8 demo passwords written in `server.js`; the admin account was re-created and re-activated on every sign-in | No passwords in code. The admin is created with `scripts/create-admin.mjs`. |
| Every organization's operator got the same password (`Operator@reude2026`), and `GET /api/organizations` published each operator's email | Random one-time password per organization, must be changed at first sign-in; emails not published |
| A solar Administrator in any organization could create Administrator accounts in any organization | Solar admin must be in REUDE Technologies and cannot create or change Administrators |
| Any signed-in user (Viewer included) could overwrite the organization's whole data store | Viewer / Data Analyst are read-only; optional `If-Match` stops two people overwriting each other |
| Wind and solar users shared one data store key space | Wind users get `reude_fleet_db`, solar users `reude_solar_db` |
| CORS allowed every website when `FRONTEND_ORIGIN` was not set | Same origin only (`ALLOWED_ORIGINS` if you ever need another domain) |
| No sign-in rate limit | 8 failures per email / 40 per IP in 15 min, 10 sign-ups per IP per hour |
| Token only in JavaScript (readable by any injected script) | HttpOnly, Secure, SameSite=Strict cookie as well; cross-site writes refused |
| Admin "sync" with a partial user reset role and status to defaults | Only sent fields change; whole sync is one transaction |
| Delete-by-email removed that email in every organization | Optional `&orgKey=&sector=` to remove one account |
| 20 MB JSON accepted on every route | 64 KB default, 15 MB for the data store |
| Sign-up could create organizations that then showed on the public list | Listed only once an admin approves someone in it |
| Report PDF and `station_boxes.json` downloadable by anyone | Need a signed-in user (still kept in `public/`) |
| Admin pages put names and emails into HTML unescaped (stored XSS) | Server refuses markup in names, organizations, emails and the dashboard data store |
| Kayathar G97 inspection images on a public r2.dev URL | Served at `/media/...` to signed-in REUDE users; turn off the public URL |
| No security headers | `nosniff`, `DENY` framing, HSTS, strict CSP on the API, report-only CSP on pages (`public/_headers`) |

Sessions last 24 hours (`SESSION_TTL_HOURS` in `wrangler.jsonc`). Expired sessions are cleaned up nightly.

**Do now, whatever else happens:** change the Atlas database user's password (it is in `atlas-credential.env`), and
change any real password that also appears in `database.db` or in the old `server.js`.

## Free-plan notes

- Each sign-in spends about 20 ms of CPU on password hashing (the free plan allows 10 ms with some slack for
  occasional spikes). A user's first sign-in with an old-server password costs about 120 ms once. If that first
  sign-in ever fails with error 1102, reset that user from the admin side (`POST /api/admin/users/reset-password`)
  or move to the $5 Workers Paid plan.
- D1 free: 500 MB per database, far more than accounts and inspection records need. R2 free: 10 GB (about 165 full inspections of images).

## New API routes

Everything from the old server still works. New:

| Route | Who |
|---|---|
| `GET /api/auth/me` | signed in |
| `POST /api/admin/users/reset-password` `{email, orgKey, sector}` returns `temporaryPassword` | global admin, solar admin (solar users) |
| `GET /api/classes`, `GET /api/severity-levels` | wind users |
| `GET /api/turbines`, `/api/turbines/:id`, `/api/turbines/:id/inspections`, `/api/fleet/summary` | wind users |
| `GET /api/inspections/:id/points`, `GET /api/points/:id/image` | wind users |
| `POST /api/inspections`, `PUT /api/inspections/:id/images/:code`, `POST /api/inspections/:id/complete` | Administrator, Fleet Operator, Maintenance Engineer |
| `PATCH /api/detections/:id` | Administrator, Fleet Operator, Maintenance Engineer |

Permissions are in one place: `src/auth.ts` (`canReview`, `canWriteFleetData`).
