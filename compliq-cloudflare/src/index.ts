// CompliQ on Cloudflare: one Worker serves the API, the login-only files and the dashboard's static files.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { type Env, type Bindings, corsHeaders, sessionToken, userFromToken, isGlobalAdmin } from "./auth";
import { accounts } from "./accounts";
import { admin } from "./admin";
import { inspections } from "./inspections";

const app = new Hono<Env>();

// Security headers on every Worker response (static files get theirs from public/_headers).
app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS" && c.req.path.startsWith("/api/")) {
    const cors = corsHeaders(c);
    return new Response(null, { status: Object.keys(cors).length ? 204 : 403, headers: cors });
  }
  await next();
  const h = c.res.headers;
  for (const [k, v] of Object.entries(corsHeaders(c))) h.set(k, v);
  h.set("x-content-type-options", "nosniff");
  h.set("referrer-policy", "strict-origin-when-cross-origin");
  h.set("x-frame-options", "DENY");
  h.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  if (c.req.path.startsWith("/api/")) {
    h.set("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    if (!h.has("cache-control")) h.set("cache-control", "no-store");
  }
});

app.route("/api", accounts);
app.route("/api/admin", admin);
app.route("/api", inspections);
app.all("/api/*", (c) => c.json({ error: "API route not found." }, 404));

// Files that were public on Vercel but hold client data: now only for signed-in users.
// They stay in public/; wrangler.jsonc sends these paths to the Worker first, so they cannot be fetched directly.
const loginOnly = async (c: import("hono").Context<Env>) => {
  const { token } = sessionToken(c);                 // the cookie set at sign-in is sent automatically with links and fetch()
  if (!token || !(await userFromToken(c.env.DB, token))) {
    if ((c.req.header("accept") ?? "").includes("text/html")) return c.redirect("/auth.html", 302);
    return c.json({ error: "Please sign in to continue." }, 401);
  }
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const out = new Response(res.body, res);
  out.headers.set("cache-control", "private, no-store");
  return out;
};
app.get("/reports/*", loginOnly);
app.get("/station_boxes.json", loginOnly);

// Protected dashboard media is served from the same bucket as inspection images.
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  csv: "text/csv; charset=utf-8", json: "application/json", pdf: "application/pdf", mp4: "video/mp4" };
app.get("/media/*", async (c) => {
  const { token } = sessionToken(c);
  const found = token ? await userFromToken(c.env.DB, token) : null;
  if (!found) return c.json({ error: "Please sign in to continue." }, 401);
  if (!found.u.is_platform && !isGlobalAdmin(found.u)) return c.json({ error: "Not found" }, 404);
  let key = "";
  try { key = decodeURIComponent(c.req.path.slice("/media/".length)); } catch { /* bad escape */ }
  if (!key || key.split("/").some((part) => part === ".." || part === "")) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.FILES.get(key);
  if (!obj) return c.json({ error: "Not found" }, 404);
  const ext = key.split(".").pop()!.toLowerCase();
  return new Response(obj.body, { headers: {
    "content-type": obj.httpMetadata?.contentType || TYPES[ext] || "application/octet-stream",
    "cache-control": "private, max-age=86400", etag: obj.httpEtag } });
});

app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  return new Response(res.body, res);               // copy: asset responses have read-only headers
});

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse();
  console.error("API error:", err instanceof Error ? err.message : err);
  return c.json({ error: "The server could not complete that request." }, 500);
});

export default {
  fetch: app.fetch,
  // Daily clean-up (cron in wrangler.jsonc): expired sessions and old rate-limit rows.
  async scheduled(_event: ScheduledController, env: Bindings) {
    const stamp = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(stamp),
      env.DB.prepare("DELETE FROM auth_failures WHERE created_at < ?").bind(dayAgo),
    ]);
  },
} satisfies ExportedHandler<Bindings>;
