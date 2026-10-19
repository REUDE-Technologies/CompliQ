# CompliQ

CompliQ is a Node.js web application with a static browser frontend and an Express API.

## Project layout

```text
CompliQ/
├── public/                 Deployed frontend and its images, models, and reports
│   ├── images/
│   ├── models/
│   └── reports/
├── backend/                Express API, npm manifest, and Supabase schema/setup
│   └── supabase/
├── assets/source-media/    Local source videos (ignored by Git)
├── .kiro/                  Kiro project notes
├── .vscode/                Workspace settings
├── render.yaml             Render backend deployment
└── vercel.json             Vercel static frontend deployment
```

`public/` is the canonical frontend served by the Express backend and deployed by Vercel; Live Server is configured to open it. Make frontend changes in `public/`. Local source videos are grouped under `assets/source-media/` and remain ignored by Git. `CompliQ_Mod/` is a separate nested Git repository and is kept independent.

## Run locally

1. Install backend dependencies: `npm install --prefix backend`
2. Copy `backend/.env.example` to `backend/.env` and configure Supabase credentials.
3. Start the app: `npm --prefix backend start`
4. Open `http://localhost:3000`.

Run the Supabase schema from [`backend/supabase/schema.sql`](backend/supabase/schema.sql) and follow [`backend/supabase/SETUP.md`](backend/supabase/SETUP.md) for account and deployment setup.

## Deployment

- **Render** uses `render.yaml` and serves the API plus `public/`.
- **Vercel** uses `vercel.json` and publishes `public/` as a static site.

Keep local credentials, installed dependencies, new runtime databases, and large video files out of Git. The existing `backend/database.db` is retained in place because it may contain local data; it is not referenced by the current Supabase-backed API. The repository ignore rules preserve local files while preventing new runtime artifacts from being tracked.
