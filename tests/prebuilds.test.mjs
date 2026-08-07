import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  ["darwin-arm64", "aarch64-macos"],
  ["darwin-x64", "x86_64-macos"],
  ["linux-arm64", "aarch64-linux-gnu.2.17"],
  ["linux-x64", "x86_64-linux-gnu.2.17"],
  ["win32-arm64", "aarch64-windows-gnu"],
  ["win32-x64", "x86_64-windows-gnu"],
];

function run(command, args) {
  return spawnSync(process.execPath, [command, ...args], {
    encoding: "utf8",
    cwd: root,
  });
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cortext-prebuild-test-"));
  const input = path.join(directory, "input");
  const output = path.join(directory, "output", "prebuilds");
  const coreTag = "v9.9.9-node-text-media";
  const coreCommit = "a".repeat(40);
  for (const [tag] of targets) {
    const dir = path.join(input, `artifact-${tag}`, tag);
    fs.mkdirSync(dir, { recursive: true });
    const bytes = crypto.createHash("sha256").update(tag).digest();
    const addon = Buffer.alloc(4096);
    for (let i = 0; i < addon.length; i += 1) addon[i] = bytes[i % bytes.length];
    const file = path.join(dir, "cortext.node");
    fs.writeFileSync(file, addon);
    fs.writeFileSync(path.join(dir, "build-metadata.json"), `${JSON.stringify({
      schema: "augmem.cortext.node.build.v1",
      package_tag: tag,
      core_tag: coreTag,
      core_commit: coreCommit,
      napi: 8,
      symbols,
      artifact: "cortext.node",
      size: addon.length,
      sha256: crypto.createHash("sha256").update(addon).digest("hex"),
    })}\n`);
  }
  return { directory, input, output, coreTag, coreCommit };
}

test("collector writes a complete core-tag and symbol manifest", () => {
  const paths = fixture();
  try {
    const collected = run(collectScript, [
      "--input", paths.input,
      "--output", paths.output,
      "--core-tag", paths.coreTag,
      "--force",
    ]);
    assert.equal(collected.status, 0, collected.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(paths.output, "manifest.json"), "utf8"));
    assert.equal(manifest.core_tag, paths.coreTag);
    assert.equal(manifest.core_commit, paths.coreCommit);
    assert.deepEqual(manifest.symbols, symbols);
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
    const metadata = path.join(paths.input, "artifact-linux-x64", "linux-x64", "build-metadata.json");
    const value = JSON.parse(fs.readFileSync(metadata, "utf8"));
    value.core_tag = "v-old";
    fs.writeFileSync(metadata, JSON.stringify(value));
    const result = run(collectScript, [
      "--input", paths.input,
      "--output", paths.output,
      "--core-tag", paths.coreTag,
      "--force",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /built from v-old/);
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
});
test("CI gates strict provenance checks for v2 manifests", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  assert.match(workflow, /schema=.*prebuilds\/manifest\.json/);
  assert.match(workflow, /augmem\.cortext\.node\.prebuilds\.v2/);
  assert.match(workflow, /Legacy prebuild manifest/);
  assert.match(workflow, /node scripts\/check-prebuilds\.mjs --host-only/);
});
