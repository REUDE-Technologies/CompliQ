// Admin routes: same paths and shapes as the old server, with the permission holes closed.
import { Hono } from "hono";
import {
  type Env, type User, USER_SELECT, ROLES, publicUser, organizationKey, fail, readJson, str, requireUser,
  requireGlobalAdmin, requireSolarAdmin, isGlobalAdmin, isSolarAdmin, EMAIL, checkText,
} from "./auth";
import { hashPassword, passwordProblem, temporaryPassword } from "./security";

export const admin = new Hono<Env>();
admin.use("*", requireUser);

const STATUSES = ["active", "pending", "rejected", "disabled"];
const PLATFORM_KEY = "reudetechnologies";

async function overview(db: D1Database) {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const r = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE global_admin = 0) AS totalUsers,
            (SELECT COUNT(*) FROM users WHERE global_admin = 0 AND status = 'pending') AS pendingUsers,
            (SELECT COUNT(*) FROM organizations) AS totalOrganizations,
            (SELECT COUNT(*) FROM users WHERE global_admin = 0 AND last_login_at >= ?) AS activeUsers30d,
            (SELECT COUNT(*) FROM activity_events WHERE type = 'upload') AS uploads,
            (SELECT COUNT(*) FROM activity_events WHERE type = 'report') AS reports`).bind(since)
    .first<{ totalUsers: number; reports: number } & Record<string, number>>();
  return { ...r!, reportsPerUser: r!.totalUsers ? Number((r!.reports / r!.totalUsers).toFixed(1)) : 0 };
}
const allUsers = async (db: D1Database, where = "", ...binds: unknown[]) =>
  (await db.prepare(`${USER_SELECT} ${where} ORDER BY o.name, u.email`).bind(...binds).all<User>()).results.map(publicUser);

admin.get("/users", requireGlobalAdmin, async (c) => c.json(await allUsers(c.env.DB)));
admin.get("/overview", requireGlobalAdmin, async (c) => c.json(await overview(c.env.DB)));
admin.get("/dashboard", requireGlobalAdmin, async (c) => {
  const db = c.env.DB;
  const [users, orgs, ov] = await Promise.all([
    allUsers(db),
    db.prepare("SELECT name, org_key AS orgKey FROM organizations ORDER BY name").all(),
    overview(db),
  ]);
  return c.json({ users, organizations: orgs.results, overview: { ...ov, totalOrganizations: orgs.results.length } });
});

// ---------- user sync (the admin pages send their user list here) ----------
type SyncInput = Record<string, unknown>;

/**
 * Creates missing users and updates existing ones in ONE D1 batch (all or nothing).
 * Differences from the old server: only fields that are sent are changed (a partial object no longer resets
 * role and status), global administrators can never be changed here, and a solar administrator can only
 * manage solar accounts below Administrator.
 */
async function syncUsers(db: D1Database, actor: User, inputs: SyncInput[], solarOnly: boolean) {
  if (inputs.length > 500) fail(413, "Send at most 500 users at a time.");
  const orgRows = (await db.prepare("SELECT id, org_key FROM organizations").all<{ id: string; org_key: string }>()).results;
  const orgs = new Map(orgRows.map((o) => [o.org_key, o.id]));
  const emails = [...new Set(inputs.map((i) => str(i.email, 254).toLowerCase()).filter(Boolean))];
  const existing = (await db.prepare(
    `SELECT u.id, u.email, u.sector, u.role, u.status, u.global_admin, u.first_name, u.last_name, u.phone, u.bio, u.gst,
            u.pan, u.provisioned, o.org_key FROM users u JOIN organizations o ON o.id = u.org_id
      WHERE u.email IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(emails))
    .all<Record<string, string | number> & { id: string; role: string; global_admin: number }>()).results;
  const byIdentity = new Map(existing.map((e) => [`${e.email}|${e.org_key}|${e.sector}`, e]));

  const stmts: D1PreparedStatement[] = [];
  let synced = 0;
  for (const input of inputs) {
    const email = str(input.email, 254).toLowerCase();
    const orgName = str(input.org, 120);
    if (!email || !orgName) continue;
    const orgKey = organizationKey(input.orgKey || orgName);
    const sector = solarOnly ? "solar" : input.sector === "solar" ? "solar" : "wind";
    const found = byIdentity.get(`${email}|${orgKey}|${sector}`);
    if (found?.global_admin) continue;                                   // never touched from here
    // The solar admin page sends its whole list, including Administrators (itself too): leave those unchanged.
    if (solarOnly && found?.role === "Administrator") continue;
    if (solarOnly && input.role === "Administrator")
      fail(403, `Only the global administrator can make Administrator accounts (${email}).`);
    if (input.role !== undefined && !ROLES.includes(String(input.role))) fail(400, `Unknown role for ${email}.`);
    if (input.status !== undefined && !STATUSES.includes(String(input.status))) fail(400, `Unknown status for ${email}.`);
    // An entry the page still has but that has no account and no password (e.g. a failed earlier attempt): skip it.
    if (!found && !input.password) continue;
    if (!found && !EMAIL.test(email)) fail(400, `${email} is not a valid email address.`);

    let orgId = orgs.get(orgKey);
    if (!orgId) {
      checkText(`Organization for ${email}`, orgName);
      orgId = crypto.randomUUID();
      orgs.set(orgKey, orgId);
      stmts.push(db.prepare("INSERT INTO organizations (id, name, org_key) VALUES (?, ?, ?)").bind(orgId, orgName, orgKey));
    }
    const fields: Record<string, string | number> = {};
    const map: Record<string, string> = { firstName: "first_name", lastName: "last_name", role: "role", status: "status",
      phone: "phone", bio: "bio", gst: "gst", pan: "pan" };
    for (const [k, col] of Object.entries(map)) {
      if (input[k] === undefined) continue;
      const v = str(input[k], k === "bio" ? 1000 : 120);
      if (found && String(found[col] ?? "") === v) continue;            // unchanged: no check, no write
      fields[col] = checkText(`${k} for ${email}`, v, k === "bio" ? "long" : "short");
    }
    if (input.provisioned !== undefined && (!found || Number(found.provisioned) !== (input.provisioned ? 1 : 0)))
      fields.provisioned = input.provisioned ? 1 : 0;

    if (found) {
      const cols = Object.keys(fields);
      if (cols.length) stmts.push(db.prepare(`UPDATE users SET ${cols.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
        .bind(...Object.values(fields), found.id));
    } else {
      const password = String(input.password ?? "");
      const problem = passwordProblem(password, email);
      if (problem) fail(400, `A valid password is required to create ${email}. ${problem}`);
      const row = { id: crypto.randomUUID(), org_id: orgId, email, sector, role: "Fleet Operator", status: "active",
        ...fields, password_hash: await hashPassword(password) };
      const cols = Object.keys(row);
      stmts.push(db.prepare(`INSERT INTO users (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
        .bind(...Object.values(row)));
      byIdentity.set(`${email}|${orgKey}|${sector}`, { ...row, global_admin: 0, org_key: orgKey } as never);
    }
    synced++;
  }
  stmts.push(db.prepare("INSERT INTO activity_events (org_id, user_id, type, detail_json) VALUES (?, ?, 'users_synced', ?)")
    .bind(actor.org_id, actor.id, JSON.stringify({ count: synced, solarOnly })));
  await db.batch(stmts);
  return synced;
}

admin.post("/users/sync", requireGlobalAdmin, async (c) => {
  const b = await readJson<{ users?: SyncInput[] }>(c, 2 * 1024 * 1024);
  const synced = await syncUsers(c.env.DB, c.get("user"), Array.isArray(b.users) ? b.users : [], false);
  return c.json({ success: true, synced });
});
admin.post("/solar/users/sync", requireSolarAdmin, async (c) => {
  const b = await readJson<{ users?: SyncInput[] }>(c, 2 * 1024 * 1024);
  const synced = await syncUsers(c.env.DB, c.get("user"), Array.isArray(b.users) ? b.users : [], true);
  return c.json({ success: true, synced });
});

admin.get("/solar/users", requireSolarAdmin, async (c) => c.json(await allUsers(c.env.DB, "WHERE u.sector = 'solar'")));

// DELETE ?email=  (optionally &orgKey= and &sector= to remove only one of several same-email accounts)
async function deleteUsers(c: import("./auth").C, solarOnly: boolean) {
  const email = str(c.req.query("email"), 254).toLowerCase();
  if (!email) fail(400, "A removable account email is required.");
  const orgKey = c.req.query("orgKey");
  const sector = solarOnly ? "solar" : c.req.query("sector");
  const r = await c.env.DB.prepare(
    `DELETE FROM users WHERE email = ?1 AND global_admin = 0 AND id != ?4
        AND (?2 IS NULL OR org_id = (SELECT id FROM organizations WHERE org_key = ?2))
        AND (?3 IS NULL OR sector = ?3)
        AND (?5 = 0 OR role != 'Administrator')`)
    .bind(email, orgKey ? organizationKey(orgKey) : null, sector ?? null, c.get("user").id, solarOnly ? 1 : 0).run();
  return c.json({ success: true, deleted: r.meta.changes });
}
admin.delete("/users", requireGlobalAdmin, (c) => deleteUsers(c, false));
admin.delete("/solar/users", requireSolarAdmin, (c) => deleteUsers(c, true));

// ---------- password reset (new) ----------
admin.post("/users/reset-password", async (c) => {
  const actor = c.get("user");
  if (!isGlobalAdmin(actor) && !isSolarAdmin(actor)) fail(403, "Administrator access is required.");
  const b = await readJson(c);
  const email = str(b.email, 254).toLowerCase();
  const sector = b.sector === "solar" ? "solar" : "wind";
  const target = await c.env.DB.prepare(`${USER_SELECT} WHERE u.email = ? AND o.org_key = ? AND u.sector = ?`)
    .bind(email, organizationKey(b.orgKey), sector).first<User>();
  if (!target) fail(404, "Account not found.");
  if (target!.global_admin && target!.id !== actor.id) fail(403, "Another global administrator cannot be reset here.");
  if (!isGlobalAdmin(actor) && (target!.sector !== "solar" || target!.role === "Administrator"))
    fail(403, "Solar administrators can reset solar accounts below Administrator only.");
  const temp = temporaryPassword();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").bind(await hashPassword(temp), target!.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(target!.id),
  ]);
  return c.json({ success: true, temporaryPassword: temp });
});

// ---------- organizations ----------
/** Every organization gets its own random one-time operator password (the old server gave all of them the same one). */
async function createOperator(db: D1Database, orgId: string, orgKey: string) {
  const temp = temporaryPassword();
  const id = crypto.randomUUID();
  const stmt = db.prepare(
    `INSERT INTO users (id, org_id, email, first_name, last_name, role, sector, status, provisioned, must_change_password, password_hash)
     VALUES (?, ?, ?, 'Fleet', 'Operator', 'Fleet Operator', 'wind', 'active', 1, 1, ?)`)
    .bind(id, orgId, `operator@${orgKey}.tech`, await hashPassword(temp));
  return { id, temp, stmt };
}
const userById = (db: D1Database, id: string) => db.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(id).first<User>();

admin.post("/organizations", requireGlobalAdmin, async (c) => {
  const db = c.env.DB;
  const name = str((await readJson(c)).name, 120);
  if (!name) fail(400, "Organization name is required.");
  const orgKey = organizationKey(name);
  if (orgKey === PLATFORM_KEY || orgKey === "organization") fail(409, "This organization already exists.");
  if (await db.prepare("SELECT 1 FROM organizations WHERE org_key = ?").bind(orgKey).first())
    fail(409, "An organization with this name already exists.");
  const orgId = crypto.randomUUID();
  const op = await createOperator(db, orgId, orgKey);
  await db.batch([db.prepare("INSERT INTO organizations (id, name, org_key) VALUES (?, ?, ?)").bind(orgId, name, orgKey), op.stmt]);
  return c.json({ organization: { name, orgKey }, operator: publicUser((await userById(db, op.id))!), defaultPassword: op.temp }, 201);
});

// Create the organization, or repair it by adding its missing operator. (Solar admin route kept from the old server.)
admin.post("/solar/organizations", requireSolarAdmin, async (c) => {
  const db = c.env.DB;
  const name = str((await readJson(c)).name, 120);
  if (!name) fail(400, "Organization name is required.");
  const orgKey = organizationKey(name);
  if (orgKey === PLATFORM_KEY || orgKey === "organization") fail(409, "This organization already exists.");
  const existing = await db.prepare("SELECT id, name FROM organizations WHERE org_key = ?").bind(orgKey).first<{ id: string; name: string }>();
  const orgId = existing?.id ?? crypto.randomUUID();
  const stmts: D1PreparedStatement[] = [];
  if (!existing) stmts.push(db.prepare("INSERT INTO organizations (id, name, org_key) VALUES (?, ?, ?)").bind(orgId, name, orgKey));
  const current = await db.prepare("SELECT id FROM users WHERE org_id = ? AND email = ? AND sector = 'wind'")
    .bind(orgId, `operator@${orgKey}.tech`).first<{ id: string }>();
  let operatorId = current?.id;
  let defaultPassword: string | undefined;
  if (!current) {
    const op = await createOperator(db, orgId, orgKey);
    stmts.push(op.stmt);
    operatorId = op.id;
    defaultPassword = op.temp;
  }
  if (stmts.length) await db.batch(stmts);
  return c.json({ organization: { name: existing?.name ?? name, orgKey }, operator: publicUser((await userById(db, operatorId!))!),
    defaultPassword, repaired: Boolean(existing) }, existing ? 200 : 201);
});

admin.delete("/organizations/:orgKey", requireGlobalAdmin, async (c) => {
  const db = c.env.DB;
  const orgKey = organizationKey(c.req.param("orgKey"));
  const org = await db.prepare("SELECT id, name, is_platform FROM organizations WHERE org_key = ?").bind(orgKey)
    .first<{ id: string; name: string; is_platform: number }>();
  if (!org) fail(404, "Organization not found.");
  if (org!.is_platform) fail(400, "The built-in organization cannot be removed.");
  const counts = await db.prepare(
    `SELECT (SELECT COUNT(*) FROM users WHERE org_id = ?1) AS users,
            (SELECT COUNT(*) FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.org_id = ?1) AS sessions,
            (SELECT COUNT(*) FROM fleet_data WHERE org_id = ?1) AS data`).bind(org!.id)
    .first<{ users: number; sessions: number; data: number }>();
  // Files first (inspection images, JSON store), then the rows; ON DELETE CASCADE removes users, sessions, inspections.
  let cursor: string | undefined;
  for (let page = 0; page < 40; page++) {
    const list = await c.env.FILES.list({ prefix: `org/${org!.id}/`, cursor, limit: 1000 });
    if (list.objects.length) await c.env.FILES.delete(list.objects.map((o) => o.key));
    if (!list.truncated) break;
    cursor = list.cursor;
  }
  await db.prepare("DELETE FROM organizations WHERE id = ?").bind(org!.id).run();
  return c.json({ success: true, organization: org!.name, removedUsers: counts!.users, revokedSessions: counts!.sessions,
    removedDataRecords: counts!.data });
});
