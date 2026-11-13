// Types, sessions, permissions and request helpers shared by every route.
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { sha256 } from "./security";

export type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;              // inspection images, dashboard JSON store
  ASSETS: Fetcher;              // the dashboard's static files (public/)
  SESSION_TTL_HOURS?: string;
  ALLOWED_ORIGINS?: string;     // only if the frontend is served from another domain; empty = same origin only
};

export type User = {
  id: string; org_id: string; org_key: string; org_name: string; is_platform: number;
  email: string; first_name: string; last_name: string; role: string; sector: "wind" | "solar"; status: string;
  global_admin: number; provisioned: number; must_change_password: number; password_hash: string;
  phone: string; bio: string; gst: string; pan: string; created_at: string; last_login_at: string | null;
};
export type Env = { Bindings: Bindings; Variables: { user: User; tokenHash: string } };
export type C = Context<Env>;

export const ROLES = ["Administrator", "Fleet Operator", "Maintenance Engineer", "Data Analyst", "Site Manager", "Editor", "Viewer"];
export const SELF_SERVICE_ROLES = ["Fleet Operator", "Maintenance Engineer", "Data Analyst", "Site Manager", "Viewer"];

// ---------- permissions (one place to change them) ----------
export const isGlobalAdmin = (u: User) => u.global_admin === 1 && u.is_platform === 1;
export const isSolarAdmin = (u: User) => u.is_platform === 1 && u.sector === "solar" && u.role === "Administrator";
/** Upload inspection packages and confirm / correct / reject detections. */
export const canReview = (u: User) =>
  isGlobalAdmin(u) || ["Administrator", "Fleet Operator", "Maintenance Engineer"].includes(u.role);
/** Save the dashboard's JSON store. Data Analyst and Viewer are read-only. */
export const canWriteFleetData = (u: User) =>
  isGlobalAdmin(u) || ["Administrator", "Fleet Operator", "Maintenance Engineer", "Site Manager", "Editor"].includes(u.role);

export const USER_SELECT = `SELECT u.*, o.org_key, o.name AS org_name, o.is_platform
                              FROM users u JOIN organizations o ON o.id = u.org_id`;

/** The user object the existing dashboard already reads (same field names as the old server). */
export function publicUser(u: User) {
  return {
    id: u.id, firstName: u.first_name, lastName: u.last_name, org: u.org_name, orgKey: u.org_key,
    email: u.email, emailLower: u.email, role: u.role, sector: u.sector, status: u.status,
    phone: u.phone, bio: u.bio, gst: u.gst, pan: u.pan, createdAt: u.created_at, lastLoginAt: u.last_login_at,
    globalAdmin: isGlobalAdmin(u), provisioned: u.provisioned === 1, mustChangePassword: u.must_change_password === 1,
  };
}

/** Same rule as the old server, so organization keys stay identical after migration. */
export const organizationKey = (name: unknown) =>
  String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/^\d+/, "") || "organization";

export const now = () => new Date().toISOString();
export const clientIp = (c: C) => c.req.header("cf-connecting-ip") ?? "local";
export const fail = (status: 400 | 401 | 403 | 404 | 409 | 412 | 413 | 422 | 429, error: string): never => {
  throw new HTTPException(status, { res: Response.json({ error }, { status }) });
};

/** Parse a JSON body with a size cap (the old server accepted 20 MB on every route). */
export async function readJson<T = Record<string, unknown>>(c: C, maxBytes = 64 * 1024): Promise<T> {
  if (Number(c.req.header("content-length") ?? 0) > maxBytes) fail(413, "Request is too large.");
  const text = await c.req.text();
  if (text.length > maxBytes) fail(413, "Request is too large.");
  try {
    const v = JSON.parse(text || "{}");
    if (!v || typeof v !== "object") throw new Error();
    return v as T;
  } catch {
    return fail(400, "Request body must be JSON.");
  }
}
export const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

// ---------- input checks ----------
// The admin pages put names, organizations and emails into HTML without escaping, and emails into onclick='...'.
// So the server refuses anything that could become markup or break out of an attribute.
export const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
const UNSAFE_SHORT = /[<>"`\\\u0000-\u001f\u007f]/;          // names, organization, role-like fields
const MARKUP = /<\s*[a-z!\/?]|javascript\s*:/i;                  // looks like an HTML tag or a script URL

/** Returns an error message, or null when the value is safe to store. */
export function textProblem(label: string, value: string, kind: "short" | "long" = "short") {
  if (kind === "short" && UNSAFE_SHORT.test(value)) return `${label} cannot contain < > " \` \\ or control characters.`;
  if (MARKUP.test(value)) return `${label} cannot contain HTML or script.`;
  if (kind === "long" && /[\u0000-\u0008\u000b\u000c\u000e-\u001f`]/.test(value)) return `${label} contains characters that are not allowed.`;
  return null;
}

// Fields of the dashboard JSON store that the pages put inside HTML attributes (onclick='...', class="...", fill="...").
const ATTRIBUTE_KEYS = /^(id|.*Id|color|colour|severity|status|priority|type|cls|class|anomClass|stroke|fill)$/;
const SAFE_ATTRIBUTE = /^[\p{L}\p{N} _.:#%,+&()\/-]*$/u;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp|gif|bmp);base64,[A-Za-z0-9+/=\s]*$/;

/** Walks the dashboard JSON store and returns the first unsafe value, or null. */
export function unsafeJson(value: unknown): string | null {
  const stack: [unknown, string, number][] = [[value, "", 0]];
  while (stack.length) {
    const [v, path, depth] = stack.pop()!;
    if (depth > 40) return `${path || "data"} is nested too deeply.`;
    if (typeof v === "string") {
      if (IMAGE_DATA_URL.test(v)) continue;
      if (MARKUP.test(v)) return `${path} contains HTML or script.`;
      const key = path.split(".").pop()!.replace(/\[\d+\]$/, "");
      if (ATTRIBUTE_KEYS.test(key) && !SAFE_ATTRIBUTE.test(v)) return `${path} contains characters that are not allowed (quotes, < >, backslash).`;
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => stack.push([x, `${path}[${i}]`, depth + 1]));
    } else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (MARKUP.test(k) || UNSAFE_SHORT.test(k)) return `A field name in ${path || "data"} is not allowed.`;
        stack.push([x, path ? `${path}.${k}` : k, depth + 1]);
      }
    }
  }
  return null;
}
export function checkText(label: string, value: string, kind: "short" | "long" = "short") {
  const problem = textProblem(label, value, kind);
  if (problem) fail(400, problem);
  return value;
}

// ---------- cross-site protection ----------
const allowedOrigins = (c: C) => [new URL(c.req.url).origin,
  ...(c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];

/** A request from another website must not be able to act with the user's cookie. */
export function checkOrigin(c: C, cookieAuth: boolean) {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return;
  const origin = c.req.header("origin");
  if (origin) {
    if (!allowedOrigins(c).includes(origin)) fail(403, "This website origin is not allowed.");
    return;
  }
  // No Origin header (old browsers, scripts). Cookie-authenticated writes then need the custom header.
  if (cookieAuth && c.req.header("sec-fetch-site") !== "same-origin" && c.req.header("x-requested-with") !== "compliq")
    fail(403, "Missing X-Requested-With header.");
}

export function corsHeaders(c: C): Record<string, string> {
  const origin = c.req.header("origin");
  const extra = (c.env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !extra.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin",
    "access-control-allow-headers": "Authorization, Content-Type, If-Match, X-Requested-With",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "ETag",
  };
}

// ---------- sessions ----------
export function sessionToken(c: C): { token: string | null; viaCookie: boolean } {
  const bearer = c.req.header("authorization")?.match(/^Bearer\s+([0-9a-f]{64})$/i)?.[1];
  if (bearer) return { token: bearer.toLowerCase(), viaCookie: false };
  const cookie = getCookie(c, "sid");
  return { token: cookie && /^[0-9a-f]{64}$/.test(cookie) ? cookie : null, viaCookie: true };
}

export async function userFromToken(db: D1Database, token: string) {
  const tokenHash = await sha256(token);
  const u = await db.prepare(`${USER_SELECT} JOIN sessions s ON s.user_id = u.id
                               WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'`)
    .bind(tokenHash, now()).first<User>();
  return u ? { u, tokenHash } : null;
}

// Routes a user with a temporary password may still call.
const WHILE_TEMPORARY = new Set(["GET /api/account", "GET /api/auth/me", "POST /api/account/password", "POST /api/auth/logout"]);

export const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  const { token, viaCookie } = sessionToken(c);
  if (!token) fail(401, "Please sign in to continue.");
  checkOrigin(c, viaCookie);
  const found = await userFromToken(c.env.DB, token!);
  if (!found) fail(401, "Your session has expired. Please sign in again.");
  const { u, tokenHash } = found!;
  if (u.must_change_password && !WHILE_TEMPORARY.has(`${c.req.method} ${c.req.path}`))
    throw new HTTPException(403, { res: Response.json(
      { error: "Please set a new password before continuing.", code: "PASSWORD_CHANGE_REQUIRED" }, { status: 403 }) });
  c.set("user", u);
  c.set("tokenHash", tokenHash);
  await next();
};

export const requireGlobalAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (!isGlobalAdmin(c.get("user"))) fail(403, "Global administrator access is required.");
  await next();
};
export const requireSolarAdmin: MiddlewareHandler<Env> = async (c, next) => {
  if (!isSolarAdmin(c.get("user"))) fail(403, "Solar administrator access is required.");
  await next();
};

// ---------- sign-in / sign-up rate limits (stored in D1, no paid add-on needed) ----------
const WINDOW_MIN = 15;
export async function tooManyFailures(db: D1Database, kind: "login" | "register", email: string, ip: string) {
  const since = new Date(Date.now() - (kind === "login" ? WINDOW_MIN : 60) * 60_000).toISOString();
  const r = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM auth_failures WHERE kind = ?1 AND email = ?2 AND created_at > ?4) AS by_email,
            (SELECT COUNT(*) FROM auth_failures WHERE kind = ?1 AND ip = ?3 AND created_at > ?4) AS by_ip`)
    .bind(kind, email, ip, since).first<{ by_email: number; by_ip: number }>();
  return kind === "login" ? r!.by_email >= 8 || r!.by_ip >= 40 : r!.by_ip >= 10;
}
export const recordFailure = (db: D1Database, kind: "login" | "register", email: string, ip: string) =>
  db.prepare("INSERT INTO auth_failures (kind, email, ip) VALUES (?, ?, ?)").bind(kind, email, ip);
