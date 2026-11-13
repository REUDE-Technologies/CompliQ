// Password hashing, tokens and the password policy.
import { scrypt } from "@noble/hashes/scrypt";

export const enc = new TextEncoder();
export const hex = (b: ArrayBuffer | Uint8Array) =>
  [...(b instanceof Uint8Array ? b : new Uint8Array(b))].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array((s.match(/../g) ?? []).map((h) => parseInt(h, 16)));

export const sha256 = async (data: string | ArrayBuffer) =>
  hex(await crypto.subtle.digest("SHA-256", typeof data === "string" ? enc.encode(data) : data));
export const randomToken = (bytes = 32) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

// 100,000 is the highest PBKDF2 iteration count the Workers runtime accepts. About 20 ms of CPU per sign-in.
const ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${hex(salt)}$${hex(await pbkdf2(password, salt, ITERATIONS))}`;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && crypto.subtle.timingSafeEqual(a, b);
}

/** Checks a password. `rehash` is true when the stored hash is from the old server and should be replaced. */
export async function verifyPassword(password: string, stored: string): Promise<{ ok: boolean; rehash: boolean }> {
  const [scheme, a, b, c] = String(stored).split("$");
  if (scheme === "pbkdf2" && c) {
    const iterations = Number(a);
    if (!(iterations > 0 && iterations <= ITERATIONS)) return { ok: false, rehash: false };
    const ok = sameBytes(await pbkdf2(password, unhex(b), iterations), unhex(c));
    return { ok, rehash: ok && iterations < ITERATIONS };
  }
  if (scheme === "scrypt" && a && b) {
    // Old Node server: crypto.scryptSync(password, saltHexString, 64) with Node's defaults (N=16384, r=8, p=1).
    // This costs ~120 ms of CPU, so it runs once per user: a successful sign-in replaces it with PBKDF2.
    const expected = unhex(b);
    const actual = scrypt(enc.encode(password), enc.encode(a), { N: 16384, r: 8, p: 1, dkLen: expected.length });
    const ok = sameBytes(actual, expected);
    return { ok, rehash: ok };
  }
  return { ok: false, rehash: false };
}

/** Spend the same time as a real check, so response time does not reveal whether an email exists. */
const DUMMY = "pbkdf2$100000$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000";
export const dummyVerify = (password: string) => verifyPassword(password, DUMMY);

/** One-time password handed to a new or reset user; they must change it at first sign-in. */
export function temporaryPassword() {
  const pick = (set: string, n: number) => {
    const r = crypto.getRandomValues(new Uint32Array(n));
    return [...r].map((x) => set[x % set.length]).join("");
  };
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  return `${pick(letters, 4)}-${pick(letters + "23456789", 4)}-${pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 2)}${pick("23456789", 2)}!`;
}

// Passwords that appeared in the old source code. Anyone who saw the repo knows them.
const KNOWN_DEFAULTS = new Set([
  "admin@reude2026", "operator@2026", "engineer@2026", "analyst@2026", "siteman@2026", "admin@solar2026",
  "solar@reude2026", "engineer@solar2026", "analyst@solar2026", "operator@reude2026",
  "password", "password1", "password123", "12345678", "123456789", "qwerty123",
]);

/** Same rule the sign-up and account pages show: 8+ characters, an upper-case letter, a digit and a special character. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 8 || password.length > 128) return "Password must be 8 to 128 characters.";
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return "Password needs an upper-case letter, a number and a special character.";
  if (KNOWN_DEFAULTS.has(password.toLowerCase())) return "This password is publicly known. Choose another one.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "Password must not contain your email name.";
  return null;
}
