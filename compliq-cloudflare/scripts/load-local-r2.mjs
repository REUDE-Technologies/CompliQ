#!/usr/bin/env node
// Local testing only: copy a folder of images into the local R2 bucket that `npm run dev` uses.
//
//   node scripts/load-local-r2.mjs <folder>
//
// The folder is what tools/fake_cloudflare.py (in Inspection Studio) wrote, e.g. local_r2/org/<org>/insp/<id>/B1-SS-01.webp;
// each file's path inside the folder becomes its R2 key. Stop `npm run dev` first.
import { getPlatformProxy } from "wrangler";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const root = process.argv[2];
if (!root) { console.error("Usage: node scripts/load-local-r2.mjs <folder>"); process.exit(1); }
const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const { env, dispose } = await getPlatformProxy({ persist: true });
let n = 0;
for (const file of walk(root).filter((f) => !f.endsWith(".__meta__.json"))) {
  const key = relative(root, file).split(sep).join("/");
  await env.FILES.put(key, readFileSync(file), { httpMetadata: { contentType: file.endsWith(".webp") ? "image/webp" : "application/octet-stream" } });
  n++;
}
await dispose();
console.log(`Copied ${n} files into local R2 (compliq-files).`);
