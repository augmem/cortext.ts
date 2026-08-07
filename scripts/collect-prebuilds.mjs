#!/usr/bin/env node
/**
 * Collect the six matrix outputs and write a provenance-bearing manifest.
 * Only cortext.node files are copied; the C++/N-API source remains owned by
 * augmem/cortext.cpp and is never vendored into this repository.
 *
 * Provenance is resolved independently here from an exact core checkout. The
 * matrix sidecar is used only for artifact identity/hash checks; its commit and
 * symbol claims are never trusted.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BUILD_METADATA_SCHEMA,
  BUILD_SYSTEM,
  MIN_ADDON_BYTES,
  NAPI_VERSION,
  PREBUILD_SCHEMA,
  REQUIRED_SYMBOLS,
  TARGETS,
  TARGET_TAGS,
  assertCommit,
  assertGitTag,
  assertNativeArtifact,
  readJson,
  sha256,
  writeJson,
} from "./prebuilds-common.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPOSITORY = "https://github.com/augmem/cortext.cpp.git";

function parseArgs(argv) {
  const args = {
    input: null,
    output: path.join(root, "prebuilds"),
    coreTag: process.env.CORTEXT_CORE_TAG ?? "",
    coreDir: process.env.CORTEXT_CORE_DIR ?? null,
    coreRepository: process.env.CORTEXT_CORE_REPOSITORY ?? DEFAULT_REPOSITORY,
    expectedCoreCommit: process.env.CORTEXT_CORE_COMMIT ?? null,
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
    else if (arg === "--core-dir") args.coreDir = path.resolve(next());
    else if (arg === "--core-repository") args.coreRepository = next();
    else if (arg === "--expected-core-commit") args.expectedCoreCommit = next();
    else if (arg === "--force") args.force = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: collect-prebuilds.mjs --input <matrix-artifacts> --core-tag <tag> [options]

The input tree may contain one directory per target, each with cortext.node and
build-metadata.json as emitted by build-prebuild.mjs. Core provenance is
resolved from --core-dir (or a temporary clone of --core-repository), checked
out at the exact --core-tag, and independently inspected for Node symbols.

Options: --core-dir <checkout> --core-repository <url>
         --expected-core-commit <sha> --output <dir> --force`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!args.input) throw new Error("--input is required");
  return args;
}

function run(command, args, cwd) {
  console.log(`+ ${command} ${args.join(" ")}`);
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
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

function validateCoreCheckout(coreDir, expectedTag, expectedCommit) {
  if (!fs.existsSync(path.join(coreDir, ".git"))) {
    throw new Error(`core checkout is not a git repository: ${coreDir}`);
  }
  let actualTag;
  try {
    actualTag = capture("git", ["describe", "--tags", "--exact-match", "HEAD"], coreDir);
  } catch {
    throw new Error(`core checkout is not at an exact tag (expected ${expectedTag})`);
  }
  if (actualTag !== expectedTag) {
    throw new Error(`core checkout tag ${actualTag} does not match requested ${expectedTag}`);
  }
  const commit = capture("git", ["rev-parse", "HEAD"], coreDir);
  assertCommit(commit, "resolved core commit");
  if (expectedCommit && commit !== expectedCommit) {
    throw new Error(`resolved core commit ${commit} does not match expected ${expectedCommit}`);
  }

  const addon = path.join(coreDir, "ffi", "node", "addon.cpp");
  const cmake = path.join(coreDir, "CMakeLists.txt");
  if (!fs.existsSync(addon) || !fs.existsSync(cmake)) {
    throw new Error(`core checkout is missing ffi/node/addon.cpp or CMakeLists.txt: ${coreDir}`);
  }
  const source = fs.readFileSync(addon, "utf8");
  const missing = REQUIRED_SYMBOLS.filter((symbol) => !source.includes(symbol));
  if (missing.length) {
    throw new Error(`core tag does not expose required Node symbols: ${missing.join(", ")}`);
  }
  if (!fs.readFileSync(cmake, "utf8").includes("CORTEXT_BUILD_NODE_BINDINGS")) {
    throw new Error("core CMakeLists.txt has no CORTEXT_BUILD_NODE_BINDINGS option");
  }
  let repository = DEFAULT_REPOSITORY.replace(/\.git$/, "");
  try {
    repository = capture("git", ["remote", "get-url", "origin"], coreDir).replace(/\.git$/, "");
  } catch {
    // A local fixture or exported checkout may have no remote; the official
    // repository remains the only supported provenance namespace.
  }
  return { commit, repository, symbols: REQUIRED_SYMBOLS };
}

function prepareCore(args) {
  if (args.expectedCoreCommit) assertCommit(args.expectedCoreCommit, "--expected-core-commit");
  if (args.coreDir) {
    return {
      dir: path.resolve(args.coreDir),
      cleanup: () => {},
    };
  }
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), "cortext-core-collect-"));
  run("git", ["clone", "--filter=blob:none", "--no-checkout", args.coreRepository, checkout], root);
  run("git", ["fetch", "--depth=1", "origin", `refs/tags/${args.coreTag}:refs/tags/${args.coreTag}`], checkout);
  run("git", ["checkout", "--detach", `refs/tags/${args.coreTag}`], checkout);
  return { dir: checkout, cleanup: () => fs.rmSync(checkout, { recursive: true, force: true }) };
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
  if (metadata.core_commit !== expectedCommit) {
    throw new Error(`${target} sidecar core commit ${metadata.core_commit} differs from expected ${expectedCommit}`);
  }
  if (metadata.napi !== NAPI_VERSION) {
    throw new Error(`${target} uses N-API ${metadata.napi}; expected ${NAPI_VERSION}`);
  }
  const size = fs.statSync(artifactPath).size;
  if (size < MIN_ADDON_BYTES) throw new Error(`${target} addon is too small (${size} bytes)`);
  assertNativeArtifact(artifactPath, target);
  const digest = sha256(artifactPath);
  if (metadata.size !== size || metadata.sha256 !== digest) {
    throw new Error(`${target} metadata does not match ${artifactPath}`);
  }
  return { size, sha256: digest };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const coreTag = assertGitTag(args.coreTag, "core tag");
  if (!fs.existsSync(args.input)) throw new Error(`input directory not found: ${args.input}`);

  const core = prepareCore(args);
  try {
    const resolved = validateCoreCheckout(core.dir, coreTag, args.expectedCoreCommit);
    const entries = [];
    for (const target of TARGETS) {
      const { artifact, metadata } = findArtifact(args.input, target.packageTag);
      const checked = validateMetadata(metadata, artifact, coreTag, resolved.commit, target.packageTag);
      entries.push({
        package_tag: target.packageTag,
        native_target: target.nativeTarget,
        toolchain: target.toolchain,
        abi: target.abi,
        features: target.features,
        artifact: "cortext.node",
        size: checked.size,
        sha256: checked.sha256,
        core_tag: coreTag,
        core_commit: resolved.commit,
      });
    }

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
      core_repository: resolved.repository,
      core_tag: coreTag,
      core_commit: resolved.commit,
      napi: NAPI_VERSION,
      optimize: "Release",
      build_system: BUILD_SYSTEM,
      symbols: resolved.symbols,
      targets: entries,
    });
    console.log(`collected ${entries.length} prebuilds from ${coreTag}@${resolved.commit} into ${args.output}`);
  } finally {
    core.cleanup();
  }
}

try {
  main();
} catch (error) {
  console.error(`collect-prebuilds failed: ${error.message}`);
  process.exitCode = 1;
}
