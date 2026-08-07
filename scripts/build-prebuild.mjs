#!/usr/bin/env node
/**
 * Build one N-API addon from an exact augmem/cortext.cpp tag.
 *
 * This package owns the orchestration, but never copies the C++/N-API source.
 * The source checkout is temporary by default and only the resulting addon and
 * a small provenance sidecar are emitted under --output.
 *
 * Examples:
 *   node scripts/build-prebuild.mjs --core-tag v1.3.1 --target linux-x64
 *   CORTEXT_CORE_TAG=v1.3.1 npm run build:prebuild -- --target darwin-arm64
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  BUILD_METADATA_SCHEMA,
  NAPI_VERSION,
  REQUIRED_SYMBOLS,
  assertCommit,
  assertGitTag,
  assertNativeArtifact,
  hostTarget,
  sha256,
  targetFor,
  writeJson,
} from "./prebuilds-common.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_REPOSITORY = "https://github.com/augmem/cortext.cpp.git";

function parseArgs(argv) {
  const args = {
    coreTag: process.env.CORTEXT_CORE_TAG ?? "",
    coreCommit: process.env.CORTEXT_CORE_COMMIT ?? null,
    coreDir: process.env.CORTEXT_CORE_DIR ?? null,
    repository: process.env.CORTEXT_CORE_REPOSITORY ?? DEFAULT_REPOSITORY,
    target: process.env.CORTEXT_TARGET ?? null,
    output: path.join(root, "prebuilds"),
    workDir: null,
    cmake: process.env.CMAKE ?? "cmake",
    node: process.execPath,
    nodeInclude: process.env.CORTEXT_NODE_INCLUDE_DIR ?? null,
    nodeLibrary: process.env.CORTEXT_NODE_LIBRARY ?? null,
    jobs: process.env.CMAKE_BUILD_PARALLEL_LEVEL ?? null,
    keepCore: false,
    configureOnly: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${arg}`);
      i += 1;
      return argv[i];
    };
    if (arg === "--core-tag") args.coreTag = next();
    else if (arg === "--core-commit") args.coreCommit = next();
    else if (arg === "--core-dir") args.coreDir = next();
    else if (arg === "--repository") args.repository = next();
    else if (arg === "--target") args.target = next();
    else if (arg === "--output") args.output = path.resolve(next());
    else if (arg === "--work-dir") args.workDir = path.resolve(next());
    else if (arg === "--cmake") args.cmake = next();
    else if (arg === "--node") args.node = path.resolve(next());
    else if (arg === "--node-include") args.nodeInclude = path.resolve(next());
    else if (arg === "--node-library") args.nodeLibrary = path.resolve(next());
    else if (arg === "--jobs") args.jobs = next();
    else if (arg === "--keep-core") args.keepCore = true;
    else if (arg === "--configure-only") args.configureOnly = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: build-prebuild.mjs --core-tag <tag> --target <platform-arch> [options]

Downloads/checks out augmem/cortext.cpp at <tag>, configures CMake with
CORTEXT_BUILD_NODE_BINDINGS=ON, and writes <output>/<target>/cortext.node.

Options: --core-dir <checkout> --repository <url> --core-commit <sha>
         --output <dir> --work-dir <dir> --cmake <path> --node <path>
         --node-include <dir> --node-library <file> --jobs <n>
         --keep-core --configure-only`);
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function run(command, args, cwd) {
  console.log(`+ ${command} ${args.join(" ")}`);
  return execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    encoding: "utf8",
  });
}

function capture(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
}

function git(cwd, args) {
  return capture("git", args, cwd);
}

function assertCoreSource(coreDir) {
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
  const cmakeText = fs.readFileSync(cmake, "utf8");
  if (!cmakeText.includes("CORTEXT_BUILD_NODE_BINDINGS")) {
    throw new Error("core CMakeLists.txt has no CORTEXT_BUILD_NODE_BINDINGS option");
  }
  return addon;
}

function exactTag(coreDir, expectedTag) {
  let actual;
  try {
    actual = git(coreDir, ["describe", "--tags", "--exact-match", "HEAD"]);
  } catch (error) {
    throw new Error(`core checkout is not at an exact git tag (expected ${expectedTag})`);
  }
  if (actual !== expectedTag) {
    throw new Error(`core checkout tag ${actual} does not match requested ${expectedTag}`);
  }
  const commit = git(coreDir, ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error(`unable to resolve core commit for ${expectedTag}`);
  }
  return commit;
}

function checkedCoreCommit(commit, expected) {
  if (expected) {
    assertCommit(expected, "expected core commit");
    if (commit !== expected) throw new Error(`core tag resolves to ${commit}, expected ${expected}`);
  }
  return commit;
}

function prepareCore(args, temporaryPaths) {
  if (args.coreDir) {
    const coreDir = path.resolve(args.coreDir);
    if (!fs.existsSync(path.join(coreDir, ".git"))) {
      throw new Error(`--core-dir is not a git checkout: ${coreDir}`);
    }
    // A supplied checkout is deliberately never silently retargeted. This
    // prevents building a follow-up wrapper against an unrelated local branch.
    const commit = exactTag(coreDir, args.coreTag);
    return { coreDir, commit: checkedCoreCommit(commit, args.coreCommit) };
  }

  const checkout = args.workDir
    ? path.resolve(args.workDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), "cortext-core-"));
  fs.mkdirSync(path.dirname(checkout), { recursive: true });
  if (fs.existsSync(checkout)) {
    const entries = fs.readdirSync(checkout);
    if (entries.length) throw new Error(`work directory is not empty: ${checkout}`);
  }
  temporaryPaths.push(checkout);
  run("git", ["clone", "--filter=blob:none", "--no-checkout", args.repository, checkout], root);
  run("git", ["fetch", "--depth=1", "origin", `refs/tags/${args.coreTag}:refs/tags/${args.coreTag}`], checkout);
  run("git", ["checkout", "--detach", `refs/tags/${args.coreTag}`], checkout);
  return { coreDir: checkout, commit: checkedCoreCommit(exactTag(checkout, args.coreTag), args.coreCommit) };
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function findWindowsTool(name, targetArch) {
  if (process.platform !== "win32") return null;
  const found = commandOutput("where.exe", [name]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = [...found];
  const roots = [process.env.VCToolsInstallDir, process.env.VCINSTALLDIR]
    .filter(Boolean)
    .map((dir) => path.resolve(dir));
  const arch = targetArch === "arm64" ? "ARM64" : "x64";
  for (const base of roots) {
    candidates.push(path.join(base, "bin", "Hostx64", arch, name));
    candidates.push(path.join(base, "bin", "Hostx64", arch.toLowerCase(), name));
  }
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  candidates.push(path.join(programFiles, "LLVM", "bin", name));
  const vswhere = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (fs.existsSync(vswhere)) {
    candidates.push(...commandOutput(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-find", `**\\${name}`]).split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  }
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function prepareWindowsNodeLibrary(args, target, temporaryPaths) {
  if (process.platform !== "win32") return null;
  if (args.nodeLibrary) {
    if (!fs.existsSync(args.nodeLibrary)) throw new Error(`--node-library not found: ${args.nodeLibrary}`);
    return args.nodeLibrary;
  }
  const bundled = path.join(path.dirname(args.node), "node.lib");
  if (fs.existsSync(bundled)) return bundled;
  const definition = path.join(root, "node_modules", "node-api-headers", "def", "node_api.def");
  if (!fs.existsSync(definition)) {
    throw new Error(`Windows Node import library is missing and node-api-headers definition was not found: ${definition}`);
  }
  const libExe = findWindowsTool("lib.exe", target.endsWith("arm64") ? "arm64" : "x64");
  if (!libExe) throw new Error("Windows Node import library is missing; Visual Studio lib.exe was not found to generate node.lib from node_api.def");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cortext-node-lib-"));
  temporaryPaths.push(directory);
  const output = path.join(directory, "node.lib");
  const machine = target.endsWith("arm64") ? "ARM64" : "X64";
  run(libExe, [`/DEF:${definition}`, `/OUT:${output}`, `/MACHINE:${machine}`], root);
  if (!fs.existsSync(output)) throw new Error(`lib.exe did not produce ${output}`);
  return output;
}

function findWindowsClang(target) {
  if (process.platform !== "win32" || !target.endsWith("arm64")) return null;
  const clang = findWindowsTool("clang-cl.exe", "arm64");
  if (!clang) throw new Error("Windows ARM64 builds require clang-cl; install LLVM before running the native ARM64 matrix job");
  return clang;
}

function findAddon(buildDir) {
  const expected = path.join(buildDir, "ffi", "node", "cortext.node");
  if (fs.existsSync(expected)) return expected;
  const matches = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const item = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(item);
      else if (entry.isFile() && entry.name === "cortext.node") matches.push(item);
    }
  }
  if (fs.existsSync(buildDir)) walk(buildDir);
  if (matches.length !== 1) {
    throw new Error(`expected one CMake ffi/node/cortext.node under ${buildDir}; found ${matches.length}`);
  }
  return matches[0];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const coreTag = assertGitTag(args.coreTag, "core tag");
  if (args.coreCommit) assertCommit(args.coreCommit, "--core-commit");
  const target = args.target ?? hostTarget();
  targetFor(target);
  if (target !== hostTarget()) {
    throw new Error(`target ${target} must match the build runner ${hostTarget()}; use the six-host matrix for cross-platform builds`);
  }

  const temporaryPaths = [];
  let core;
  try {
    core = prepareCore(args, temporaryPaths);
    assertCoreSource(core.coreDir);
    const buildDir = args.workDir
      ? path.join(path.resolve(args.workDir), "build")
      : fs.mkdtempSync(path.join(os.tmpdir(), "cortext-node-build-"));
    temporaryPaths.push(buildDir);
    fs.rmSync(buildDir, { recursive: true, force: true });
    fs.mkdirSync(buildDir, { recursive: true });

    const nodeHeaders = args.nodeInclude ?? path.join(root, "node_modules", "node-api-headers", "include");
    const nodeLibrary = prepareWindowsNodeLibrary(args, target, temporaryPaths);
    const clangCl = findWindowsClang(target);
    const configureArgs = [
      "-S", core.coreDir,
      "-B", buildDir,
      "-DCMAKE_BUILD_TYPE=Release",
      "-DBUILD_TESTING=OFF",
      "-DBUILD_SHARED_LIBS=OFF",
      "-DCMAKE_POSITION_INDEPENDENT_CODE=ON",
      "-DCORTEXT_BUILD_NODE_BINDINGS=ON",
      "-DCORTEXT_BUILD_EXAMPLES=OFF",
      "-DCORTEXT_BUILD_TOOLS=OFF",
      "-DCORTEXT_NODE_EXECUTABLE=" + args.node,
    ];
    if (fs.existsSync(path.join(nodeHeaders, "node_api.h"))) {
      configureArgs.push("-DCORTEXT_NODE_INCLUDE_DIR=" + nodeHeaders);
    }
    if (nodeLibrary && fs.existsSync(nodeLibrary)) {
      configureArgs.push("-DCORTEXT_NODE_LIBRARY=" + nodeLibrary);
    }
    if (clangCl) {
      configureArgs.push("-DCMAKE_C_COMPILER=" + clangCl, "-DCMAKE_CXX_COMPILER=" + clangCl);
    }
    if (process.platform === "linux" && process.arch === "arm64") {
      configureArgs.push("-DCMAKE_CXX_FLAGS=-Wno-error=class-memaccess");
    }
    run(args.cmake, configureArgs, root);
    if (!args.configureOnly) {
      const buildArgs = ["--build", buildDir, "--target", "cortext_node", "--config", "Release"];
      if (args.jobs) buildArgs.push("--parallel", String(args.jobs));
      run(args.cmake, buildArgs, root);

      const addon = findAddon(buildDir);
      const size = fs.statSync(addon).size;
      if (size < 1024) throw new Error(`CMake produced an implausibly small addon: ${addon}`);
      assertNativeArtifact(addon, target);
      const destination = path.join(args.output, target);
      fs.rmSync(destination, { recursive: true, force: true });
      fs.mkdirSync(destination, { recursive: true });
      const outputAddon = path.join(destination, "cortext.node");
      fs.copyFileSync(addon, outputAddon);
      if (process.platform !== "win32") fs.chmodSync(outputAddon, 0o755);
      const targetConfig = targetFor(target);
      writeJson(path.join(destination, "build-metadata.json"), {
        schema: BUILD_METADATA_SCHEMA,
        package_tag: target,
        native_target: targetConfig.nativeTarget,
        toolchain: targetConfig.toolchain,
        abi: targetConfig.abi,
        core_tag: coreTag,
        core_commit: core.commit,
        napi: NAPI_VERSION,
        symbols: REQUIRED_SYMBOLS,
        artifact: "cortext.node",
        size: fs.statSync(outputAddon).size,
        sha256: sha256(outputAddon),
      });
      console.log(`built ${target} from ${coreTag}@${core.commit}: ${outputAddon}`);
    }
  } finally {
    if (!args.keepCore) {
      for (const item of temporaryPaths.reverse()) {
        if (args.workDir && item === path.resolve(args.workDir)) continue;
        fs.rmSync(item, { recursive: true, force: true });
      }
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`build-prebuild failed: ${error.message}`);
  process.exitCode = 1;
}
