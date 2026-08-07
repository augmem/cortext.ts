#!/usr/bin/env node
/** Verify npm pack metadata is exactly the resolved binding release. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertReleaseVersion } from "./prebuilds-common.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = { packJson: null, version: process.env.RELEASE_VERSION ?? "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pack-json") args.packJson = path.resolve(argv[++i] ?? "");
    else if (arg === "--version") args.version = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: verify-release-package.mjs --pack-json <npm-pack-json> --version <semver>");
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.packJson) throw new Error("--pack-json is required");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const version = assertReleaseVersion(args.version);
  const entries = JSON.parse(fs.readFileSync(args.packJson, "utf8"));
  if (!Array.isArray(entries) || entries.length !== 1) throw new Error("npm pack must produce exactly one tarball");
  const entry = entries[0];
  const expected = `augmem-cortext-${version}.tgz`;
  if (entry.name !== "@augmem/cortext" || entry.version !== version || entry.filename !== expected) {
    throw new Error(`npm pack metadata mismatch: expected @augmem/cortext@${version} as ${expected}`);
  }
  if (!/^[A-Za-z0-9._-]+\.tgz$/.test(entry.filename)) throw new Error("npm pack filename is unsafe");
  const tarball = path.join(root, entry.filename);
  if (!fs.existsSync(tarball) || fs.statSync(tarball).size === 0) throw new Error(`missing npm tarball: ${tarball}`);
  console.log(entry.filename);
}

try {
  main();
} catch (error) {
  console.error(`verify-release-package failed: ${error.message}`);
  process.exitCode = 1;
}
