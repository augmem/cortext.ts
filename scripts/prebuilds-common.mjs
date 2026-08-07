#!/usr/bin/env node
/** Shared contract for the TypeScript-owned N-API prebuild pipeline. */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export const TARGETS = [
  { packageTag: "darwin-arm64", zigTarget: "aarch64-macos" },
  { packageTag: "darwin-x64", zigTarget: "x86_64-macos" },
  { packageTag: "linux-arm64", zigTarget: "aarch64-linux-gnu.2.17" },
  { packageTag: "linux-x64", zigTarget: "x86_64-linux-gnu.2.17" },
  { packageTag: "win32-arm64", zigTarget: "aarch64-windows-gnu" },
  { packageTag: "win32-x64", zigTarget: "x86_64-windows-gnu" },
];

export const TARGET_TAGS = TARGETS.map(({ packageTag }) => packageTag);
export const PREBUILD_SCHEMA = "augmem.cortext.node.prebuilds.v2";
export const BUILD_METADATA_SCHEMA = "augmem.cortext.node.build.v1";
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
