#!/usr/bin/env node
/** Shared contract for the TypeScript-owned N-API prebuild pipeline. */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export const TARGETS = [
  {
    packageTag: "darwin-arm64",
    nativeTarget: "aarch64-apple-darwin",
    toolchain: "macos-14 (CMake native)",
    abi: "macOS 14 arm64 runner ABI",
    features: { ggml_openmp: false, embed_vec: true },
  },
  {
    packageTag: "darwin-x64",
    nativeTarget: "x86_64-apple-darwin",
    toolchain: "macos-15-intel (CMake native)",
    abi: "macOS 15 Intel x86_64 runner ABI",
    features: { ggml_openmp: false, embed_vec: true },
  },
  {
    packageTag: "linux-arm64",
    nativeTarget: "aarch64-linux-gnu",
    toolchain: "ubuntu-24.04-arm (CMake native)",
    abi: "glibc >= 2.39; ubuntu-24.04-arm runner ABI",
    features: { ggml_openmp: false, embed_vec: false },
  },
  {
    packageTag: "linux-x64",
    nativeTarget: "x86_64-linux-gnu",
    toolchain: "ubuntu-22.04 (CMake native)",
    abi: "glibc >= 2.35; ubuntu-22.04 runner ABI",
    features: { ggml_openmp: false, embed_vec: true },
  },
  {
    packageTag: "win32-arm64",
    nativeTarget: "aarch64-windows-msvc",
    toolchain: "windows-11-arm (CMake native)",
    abi: "Windows 11 ARM64 runner ABI",
    features: { ggml_openmp: false, embed_vec: true },
  },
  {
    packageTag: "win32-x64",
    nativeTarget: "x86_64-windows-msvc",
    toolchain: "windows-2022 (CMake native)",
    abi: "Windows 2022 x64 runner ABI",
    features: { ggml_openmp: false, embed_vec: true },
  },
];

export const TARGET_TAGS = TARGETS.map(({ packageTag }) => packageTag);
export const PREBUILD_SCHEMA = "augmem.cortext.node.prebuilds.v2";
export const BUILD_METADATA_SCHEMA = "augmem.cortext.node.build.v1";
export const BUILD_SYSTEM = "cmake-native";
export const NAPI_VERSION = 8;
export const MIN_ADDON_BYTES = 1024;

// These are the JS-visible names registered by augmem/cortext.cpp/ffi/node.
// Keep this list in the package repo so a manifest cannot silently describe an
// older addon that predates a wrapper API (notably processTextWithMediaJson).
export const REQUIRED_SYMBOLS = [
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

export function sha256(file) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

export function readJson(file, description = file) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`invalid ${description}: ${error.message}`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must contain a JSON object`);
  }
  return value;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function assertCoreTag(tag) {
  if (typeof tag !== "string" || tag.trim() === "") {
    throw new Error("core tag is required (pass --core-tag or CORTEXT_CORE_TAG)");
  }
  if (/\s/.test(tag) || /^(?:TODO|TBD|REPLACE_WITH_MATCHING_CORE_TAG)$/i.test(tag)) {
    throw new Error(`invalid placeholder core tag: ${tag}`);
  }
  return tag;
}

export function assertGitTag(tag, description = "git tag") {
  assertCoreTag(tag);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(tag) || tag.includes("..") || tag.endsWith("/") || tag.endsWith(".")) {
    throw new Error(`${description} is not a safe git tag: ${tag}`);
  }
  return tag;
}

export function assertReleaseVersion(version) {
  if (typeof version !== "string" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new Error(`package version is not strict semver: ${version}`);
  }
  return version;
}

export function assertVersionTag(tag, description = "version tag") {
  assertGitTag(tag, description);
  if (!tag.startsWith("v")) throw new Error(`${description} must start with v`);
  assertReleaseVersion(tag.slice(1));
  return tag;
}

export function targetFor(tag) {
  const result = TARGETS.find(({ packageTag }) => packageTag === tag);
  if (!result) {
    throw new Error(`unsupported prebuild target ${tag}; expected ${TARGET_TAGS.join(", ")}`);
  }
  return result;
}

export function hostTarget() {
  const tag = `${process.platform}-${process.arch}`;
  targetFor(tag);
  return tag;
}

export function assertSymbols(symbols, description = "symbols") {
  if (!Array.isArray(symbols) || symbols.some((symbol) => typeof symbol !== "string")) {
    throw new Error(`${description} must be an array of strings`);
  }
  const missing = REQUIRED_SYMBOLS.filter((symbol) => !symbols.includes(symbol));
  if (missing.length) {
    throw new Error(`${description} is missing required names: ${missing.join(", ")}`);
  }
}

export function assertSha(value, description) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${description} must be a lowercase SHA-256 digest`);
  }
}

export function assertCommit(value, description = "core_commit") {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) {
    throw new Error(`${description} must be a 40-character commit SHA`);
  }
}


function expectedNativeFormat(packageTag) {
  if (packageTag.startsWith("linux-")) return { format: "ELF", class: 2, machine: packageTag.endsWith("x64") ? 62 : 183 };
  if (packageTag.startsWith("darwin-")) return { format: "Mach-O", class: 64, machine: packageTag.endsWith("x64") ? 0x01000007 : 0x0100000c };
  return { format: "PE", machine: packageTag.endsWith("x64") ? 0x8664 : 0xaa64 };
}

/** Lightweight file-format/architecture gate; it does not load native code. */
export function assertNativeArtifact(file, packageTag) {
  const bytes = fs.readFileSync(file);
  const expected = expectedNativeFormat(packageTag);
  if (expected.format === "ELF") {
    if (bytes.length < 20 || bytes[0] !== 0x7f || bytes.toString("ascii", 1, 4) !== "ELF") {
      throw new Error(`${packageTag} is not an ELF addon`);
    }
    const elfClass = bytes[4];
    const machine = bytes.readUInt16LE(18);
    if (elfClass !== expected.class || machine !== expected.machine) {
      throw new Error(`${packageTag} ELF class/machine mismatch (${elfClass}/${machine})`);
    }
    return;
  }
  if (expected.format === "Mach-O") {
    if (bytes.length < 8) throw new Error(`${packageTag} is too small for Mach-O header`);
    const magicBE = bytes.readUInt32BE(0);
    const magicLE = bytes.readUInt32LE(0);
    const thinLE = magicLE === 0xfeedfacf;
    const thinBE = magicBE === 0xfeedfacf;
    const fatBE = magicBE === 0xcafebabe;
    const fatLE = magicLE === 0xcafebabe;
    if (thinLE || thinBE) {
      const machine = (thinLE ? bytes.readUInt32LE(4) : bytes.readUInt32BE(4)) >>> 0;
      if (machine !== expected.machine) throw new Error(`${packageTag} Mach-O CPU mismatch (${machine})`);
      return;
    }
    if (fatBE || fatLE) {
      const read = fatLE ? (offset) => bytes.readUInt32LE(offset) : (offset) => bytes.readUInt32BE(offset);
      const count = read(4);
      if (count > 32 || 8 + count * 20 > bytes.length) throw new Error(`${packageTag} invalid Mach-O fat header`);
      for (let i = 0; i < count; i += 1) {
        if ((read(8 + i * 20) >>> 0) === expected.machine) return;
      }
      throw new Error(`${packageTag} Mach-O fat header has no expected CPU`);
    }
    throw new Error(`${packageTag} is not a supported 64-bit Mach-O addon`);
  }
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error(`${packageTag} is not a PE addon`);
  const peOffset = bytes.readUInt32LE(0x3c);
  if (peOffset + 6 > bytes.length || bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
    throw new Error(`${packageTag} has an invalid PE header`);
  }
  const machine = bytes.readUInt16LE(peOffset + 4);
  if (machine !== expected.machine) throw new Error(`${packageTag} PE machine mismatch (${machine})`);
}
