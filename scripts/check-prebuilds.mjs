#!/usr/bin/env node
/** Validate every publishable N-API prebuild and its core provenance manifest. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILD_SYSTEM,
  MIN_ADDON_BYTES,
  NAPI_VERSION,
  PREBUILD_SCHEMA,
  REQUIRED_SYMBOLS,
  TARGETS,
  TARGET_TAGS,
  assertCommit,
  assertCoreTag,
  assertSha,
  assertSymbols,
  readJson,
  sha256,
  targetFor,
} from "./prebuilds-common.mjs";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    root: defaultRoot,
    hostOnly: false,
    coreTag: process.env.CORTEXT_CORE_TAG ?? null,
    coreCommit: process.env.CORTEXT_CORE_COMMIT ?? null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === "--root") args.root = path.resolve(next());
    else if (arg === "--host-only") args.hostOnly = true;
    else if (arg === "--core-tag") args.coreTag = next();
    else if (arg === "--core-commit") args.coreCommit = next();
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: check-prebuilds.mjs [--root <package>] [--host-only] [--core-tag <tag>] [--core-commit <sha>]");
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const prebuilds = path.join(args.root, "prebuilds");
  const manifestPath = path.join(prebuilds, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`missing prebuild manifest: ${manifestPath}`);
  const manifest = readJson(manifestPath, "prebuild manifest");
  if (manifest.schema !== PREBUILD_SCHEMA) {
    throw new Error(`manifest schema must be ${PREBUILD_SCHEMA}`);
  }
  assertCoreTag(manifest.core_tag);
  assertCommit(manifest.core_commit);
  if (args.coreTag && manifest.core_tag !== assertCoreTag(args.coreTag)) {
    throw new Error(`manifest core_tag ${manifest.core_tag} does not match ${args.coreTag}`);
  }
  if (args.coreCommit) {
    assertCommit(args.coreCommit, "--core-commit");
    if (manifest.core_commit !== args.coreCommit) {
      throw new Error(`manifest core_commit ${manifest.core_commit} does not match ${args.coreCommit}`);
    }
  }
  if (manifest.napi !== NAPI_VERSION) throw new Error(`manifest N-API must be ${NAPI_VERSION}`);
  if (manifest.build_system !== BUILD_SYSTEM) throw new Error(`manifest build_system must be ${BUILD_SYSTEM}`);
  assertSymbols(manifest.symbols, "manifest.symbols");

  const required = args.hostOnly
    ? TARGET_TAGS.filter((tag) => tag === `${process.platform}-${process.arch}`)
    : TARGET_TAGS;
  if (!required.length) throw new Error(`host ${process.platform}-${process.arch} is unsupported`);
  if (!Array.isArray(manifest.targets)) throw new Error("manifest.targets must be an array");
  const manifestTags = manifest.targets.map((entry) => entry?.package_tag);
  if (new Set(manifestTags).size !== manifestTags.length) throw new Error("manifest.targets contains duplicate package_tag values");
  if (!args.hostOnly && manifestTags.slice().sort().join(",") !== TARGET_TAGS.slice().sort().join(",")) {
    throw new Error(`manifest must enumerate exactly: ${TARGET_TAGS.join(", ")}`);
  }

  const missing = [];
  for (const tag of required) {
    const expected = targetFor(tag);
    const entry = manifest.targets.find((candidate) => candidate?.package_tag === tag);
    if (!entry) {
      missing.push(`${tag}: missing manifest entry`);
      continue;
    }
    if (entry.artifact !== "cortext.node") throw new Error(`${tag} artifact must be cortext.node`);
    if (entry.core_tag !== manifest.core_tag || entry.core_commit !== manifest.core_commit) {
      throw new Error(`${tag} target provenance differs from manifest core provenance`);
    }
    if (entry.native_target !== expected.nativeTarget || entry.toolchain !== expected.toolchain || entry.abi !== expected.abi) {
      throw new Error(`${tag} has unexpected native target/toolchain metadata`);
    }
    if (!Number.isInteger(entry.size) || entry.size < MIN_ADDON_BYTES) throw new Error(`${tag} has invalid size`);
    assertSha(entry.sha256, `${tag}.sha256`);
    const file = path.join(prebuilds, tag, "cortext.node");
    if (!fs.existsSync(file) || fs.statSync(file).size < MIN_ADDON_BYTES) {
      missing.push(`${tag}: ${file}`);
      continue;
    }
    const size = fs.statSync(file).size;
    if (size !== entry.size) throw new Error(`${tag} size ${size} differs from manifest ${entry.size}`);
    const digest = sha256(file);
    if (digest !== entry.sha256) throw new Error(`${tag} SHA-256 differs from manifest`);
  }
  if (missing.length) throw new Error(`missing prebuilds:\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  console.log(`prebuilds ok (${required.length} target${required.length === 1 ? "" : "s"}); core ${manifest.core_tag}@${manifest.core_commit}`);
}

try {
  main();
} catch (error) {
  console.error(`check-prebuilds failed: ${error.message}`);
  process.exitCode = 1;
}
