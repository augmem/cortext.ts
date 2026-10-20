#!/usr/bin/env node
/**
 * Vendor N-API prebuilds into prebuilds/<platform>/cortext.node.
 *
 * Local compatibility helper only. Release CI uses build-prebuild.mjs and
 * collect-prebuilds.mjs so every addon has exact core-tag provenance.
 * Resolution order:
 *   1. --from <dir> (explicit)
 *   2. Matching core checkout: ../cortext.cpp/bindings/javascript/prebuilds
 *      (legacy ../cortext path is also accepted)
 *
 * Usage:
 *   node scripts/vendor-prebuilds.mjs
 *   node scripts/vendor-prebuilds.mjs --from ../cortext.cpp/bindings/javascript/prebuilds
 *   node scripts/vendor-prebuilds.mjs --host-only
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destRoot = path.join(root, "prebuilds");

const TARGETS = [
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
];

function parseArgs(argv) {
  const args = { from: null, hostOnly: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--from") args.from = argv[++i];
    else if (a === "--host-only") args.hostOnly = true;
    else if (a === "--force") args.force = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: vendor-prebuilds.mjs [--from <dir>] [--host-only] [--force]`);
      process.exit(0);
    }
  }
  return args;
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function findSiblingPrebuilds() {
  const candidates = ["cortext.cpp", "cortext"].map((repo) =>
    path.resolve(root, "..", repo, "bindings", "javascript", "prebuilds")
  );
  return candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "manifest.json"))
  ) ?? null;
}

function vendorFrom(sourceDir, { hostOnly, force }) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`source prebuilds dir not found: ${sourceDir}`);
  }

  const hostTag = `${process.platform}-${process.arch}`;
  const targets = hostOnly ? TARGETS.filter((t) => t === hostTag) : TARGETS;
  if (hostOnly && targets.length === 0) {
    throw new Error(`host platform ${hostTag} is not a supported prebuild target`);
  }

  const manifestSrc = path.join(sourceDir, "manifest.json");
  if (fs.existsSync(manifestSrc)) {
    fs.mkdirSync(destRoot, { recursive: true });
    copyFile(manifestSrc, path.join(destRoot, "manifest.json"));
  }

  let copied = 0;
  for (const tag of targets) {
    const src = path.join(sourceDir, tag, "cortext.node");
    const dest = path.join(destRoot, tag, "cortext.node");
    if (!fs.existsSync(src)) {
      console.warn(`skip missing ${tag}: ${src}`);
      continue;
    }
    if (fs.existsSync(dest) && !force) {
      const srcStat = fs.statSync(src);
      const destStat = fs.statSync(dest);
      if (srcStat.size === destStat.size) {
        console.log(`keep ${tag} (${destStat.size} bytes)`);
        copied++;
        continue;
      }
    }
    copyFile(src, dest);
    console.log(`copied ${tag} -> ${dest} (${fs.statSync(dest).size} bytes)`);
    copied++;
  }

  if (copied === 0) {
    throw new Error(`no prebuilds copied from ${sourceDir}`);
  }
  console.log(`vendored ${copied} target(s) into ${destRoot}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = (args.from && path.resolve(args.from)) || findSiblingPrebuilds();

  if (!source) {
    console.error(
      "No prebuild source found.\n" +
        "  - Pass --from <dir> pointing at a prebuilds/ tree\n" +
        "  - Or place the matching core checkout at ../cortext.cpp with bindings/javascript/prebuilds\n" +
        "  - (Legacy) place the monorepo at ../cortext with bindings/javascript/prebuilds\n" +
        "  - Release CI uses scripts/build-prebuild.mjs instead of this helper"
    );
    process.exit(1);
  }

  console.log(`vendoring prebuilds from ${source}`);
  vendorFrom(source, args);
}

main();
