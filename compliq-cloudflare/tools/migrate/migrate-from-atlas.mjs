#!/usr/bin/env node
// One-time copy of the old MongoDB Atlas data into D1 + R2.
//
//   cd tools/migrate && npm install
//   node --env-file=/path/to/atlas-credential.env migrate-from-atlas.mjs ./out
//
// Writes into ./out:
//   import.sql                 organizations, users, JSON-store index, activity  -> wrangler d1 execute --file
//   fleet/<org>/<key>.json     the dashboard JSON store, one file per organization
//   upload-fleet-data.sh       wrangler r2 object put for each of those files
//   temporary-passwords.csv    accounts whose password was one of the defaults in the old source code;
//                              they get a new one-time password. Hand these out, then DELETE this file.
// Sessions are not copied: everyone signs in again once.
import { pbkdf2Sync, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PLATFORM_ID = "00000000-0000-0000-0000-000000000001";
const PLATFORM_KEY = "reudetechnologies";
const ROLES = ["Administrator", "Fleet Operator", "Maintenance Engineer", "Data Analyst", "Site Manager", "Editor", "Viewer"];
const DATA_KEYS = ["reude_fleet_db", "reude_solar_db"];
// Every password that was written in the old server.js. Accounts still using one are forced to reset.
const KNOWN_DEFAULTS = ["Admin@Reude2026", "Operator@2026", "Engineer@2026", "Analyst@2026", "SiteMan@2026", "Admin@Solar2026",
  "Solar@Reude2026", "Engineer@Solar2026", "Analyst@Solar2026", "Operator@reude2026"];

export const organizationKey = (name) =>
  String(name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/^\d+/, "") || "organization";
const q = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const uuid = () => crypto.randomUUID();

function usesKnownDefault(hash) {
  const [scheme, salt, hex] = String(hash ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  return KNOWN_DEFAULTS.some((pw) => timingSafeEqual(scryptSync(pw, salt, expected.length), expected));
}
function tempPassword() {
  const pick = (set, n) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  return `${pick(L, 4)}-${pick(L + "23456789", 4)}-${pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 2)}${pick("23456789", 2)}!`;
}
function pbkdf2(password) {
  const salt = randomBytes(16);
  return `pbkdf2$100000$${salt.toString("hex")}$${pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex")}`;
}

/** Pure mapping from the Mongo documents to SQL + files, so it can be tested without Atlas. */
export function transform({ organizations = [], users = [], fleetData = [], activityEvents = [] }) {
  const warnings = [];
  const sql = [];
  const orgIds = new Map([[PLATFORM_KEY, PLATFORM_ID]]);
  const ensureOrg = (name, orgKey) => {
    const key = organizationKey(orgKey || name);
    if (orgIds.has(key)) return orgIds.get(key);
    const id = uuid();
    orgIds.set(key, id);
    sql.push(`INSERT INTO organizations (id, name, org_key) VALUES (${q(id)}, ${q(String(name || key).trim().slice(0, 120))}, ${q(key)});`);
    return id;
  };
  for (const o of organizations) ensureOrg(o.name, o.orgKey);

  const seen = new Set();
  const userIds = new Set();
  const temporary = [];
  for (const u of users) {
    const email = String(u.emailLower || u.email || "").trim().toLowerCase();
    if (!email) { warnings.push(`skipped a user with no email (${u._id})`); continue; }
    const orgKey = organizationKey(u.orgKey || u.org);
    const sector = u.sector === "solar" ? "solar" : "wind";
    const identity = `${email}|${orgKey}|${sector}`;
    if (seen.has(identity)) { warnings.push(`skipped duplicate ${identity}`); continue; }
    seen.add(identity);
    const orgId = ensureOrg(u.org, orgKey);
    let role = u.role;
    if (!ROLES.includes(role)) { warnings.push(`${email}: unknown role "${role}" -> Viewer`); role = "Viewer"; }
    const status = ["active", "pending", "rejected"].includes(u.status) ? u.status : "disabled";
    let globalAdmin = u.globalAdmin ? 1 : 0;
    if (globalAdmin && orgKey !== PLATFORM_KEY) { warnings.push(`${email}: globalAdmin outside REUDE Technologies removed`); globalAdmin = 0; }

    let hash = u.passwordHash;
    let mustChange = 0;
    if (!hash || usesKnownDefault(hash)) {
      const temp = tempPassword();
      temporary.push({ email, org: u.org || orgKey, sector, temp, reason: hash ? "default password from old source code" : "no password" });
      hash = pbkdf2(temp);
      mustChange = 1;
    }
    const id = String(u._id ?? uuid());
    userIds.add(id);
    const s = (v, max = 200) => String(v ?? "").trim().slice(0, max);
    sql.push(`INSERT INTO users (id, org_id, email, first_name, last_name, role, sector, status, global_admin, provisioned, ` +
      `must_change_password, password_hash, phone, bio, gst, pan, created_at, last_login_at) VALUES (` +
      [id, orgId, email, s(u.firstName, 100), s(u.lastName, 100), role, sector, status, globalAdmin, u.provisioned ? 1 : 0,
        mustChange, hash, s(u.phone, 30), s(u.bio, 1000), s(u.gst, 15).toUpperCase(), s(u.pan, 10).toUpperCase(),
        iso(u.createdAt) ?? new Date().toISOString(), iso(u.lastLoginAt)].map(q).join(", ") + ");");
  }

  const files = [];
  for (const d of fleetData) {
    if (!DATA_KEYS.includes(d.key)) { warnings.push(`skipped data store key "${d.key}"`); continue; }
    const orgId = orgIds.get(organizationKey(d.orgKey));
    if (!orgId) { warnings.push(`skipped data for unknown organization "${d.orgKey}"`); continue; }
    const json = JSON.stringify(d.value ?? {});
    const r2Key = `org/${orgId}/data/${d.key}.json`;
    files.push({ path: join("fleet", orgId, `${d.key}.json`), r2Key, json });
    if (json.length > 15 * 1024 * 1024) warnings.push(`${d.orgKey}/${d.key} is ${(json.length / 1e6).toFixed(1)} MB; the new limit is 15 MB`);
    sql.push(`INSERT INTO fleet_data (org_id, key, r2_key, bytes, version, updated_at) VALUES (` +
      [orgId, d.key, r2Key, json.length, 1, iso(d.updatedAt) ?? new Date().toISOString()].map(q).join(", ") + ");");
  }

  for (const a of activityEvents) {
    const orgId = orgIds.get(organizationKey(a.orgKey)) ?? null;
    const userId = a.userId && userIds.has(String(a.userId)) ? String(a.userId) : null;
    sql.push(`INSERT INTO activity_events (org_id, user_id, sector, type, detail_json, created_at) VALUES (` +
      [orgId, userId, a.sector ?? null, String(a.type ?? "unknown").slice(0, 40), JSON.stringify(a.details ?? {}),
        iso(a.createdAt) ?? new Date().toISOString()].map(q).join(", ") + ");");
  }
  return { sql: sql.join("\n") + "\n", files, temporary, warnings };
}

export function writeOutput(outDir, result) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "import.sql"), result.sql);
  const sh = ["#!/bin/sh", "# Run from the compliq project folder (where wrangler.jsonc is).", "set -e"];
  for (const f of result.files) {
    mkdirSync(join(outDir, f.path, ".."), { recursive: true });
    writeFileSync(join(outDir, f.path), f.json);
    sh.push(`npx wrangler r2 object put "compliq-files/${f.r2Key}" --file "${join(outDir, f.path)}" --content-type application/json --remote`);
  }
  writeFileSync(join(outDir, "upload-fleet-data.sh"), sh.join("\n") + "\n", { mode: 0o755 });
  if (result.temporary.length)
    writeFileSync(join(outDir, "temporary-passwords.csv"),
      "email,organization,sector,temporary_password,reason\n" +
      result.temporary.map((t) => [t.email, t.org, t.sector, t.temp, t.reason].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n",
      { mode: 0o600 });
}

async function main() {
  const outDir = process.argv[2] ?? "./out";
  if (!process.env.MONGODB_URI) { console.error("MONGODB_URI is missing. Run with --env-file=/path/to/atlas-credential.env"); process.exit(1); }
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  try {
    const db = client.db(process.env.MONGODB_DB || "compliq");
    const read = (name) => db.collection(name).find({}).toArray();
    const [organizations, users, fleetData, activityEvents] = await Promise.all(
      ["organizations", "users", "fleetData", "activityEvents"].map(read));
    const result = transform({ organizations, users, fleetData, activityEvents });
    writeOutput(outDir, result);
    console.log(`organizations ${organizations.length}, users ${users.length}, data stores ${result.files.length}, activity ${activityEvents.length}`);
    for (const w of result.warnings) console.log("warning:", w);
    console.log(`\nNext, from the compliq folder:
  npx wrangler d1 execute compliq-db --remote --file ${join(outDir, "import.sql")}
  sh ${join(outDir, "upload-fleet-data.sh")}`);
    if (result.temporary.length)
      console.log(`\n${result.temporary.length} account(s) still used a password from the old source code and got a new one-time password:
  ${join(outDir, "temporary-passwords.csv")}   <- hand them out privately, then delete this file.`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });
