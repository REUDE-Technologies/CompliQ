// Sign-up, sign-in, account and the dashboard JSON store: same paths and shapes as the old Express server.
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import {
  type Env, type User, USER_SELECT, SELF_SERVICE_ROLES, publicUser, organizationKey, now, clientIp, fail, readJson,
  str, checkOrigin, sessionToken, requireUser, isGlobalAdmin, canWriteFleetData, tooManyFailures, recordFailure,
  EMAIL, checkText, unsafeJson,
} from "./auth";
import { hashPassword, verifyPassword, dummyVerify, randomToken, sha256, passwordProblem } from "./security";

export const accounts = new Hono<Env>();

accounts.get("/health", async (c) => {
  await c.env.DB.prepare("SELECT 1").first();
  return c.json({ status: "ok", database: "connected" });
});

// Sign-up form list. Only organizations with at least one approved member appear, so random
// sign-ups cannot fill the list. Operator e-mails are no longer published.
accounts.get("/organizations", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT o.name, o.org_key AS orgKey FROM organizations o
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.org_id = o.id AND u.status = 'active') ORDER BY o.name`).all();
  return c.json(results);
});

accounts.post("/auth/register", async (c) => {
  checkOrigin(c, false);
  const b = await readJson(c);
  const email = str(b.email, 254).toLowerCase();
  const password = String(b.password ?? "");
  const org = str(b.org, 120);
  const ip = clientIp(c);
  if (!email || !password) fail(400, "Email and password are required.");
  if (!EMAIL.test(email)) fail(400, "Enter a valid email address.");
  if (!org || organizationKey(org) === "organization") fail(400, "Organization is required.");
  checkText("Organization", org);
  const firstName = checkText("First name", str(b.firstName, 100));
  const lastName = checkText("Last name", str(b.lastName, 100));
  const problem = passwordProblem(password, email);
  if (problem) fail(400, problem);
  const db = c.env.DB;
  if (await tooManyFailures(db, "register", email, ip)) fail(429, "Too many sign-up attempts. Try again in an hour.");
  await recordFailure(db, "register", email, ip).run();          // every sign-up attempt counts toward the hourly cap

  const orgKey = organizationKey(org);
  const sector = b.sector === "solar" ? "solar" : "wind";
  const role = SELF_SERVICE_ROLES.includes(String(b.role)) ? String(b.role) : "Fleet Operator";
  const existingOrg = await db.prepare("SELECT id FROM organizations WHERE org_key = ?").bind(orgKey).first<{ id: string }>();
  const orgId = existingOrg?.id ?? crypto.randomUUID();
  const userId = crypto.randomUUID();
  const stmts = [];
  if (!existingOrg) stmts.push(db.prepare("INSERT INTO organizations (id, name, org_key) VALUES (?, ?, ?)").bind(orgId, org, orgKey));
  stmts.push(db.prepare(
    `INSERT INTO users (id, org_id, email, first_name, last_name, role, sector, status, password_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`)
    .bind(userId, orgId, email, firstName, lastName, role, sector, await hashPassword(password)));
  stmts.push(db.prepare("INSERT INTO activity_events (org_id, user_id, sector, type) VALUES (?, ?, ?, 'register')")
    .bind(orgId, userId, sector));
  try {
    await db.batch(stmts);
  } catch (e) {
    if (String(e).includes("UNIQUE")) fail(409, "An account with this email already exists for this organization and sector.");
    throw e;
  }
  const u = await db.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(userId).first<User>();
  return c.json({ user: publicUser(u!) }, 201);
});

accounts.post("/auth/login", async (c) => {
  checkOrigin(c, false);
  const b = await readJson(c);
  const email = str(b.email, 254).toLowerCase();
  const password = String(b.password ?? "");
  const sector = b.sector === "solar" ? "solar" : "wind";
  const organization = String(b.organization ?? "");
  const ip = clientIp(c);
  const db = c.env.DB;
  const wrong = "Invalid email, password, organization, or dashboard type.";
  if (!email || !password || password.length > 128) fail(401, wrong);
  if (await tooManyFailures(db, "login", email, ip)) fail(429, "Too many sign-in attempts. Try again in 15 minutes.");

  const u = organization === "__admin__"
    ? await db.prepare(`${USER_SELECT} WHERE u.email = ? AND u.global_admin = 1 AND o.is_platform = 1`).bind(email).first<User>()
    : await db.prepare(`${USER_SELECT} WHERE u.email = ? AND o.org_key = ? AND u.sector = ?`)
        .bind(email, organizationKey(organization), sector).first<User>();
  const check = u ? await verifyPassword(password, u.password_hash) : await dummyVerify(password);
  if (!u || !check.ok) {
    await recordFailure(db, "login", email, ip).run();
    fail(401, wrong);
  }
  const user = u!;
  if (user.status !== "active")
    fail(403, user.status === "rejected" ? "This account has been rejected."
      : user.status === "disabled" ? "This account has been disabled." : "This account is awaiting administrator approval.");

  const token = randomToken();
  const hours = Math.min(Math.max(Number(c.env.SESSION_TTL_HOURS ?? 24) || 24, 1), 24 * 7);
  const expires = new Date(Date.now() + hours * 3_600_000);
  const stamp = now();
  const stmts = [
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?)")
      .bind(await sha256(token), user.id, expires.toISOString(), str(c.req.header("user-agent"), 300), ip),
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(stamp, user.id),
    db.prepare("DELETE FROM auth_failures WHERE kind = 'login' AND email = ?").bind(email),
    db.prepare("INSERT INTO activity_events (org_id, user_id, sector, type) VALUES (?, ?, ?, 'login')").bind(user.org_id, user.id, user.sector),
  ];
  if (check.rehash) stmts.push(db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(password), user.id));
  await db.batch(stmts);
  user.last_login_at = stamp;

  // HttpOnly cookie: page scripts cannot read it, so an injected script cannot steal the session.
  // The token is still returned for the current dashboard code, which sends it as a Bearer header.
  setCookie(c, "sid", token, { httpOnly: true, secure: true, sameSite: "Strict", path: "/", expires });
  return c.json({ token, user: publicUser(user) });
});

accounts.post("/auth/logout", async (c) => {
  const { token, viaCookie } = sessionToken(c);
  checkOrigin(c, viaCookie);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  deleteCookie(c, "sid", { path: "/", secure: true });
  return c.json({ success: true });
});

// ---------- everything below needs a signed-in, active user ----------
accounts.use("/auth/me", requireUser);
accounts.use("/account", requireUser);
accounts.use("/account/*", requireUser);
accounts.use("/activity", requireUser);
accounts.use("/data/*", requireUser);

accounts.get("/auth/me", (c) => c.json({ user: publicUser(c.get("user")) }));

accounts.post("/activity", async (c) => {
  const u = c.get("user");
  const b = await readJson(c);
  const type = String(b.type ?? "");
  if (!["upload", "report"].includes(type)) fail(400, "Unsupported activity type.");
  const details: Record<string, unknown> = {};
  if (type === "upload") {
    details.fileName = str(b.fileName, 180);
    details.fileType = str(b.fileType, 100);
    details.fileSize = Math.max(0, Math.min(Number(b.fileSize) || 0, 100 * 1024 * 1024));
    details.assetId = str(b.assetId, 100);
  }
  await c.env.DB.prepare("INSERT INTO activity_events (org_id, user_id, sector, type, detail_json) VALUES (?, ?, ?, ?, ?)")
    .bind(u.org_id, u.id, u.sector, type, JSON.stringify(details)).run();
  return c.json({ success: true }, 201);
});

accounts.get("/account", (c) => c.json(publicUser(c.get("user"))));

accounts.patch("/account", async (c) => {
  const u = c.get("user");
  const b = await readJson(c);
  const limits: Record<string, [string, number]> = {
    firstName: ["first_name", 100], lastName: ["last_name", 100], phone: ["phone", 30], bio: ["bio", 1000],
    gst: ["gst", 15], pan: ["pan", 10],
  };
  const sets: string[] = [];
  const values: string[] = [];
  for (const [field, [column, max]] of Object.entries(limits)) {
    if (b[field] === undefined) continue;
    let v = String(b[field]).trim();
    if (v.length > max) fail(400, `${field} is too long.`);
    if (field === "gst" || field === "pan") v = v.toUpperCase();
    if (field === "gst" && v && !/^[0-9]{2}[A-Z0-9]{13}$/.test(v)) fail(400, "GST number should be 15 characters, e.g. 33ABCDE1234F1Z5.");
    if (field === "pan" && v && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) fail(400, "PAN should look like ABCDE1234F.");
    if (field === "phone" && v && !/^[0-9+()\-\s]{6,30}$/.test(v)) fail(400, "Phone number has invalid characters.");
    if (field === "firstName" || field === "lastName") checkText(field === "firstName" ? "First name" : "Last name", v);
    if (field === "bio") checkText("Bio", v, "long");
    sets.push(`${column} = ?`);
    values.push(v);
  }
  if (sets.length) await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...values, u.id).run();
  return c.json({ success: true });
});

accounts.post("/account/password", async (c) => {
  const u = c.get("user");
  const b = await readJson(c);
  const currentPassword = String(b.currentPassword ?? "");
  const newPassword = String(b.newPassword ?? "");
  const problem = passwordProblem(newPassword, u.email);
  if (problem) fail(400, `New password does not meet the requirements. ${problem}`);
  if (newPassword === currentPassword) fail(400, "New password must be different from the current one.");
  const row = await c.env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(u.id).first<{ password_hash: string }>();
  if (currentPassword.length > 128 || !(await verifyPassword(currentPassword, row!.password_hash)).ok)
    fail(400, "Current password is incorrect.");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").bind(await hashPassword(newPassword), u.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(u.id, c.get("tokenHash")),
  ]);
  return c.json({ success: true });
});

accounts.delete("/account", async (c) => {
  const u = c.get("user");
  if (isGlobalAdmin(u)) fail(403, "The global administrator account cannot be deleted here.");
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(u.id).run();   // sessions go with it (ON DELETE CASCADE)
  deleteCookie(c, "sid", { path: "/", secure: true });
  return c.json({ success: true });
});

// ---------- the dashboard's JSON store (was the fleetData collection) ----------
// Kept in R2 because D1 rows are limited to 2 MB. Wind users get reude_fleet_db, solar users reude_solar_db.
const KEY_FOR_SECTOR = { wind: "reude_fleet_db", solar: "reude_solar_db" } as const;
const MAX_DATA_BYTES = 15 * 1024 * 1024;

function dataKey(u: User, key: string) {
  const allowed = isGlobalAdmin(u) ? Object.values(KEY_FOR_SECTOR) as string[] : [KEY_FOR_SECTOR[u.sector]];
  if (!allowed.includes(key)) fail(404, "Unknown data store.");
  return key;
}

accounts.get("/data/:key", async (c) => {
  const u = c.get("user");
  const key = dataKey(u, c.req.param("key"));
  const row = await c.env.DB.prepare("SELECT r2_key, version FROM fleet_data WHERE org_id = ? AND key = ?")
    .bind(u.org_id, key).first<{ r2_key: string; version: number }>();
  const obj = row ? await c.env.FILES.get(row.r2_key) : null;
  if (!row || !obj) return c.json(null);
  return new Response(obj.body, { headers: { "content-type": "application/json", etag: `"v${row.version}"` } });
});

accounts.put("/data/:key", async (c) => {
  const u = c.get("user");
  const key = dataKey(u, c.req.param("key"));
  if (!canWriteFleetData(u)) fail(403, "Your role can view this data but not change it.");
  if (Number(c.req.header("content-length") ?? 0) > MAX_DATA_BYTES) fail(413, "Data is larger than 15 MB. Store images separately.");
  const text = await c.req.text();
  if (text.length > MAX_DATA_BYTES) fail(413, "Data is larger than 15 MB. Store images separately.");
  let value: unknown;
  try { value = JSON.parse(text); } catch { fail(400, "Data must be a JSON object."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "Data must be a JSON object.");
  // The dashboard renders these values as HTML, so markup in them would run in every colleague's browser.
  const unsafe = unsafeJson(value);
  if (unsafe) fail(400, `Not saved: ${unsafe}`);

  const db = c.env.DB;
  const row = await db.prepare("SELECT version FROM fleet_data WHERE org_id = ? AND key = ?").bind(u.org_id, key).first<{ version: number }>();
  // Optional: send If-Match with the ETag from GET so two people saving at once do not overwrite each other.
  const ifMatch = c.req.header("if-match");
  if (ifMatch && row && ifMatch !== `"v${row.version}"`)
    return c.json({ error: "Someone else saved changes after you loaded this data. Reload and try again.", version: row.version }, 412);
  const r2Key = `org/${u.org_id}/data/${key}.json`;
  await c.env.FILES.put(r2Key, text, { httpMetadata: { contentType: "application/json" } });
  const version = (row?.version ?? 0) + 1;
  await db.prepare(
    `INSERT INTO fleet_data (org_id, key, r2_key, bytes, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id, key) DO UPDATE SET bytes = excluded.bytes, version = excluded.version,
       updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(u.org_id, key, r2Key, text.length, version, now(), u.id).run();
  c.header("etag", `"v${version}"`);
  return c.json({ success: true, version });
});
