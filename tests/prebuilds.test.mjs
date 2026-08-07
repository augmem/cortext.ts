import crypto from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const collectScript = path.join(root, "scripts", "collect-prebuilds.mjs");
const checkScript = path.join(root, "scripts", "check-prebuilds.mjs");
const symbols = [
  "NativeCortext",
  "processTextJson",
  "processTextWithMediaJson",
  "processAudioJson",
  "processAudioWithMediaJson",
  "processImageJson",
  "processImageWithMediaJson",
  "embedTextJson",
  "embedAudioJson",
  "embedImageJson",
  "consolidateJson",
  "flush",
  "reset",
  "version",
  "lastError",
];
const targets = [
  ["darwin-arm64", "aarch64-apple-darwin"],
  ["darwin-x64", "x86_64-apple-darwin"],
  ["linux-arm64", "aarch64-linux-gnu"],
  ["linux-x64", "x86_64-linux-gnu"],
  ["win32-arm64", "aarch64-windows-msvc"],
  ["win32-x64", "x86_64-windows-msvc"],
];

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

function fixtureAddon(tag) {
  const addon = Buffer.alloc(4096, 0x5a);
  if (tag.startsWith("linux-")) {
    addon.set([0x7f, 0x45, 0x4c, 0x46, 2, 1], 0);
    addon.writeUInt16LE(tag.endsWith("x64") ? 62 : 183, 18);
  } else if (tag.startsWith("darwin-")) {
    addon.set([0xcf, 0xfa, 0xed, 0xfe], 0);
    addon.writeUInt32LE(tag.endsWith("x64") ? 0x01000007 : 0x0100000c, 4);
  } else {
    addon.set([0x4d, 0x5a], 0);
    addon.writeUInt32LE(0x80, 0x3c);
    addon.set([0x50, 0x45, 0x00, 0x00], 0x80);
    addon.writeUInt16LE(tag.endsWith("x64") ? 0x8664 : 0xaa64, 0x84);
  }
  return addon;
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cortext-prebuild-test-"));
  const input = path.join(directory, "input");
  const output = path.join(directory, "output", "prebuilds");
  const coreTag = "v9.9.9-node-text-media";
  const coreDir = path.join(directory, "core");
  fs.mkdirSync(path.join(coreDir, "ffi", "node"), { recursive: true });
  fs.writeFileSync(path.join(coreDir, "ffi", "node", "addon.cpp"), symbols.join("\n"));
  fs.writeFileSync(path.join(coreDir, "CMakeLists.txt"), "CORTEXT_BUILD_NODE_BINDINGS");
  execFileSync("git", ["init", "-q"], { cwd: coreDir });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: coreDir });
  execFileSync("git", ["config", "user.name", "Pipeline Test"], { cwd: coreDir });
  execFileSync("git", ["add", "."], { cwd: coreDir });
  execFileSync("git", ["commit", "-qm", "core fixture"], { cwd: coreDir });
  execFileSync("git", ["tag", coreTag], { cwd: coreDir });
  const coreCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: coreDir, encoding: "utf8" }).trim();
  for (const [tag] of targets) {
    // Mirrors actions/download-artifact merge-multiple:false: each artifact
    // directory contains the target directory rather than flattening it.
    const dir = path.join(input, `prebuild-${tag}`, tag);
    fs.mkdirSync(dir, { recursive: true });
    const addon = fixtureAddon(tag);
    const file = path.join(dir, "cortext.node");
    fs.writeFileSync(file, addon);
    fs.writeFileSync(path.join(dir, "build-metadata.json"), `${JSON.stringify({
      schema: "augmem.cortext.node.build.v1",
      package_tag: tag,
      native_target: targets.find(([name]) => name === tag)[1],
      toolchain: "forged sidecar value",
      abi: "forged sidecar value",
      core_tag: coreTag,
      core_commit: coreCommit,
      napi: 8,
      symbols: ["forged sidecar symbols"],
      artifact: "cortext.node",
      size: addon.length,
      sha256: crypto.createHash("sha256").update(addon).digest("hex"),
    })}\n`);
  }
  return { directory, input, output, coreTag, coreDir, coreCommit };
}

test("collector writes a complete core-tag and symbol manifest", () => {
  const paths = fixture();
  try {
    const collected = run(collectScript, [
      "--input", paths.input,
      "--output", paths.output,
      "--core-tag", paths.coreTag,
      "--core-dir", paths.coreDir,
      "--force",
    ]);
    assert.equal(collected.status, 0, collected.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(paths.output, "manifest.json"), "utf8"));
    assert.equal(manifest.core_tag, paths.coreTag);
    assert.equal(manifest.core_commit, paths.coreCommit);
    assert.equal(manifest.build_system, "cmake-native");
    assert.doesNotMatch(JSON.stringify(manifest), /zig_target|gnu\.2\.17/);
    assert.deepEqual(manifest.symbols, symbols);
    assert.equal(manifest.targets[0].toolchain.includes("CMake native"), true);
    assert.deepEqual(manifest.targets.find((entry) => entry.package_tag === "linux-arm64").features, { ggml_openmp: false, embed_vec: true });
    assert.deepEqual(manifest.targets.find((entry) => entry.package_tag === "linux-x64").features, { ggml_openmp: false, embed_vec: true });
    assert.deepEqual(manifest.targets.map((entry) => entry.package_tag).sort(), targets.map(([tag]) => tag).sort());

    const checked = run(checkScript, [
      "--root", path.join(paths.directory, "output"),
      "--core-tag", paths.coreTag,
      "--core-commit", paths.coreCommit,
    ]);
    assert.equal(checked.status, 0, checked.stderr);
  } finally {
    fs.rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("collector rejects a matrix artifact from a different core tag", () => {
  const paths = fixture();
  try {
    const metadata = path.join(paths.input, "prebuild-linux-x64", "linux-x64", "build-metadata.json");
    const value = JSON.parse(fs.readFileSync(metadata, "utf8"));
    value.core_tag = "v-old";
    fs.writeFileSync(metadata, JSON.stringify(value));
    const result = run(collectScript, [
      "--input", paths.input,
      "--output", paths.output,
      "--core-tag", paths.coreTag,
      "--core-dir", paths.coreDir,
      "--force",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /built from v-old/);
  } finally {
    fs.rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("collector rejects a sidecar core commit that differs from independently resolved core", () => {
  const paths = fixture();
  try {
    const metadata = path.join(paths.input, "prebuild-linux-x64", "linux-x64", "build-metadata.json");
    const value = JSON.parse(fs.readFileSync(metadata, "utf8"));
    value.core_commit = "b".repeat(40);
    fs.writeFileSync(metadata, JSON.stringify(value));
    const result = run(collectScript, [
      "--input", paths.input,
      "--output", paths.output,
      "--core-tag", paths.coreTag,
      "--core-dir", paths.coreDir,
      "--expected-core-commit", paths.coreCommit,
      "--force",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /sidecar core commit/);
  } finally {
    fs.rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("build script keeps CMake and core checkout ownership explicit", () => {
  const script = fs.readFileSync(path.join(root, "scripts", "build-prebuild.mjs"), "utf8");
  assert.match(script, /CORTEXT_BUILD_NODE_BINDINGS=ON/);
  assert.match(script, /refs\/tags/);
  assert.match(script, /addon\.cpp/);
  assert.match(script, /build-metadata\.json/);
  assert.match(script, /expected core commit/);
  assert.match(script, /node-api-headers/);
  assert.match(script, /CORTEXT_NODE_LIBRARY/);
  assert.match(script, /node_api\.def/);
  assert.match(script, /lib\.exe/);
  assert.match(script, /clang-cl/);
  assert.match(script, /CORTEXT_ALLOW_CLANGCL_ARM=ON/);
  assert.match(script, /class-memaccess/);
  assert.match(script, /CORTEXT_GGML_OPENMP=OFF/);
  assert.match(script, /configureArgs\.push\("-DCMAKE_CXX_FLAGS=\/EHsc \/wd4127 \/wd4244 \/wd4456 \/wd4996 \/wd5054"\)/);
  assert.doesNotMatch(script, /CORTEXT_EMBED_VEC=OFF/);
});
test("CI gates strict provenance checks for v2 manifests", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /schema=.*prebuilds\/manifest\.json/);
  assert.match(workflow, /augmem\.cortext\.node\.prebuilds\.v2/);
  assert.match(workflow, /Legacy prebuild manifest/);
  assert.match(workflow, /node scripts\/check-prebuilds\.mjs --host-only/);
});
test("release workflow pins immutable source and uses exact non-clobbering publication", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
  assert.match(workflow, /checkout_sha/);
  assert.match(workflow, /core_commit/);
  assert.match(workflow, /--core-commit/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /Install LLVM for Windows ARM64/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /verify-github-tag\.mjs/);
  assert.match(workflow, /environment: npm-release/);
  assert.match(workflow, /concurrency:[\s\S]*cancel-in-progress: false/);
  assert.match(workflow, /npm publish \"\$TGZ\" --access public --provenance --ignore-scripts/);
  assert.match(workflow, /verify-release-package\.mjs/);
  assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/cortext-prebuild\n/);
  assert.doesNotMatch(workflow, /path: \$\{\{ runner\.temp \}\}\/cortext-prebuild\/\$\{\{ matrix\.target \}\}/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /contents: write/);
});

test("archive fixture preserves target directories for collection", () => {
  const paths = fixture();
  try {
    for (const [tag] of targets) {
      assert.ok(fs.existsSync(path.join(paths.input, `prebuild-${tag}`, tag, "cortext.node")));
    }
    const result = run(collectScript, [
      "--input", paths.input,
      "--output", paths.output,
      "--core-tag", paths.coreTag,
      "--core-dir", paths.coreDir,
      "--force",
    ]);
    assert.equal(result.status, 0, result.stderr);
    for (const [tag] of targets) assert.ok(fs.existsSync(path.join(paths.output, tag, "cortext.node")));
  } finally {
    fs.rmSync(paths.directory, { recursive: true, force: true });
  }
});

test("release resolver rejects a non-semver core tag", () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cortext-resolve-core-test-")), "output");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "resolve-release.mjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_REF_TYPE: "branch", INPUT_TAG: "", INPUT_CORE_TAG: "feature/node-media" },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /package version is not strict semver|core tag/);
  } finally {
    fs.rmSync(path.dirname(output), { recursive: true, force: true });
  }
});

test("release resolver rejects a tag that differs from package.json", () => {
  const output = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "cortext-resolve-test-")), "output");
  try {
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "resolve-release.mjs")], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_REF_TYPE: "branch", INPUT_TAG: "v9.9.9", INPUT_CORE_TAG: "v1.3.3" },
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /must exactly match package\.json version/);
  } finally {
    fs.rmSync(path.dirname(output), { recursive: true, force: true });
  }
});
