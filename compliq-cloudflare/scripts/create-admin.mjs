#!/usr/bin/env node
// Creates (or resets) a platform account in REUDE Technologies, so no password ever lives in the code.
//
//   node scripts/create-admin.mjs admin@reude.tech --remote             global administrator
//   node scripts/create-admin.mjs solar-admin@reude.tech --solar --remote   solar administrator
//
// Use --local instead of --remote to write to the local dev database. You are asked for the password
// (or set ADMIN_PASSWORD for scripted use). Running it again for the same email resets that password.
import { execFileSync } from "node:child_process";
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const target = args.includes("--remote") ? "--remote" : args.includes("--local") ? "--local" : null;
const solar = args.includes("--solar");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !target) {
  console.error("Usage: node scripts/create-admin.mjs <email> [--solar] --local|--remote");
  process.exit(1);
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : "*");   // hide what is typed
    rl.question(question, (a) => { rl.close(); process.stdout.write("\n"); resolve(a); });
  });
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  password = await ask("Password: ");
  if ((await ask("Repeat password: ")) !== password) { console.error("Passwords do not match."); process.exit(1); }
}
if (password.length < 12 || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*]/.test(password)) {
  console.error("Use at least 12 characters with an upper-case letter, a number and one of !@#$%^&*.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = `pbkdf2$100000$${salt.toString("hex")}$${pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex")}`;
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const PLATFORM = "00000000-0000-0000-0000-000000000001";
const sector = solar ? "solar" : "wind";
const sql = `INSERT INTO users (id, org_id, email, first_name, last_name, role, sector, status, global_admin, password_hash)
VALUES (${q(randomUUID())}, ${q(PLATFORM)}, ${q(email)}, ${q(solar ? "Solar" : "Admin")}, 'REUDE', 'Administrator', ${q(sector)},
        'active', ${solar ? 0 : 1}, ${q(hash)})
ON CONFLICT (email, org_id, sector) DO UPDATE SET password_hash = excluded.password_hash, status = 'active',
  role = 'Administrator', global_admin = excluded.global_admin, must_change_password = 0;
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ${q(email)} AND org_id = ${q(PLATFORM)});`;

const file = `.create-admin-${randomBytes(4).toString("hex")}.sql`;
writeFileSync(file, sql, { mode: 0o600 });
try {
  execFileSync("npx.cmd", ["wrangler", "d1", "execute", "compliq-db", target, "--file", file, "--yes"], {shell: true, stdio: "inherit" });
  console.log(solar
    ? `\nSolar administrator ${email} is ready. Sign in on the solar dashboard with organization "REUDE Technologies".`
    : `\nGlobal administrator ${email} is ready. Sign in with the admin option (organization "__admin__").`);
} finally {
  unlinkSync(file);
}
