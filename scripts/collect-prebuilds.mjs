#!/usr/bin/env node
/**
 * Collect the six matrix outputs and write a provenance-bearing manifest.
 * Only cortext.node files are copied; the C++/N-API source remains owned by
 * augmem/cortext.cpp and is never vendored into this repository.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BUILD_METADATA_SCHEMA,
  MIN_ADDON_BYTES,
  NAPI_VERSION,
  PREBUILD_SCHEMA,
  REQUIRED_SYMBOLS,
  TARGETS,
  TARGET_TAGS,
  assertCommit,
  assertCoreTag,
  assertSymbols,
  readJson,
  sha256,
  targetFor,
  writeJson,
} from "./prebuilds-common.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    input: null,
    output: path.join(root, "prebuilds"),
    coreTag: process.env.CORTEXT_CORE_TAG ?? "",
    coreCommit: process.env.CORTEXT_CORE_COMMIT ?? null,
    force: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === "--input") args.input = path.resolve(next());
    else if (arg === "--output") args.output = path.resolve(next());
    else if (arg === "--core-tag") args.coreTag = next();
    else if (arg === "--core-commit") args.coreCommit = next();
    else if (arg === "--force") args.force = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: collect-prebuilds.mjs --input <matrix-artifacts> --core-tag <tag> [options]

The input tree may contain one directory per target, each with cortext.node and
build-metadata.json as emitted by build-prebuild.mjs. The output is a complete
prebuilds/ tree and manifest; all six targets and one matching core commit are
required.

Options: --output <dir> --core-commit <sha> --force`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.input) throw new Error("--input is required");
  return args;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(item));
    else if (entry.isFile()) found.push(item);
  }
  return found;
}

function findArtifact(input, target) {
  const matches = walk(input).filter((file) =>
    path.basename(file) === "cortext.node" &&
    path.basename(path.dirname(file)) === target
  );
  if (matches.length !== 1) {
    throw new Error(`expected one ${target}/cortext.node under ${input}; found ${matches.length}`);
  }
  const metadata = path.join(path.dirname(matches[0]), "build-metadata.json");
  if (!fs.existsSync(metadata)) {
    throw new Error(`${target} is missing build-metadata.json provenance sidecar`);
  }
  return { artifact: matches[0], metadata };
}

function validateMetadata(metadataPath, artifactPath, expectedTag, expectedCommit, target) {
  const metadata = readJson(metadataPath, `${target} build metadata`);
  if (metadata.schema !== BUILD_METADATA_SCHEMA) {
    throw new Error(`${target} metadata schema must be ${BUILD_METADATA_SCHEMA}`);
  }
  if (metadata.package_tag !== target) {
    throw new Error(`${target} metadata package_tag is ${metadata.package_tag}`);
  }
  if (metadata.core_tag !== expectedTag) {
    throw new Error(`${target} was built from ${metadata.core_tag}, expected ${expectedTag}`);
  }
  assertCommit(metadata.core_commit, `${target}.core_commit`);
  if (expectedCommit && metadata.core_commit !== expectedCommit) {
    throw new Error(`${target} core commit ${metadata.core_commit} differs from ${expectedCommit}`);
  }
  if (metadata.napi !== NAPI_VERSION) {
    throw new Error(`${target} uses N-API ${metadata.napi}; expected ${NAPI_VERSION}`);
  }
  assertSymbols(metadata.symbols, `${target}.symbols`);
  const size = fs.statSync(artifactPath).size;
  if (size < MIN_ADDON_BYTES) throw new Error(`${target} addon is too small (${size} bytes)`);
  const digest = sha256(artifactPath);
  if (metadata.size !== size || metadata.sha256 !== digest) {
    throw new Error(`${target} metadata does not match ${artifactPath}`);
  }
  return { metadata, size, sha256: digest };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const coreTag = assertCoreTag(args.coreTag);
  if (!fs.existsSync(args.input)) throw new Error(`input directory not found: ${args.input}`);
  if (args.coreCommit) assertCommit(args.coreCommit, "--core-commit");

  const entries = [];
  let coreCommit = args.coreCommit;
  for (const { packageTag, zigTarget } of TARGETS) {
    const { artifact, metadata } = findArtifact(args.input, packageTag);
    const checked = validateMetadata(metadata, artifact, coreTag, coreCommit, packageTag);
    coreCommit ??= checked.metadata.core_commit;
    entries.push({
      package_tag: packageTag,
      zig_target: zigTarget,
      artifact: "cortext.node",
      size: checked.size,
      sha256: checked.sha256,
      core_tag: coreTag,
      core_commit: coreCommit,
    });
  }
  assertCommit(coreCommit, "core_commit");

  fs.mkdirSync(args.output, { recursive: true });
  for (const tag of TARGET_TAGS) {
    const destination = path.join(args.output, tag);
    if (fs.existsSync(destination) && !args.force) {
      throw new Error(`output target exists: ${destination}; pass --force to replace it`);
    }
    fs.rmSync(destination, { recursive: true, force: true });
  }
  for (const entry of entries) {
    const source = findArtifact(args.input, entry.package_tag).artifact;
    const destination = path.join(args.output, entry.package_tag, entry.artifact);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    if (process.platform !== "win32") fs.chmodSync(destination, 0o755);
  }

  writeJson(path.join(args.output, "manifest.json"), {
    schema: PREBUILD_SCHEMA,
    core_repository: "https://github.com/augmem/cortext.cpp",
    core_tag: coreTag,
    core_commit: coreCommit,
    napi: NAPI_VERSION,
    optimize: "Release",
    symbols: REQUIRED_SYMBOLS,
    targets: entries,
  });
  console.log(`collected ${entries.length} prebuilds from ${coreTag}@${coreCommit} into ${args.output}`);
}

try {
  main();
} catch (error) {
  console.error(`collect-prebuilds failed: ${error.message}`);
  process.exitCode = 1;
}
