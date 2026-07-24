#!/usr/bin/env node
/**
 * Fail publish/CI when required prebuilds are missing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prebuilds = path.join(root, "prebuilds");

const TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
];

const hostOnly = process.argv.includes("--host-only");
const hostTag = `${process.platform}-${process.arch}`;
const required = hostOnly ? TARGETS.filter((t) => t === hostTag) : TARGETS;

if (required.length === 0) {
  console.error(`host ${hostTag} is not a supported prebuild target`);
  process.exit(1);
}

const missing = [];
for (const tag of required) {
  const file = path.join(prebuilds, tag, "cortext.node");
  if (!fs.existsSync(file) || fs.statSync(file).size < 1024) {
    missing.push(file);
  }
}

if (missing.length) {
  console.error("Missing prebuilds:\n" + missing.map((m) => `  - ${m}`).join("\n"));
  console.error("Run: npm run vendor:prebuilds");
  process.exit(1);
}

console.log(
  `prebuilds ok (${required.length} target${required.length === 1 ? "" : "s"})`
);
