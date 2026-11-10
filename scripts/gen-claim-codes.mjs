#!/usr/bin/env node
// Print N one-off machine claim codes (and SHA-256 hashes if openssl is available).
// Usage: node scripts/gen-claim-codes.mjs [count]
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";

const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const n = Math.max(1, Math.min(100, Number(process.argv[2] || 5)));
const pick = (k) => Array.from({ length: k }, () => abc[randomInt(abc.length)]).join("");
for (let i = 0; i < n; i++) {
  const code = pick(4) + "-" + pick(4);
  let hash = "";
  try { hash = execFileSync("openssl", ["dgst", "-sha256"], { input: code, encoding: "utf8" }).trim().split(/\s+/).pop(); }
  catch { /* openssl optional */ }
  console.log(hash ? `${code}  ${hash}` : code);
}
