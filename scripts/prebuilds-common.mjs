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
  },
  {
    packageTag: "darwin-x64",
    nativeTarget: "x86_64-apple-darwin",
    toolchain: "macos-15-intel (CMake native)",
    abi: "macOS 15 Intel x86_64 runner ABI",
  },
  {
    packageTag: "linux-arm64",
    nativeTarget: "aarch64-linux-gnu",
    toolchain: "ubuntu-24.04-arm (CMake native)",
    abi: "glibc >= 2.39; ubuntu-24.04-arm runner ABI",
  },
  {
    packageTag: "linux-x64",
    nativeTarget: "x86_64-linux-gnu",
    toolchain: "ubuntu-22.04 (CMake native)",
    abi: "glibc >= 2.35; ubuntu-22.04 runner ABI",
  },
  {
    packageTag: "win32-arm64",
    nativeTarget: "aarch64-windows-msvc",
    toolchain: "windows-11-arm (CMake native)",
    abi: "Windows 11 ARM64 runner ABI",
  },
  {
    packageTag: "win32-x64",
    nativeTarget: "x86_64-windows-msvc",
    toolchain: "windows-2022 (CMake native)",
    abi: "Windows 2022 x64 runner ABI",
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
