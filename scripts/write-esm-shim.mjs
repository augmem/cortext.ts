#!/usr/bin/env node
/**
 * Dual-package ESM entry: re-export the CJS build via createRequire.
 *
 * Native N-API loading and __dirname resolution live in the CJS tree. ESM
 * consumers get the same API surface without a second native loader path.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "dist", "esm");
fs.mkdirSync(outDir, { recursive: true });

const shim = `/**
 * Auto-generated ESM shim for @augmem/cortext.
 * Re-exports the CommonJS build so native loading stays single-path.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const cjs = require("../cjs/index.js");

export const Cortext = cjs.Cortext;
export const version = cjs.version;
export const lastError = cjs.lastError;
export const loadNative = cjs.loadNative;
export const platformTag = cjs.platformTag;
export const supportedNativeTargets = cjs.supportedNativeTargets;
export const getNativeCortext = cjs.getNativeCortext;
export const defaultAistModelPath = cjs.defaultAistModelPath;
export const ensureDefaultAistModelPathSync = cjs.ensureDefaultAistModelPathSync;
export const ensureDefaultAssets = cjs.ensureDefaultAssets;
export const modelCacheDir = cjs.modelCacheDir;

export default cjs;
`;

fs.writeFileSync(path.join(outDir, "index.js"), shim);
fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify({ type: "module" }, null, 2) + "\n"
);
