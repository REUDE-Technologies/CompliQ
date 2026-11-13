#!/usr/bin/env node
// Gives one account a new one-time password (the admin pages have no reset button yet).
// The user must set their own password at the next sign-in, and is signed out everywhere now.
//
//   node scripts/reset-password.mjs ravi@acme.com --org "Acme Wind" --remote
//   node scripts/reset-password.mjs solar@acme.com --org "Acme Wind" --solar --remote
import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, randomInt } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";

const args = process.argv.slice(2);
const email = (args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--org") ?? "").trim().toLowerCase();
const org = args[args.indexOf("--org") + 1];
const target = args.includes("--remote") ? "--remote" : args.includes("--local") ? "--local" : null;
const sector = args.includes("--solar") ? "solar" : "wind";
if (!email || args.indexOf("--org") < 0 || !org || !target) {
  console.error('Usage: node scripts/reset-password.mjs <email> --org "<organization name>" [--solar] --local|--remote');
  process.exit(1);
}
const orgKey = String(org).trim().toLowerCase().replace(/[^a-z0-9]+/g, "").replace(/^\d+/, "") || "organization";
const pick = (set, n) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
const L = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const temp = `${pick(L, 4)}-${pick(L + "23456789", 4)}-${pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 2)}${pick("23456789", 2)}!`;
const salt = randomBytes(16);
const hash = `pbkdf2$100000$${salt.toString("hex")}$${pbkdf2Sync(temp, salt, 100000, 32, "sha256").toString("hex")}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const where = `email = ${q(email)} AND sector = ${q(sector)} AND org_id = (SELECT id FROM organizations WHERE org_key = ${q(orgKey)})`;
const sql = `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE ${where});
UPDATE users SET password_hash = ${q(hash)}, must_change_password = 1 WHERE ${where};
SELECT changes() AS updated;`;

const file = `.reset-${randomBytes(4).toString("hex")}.sql`;
writeFileSync(file, sql, { mode: 0o600 });
try {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "compliq-db", target, "--file", file, "--yes", "--json"], { encoding: "utf8" });
  const updated = JSON.parse(out).at(-1)?.results?.[0]?.updated;
  if (!updated) { console.error(`No ${sector} account ${email} in organization "${org}".`); process.exit(1); }
  console.log(`One-time password for ${email}: ${temp}\nGive it to them privately; they must change it when they sign in.`);
} finally {
  unlinkSync(file);
}
