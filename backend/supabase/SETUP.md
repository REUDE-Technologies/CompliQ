# Supabase setup

1. Create a Supabase project and open **SQL Editor**.
2. Run [`schema.sql`](./schema.sql).
3. Create the first Administrator under **Authentication → Users**. In `schema.sql`, uncomment the final SQL block, replace its example email, and run it to create the Administrator profile.
4. Copy `.env.example` to `.env` in `backend/` and set the project URL, anon key, service-role key, and local app URL from **Project Settings → API**. Keep the service-role key server-side; do not add it to HTML, JavaScript, or source control.
5. Start the app with `npm start` from `backend/`. `/api/health` reports `not_configured` until all three environment variables are present.
6. In Supabase **Authentication → URL Configuration**, add your local app URL and deployed Render URL to the allowed redirect URLs. For Render, add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `APP_URL` as environment variables on the web service; no Render disk is needed for database persistence.

New registrations use Supabase Auth and receive a `pending` profile. An Administrator activates or rejects them in the existing admin panel. The existing SQLite/localStorage accounts are not automatically imported: each existing user must be recreated in Supabase Auth (or use Supabase's password reset/invite flow), and Administrator profiles must be bootstrapped explicitly.

The fleet document, anomaly annotations, defect overrides, and organization lists are synced to the shared `app_data` table when users are authenticated. Existing browser-local values are uploaded on first login if no shared document exists; once cloud data exists, it is authoritative. Theme and other UI preferences, session cache, and local ingest-file content remain on the device.
