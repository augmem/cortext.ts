import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

test("published type declarations match consolidation_state contract", () => {
  const declarations = fs.readFileSync(
    path.join(root, "dist", "types", "types.d.ts"),
    "utf8"
  );
  assert.match(
    declarations,
    /export type ConsolidationState = "none" \| "recommended" \| "required";/
  );
  assert.match(declarations, /consolidation_state: ConsolidationState;/);
  assert.doesNotMatch(declarations, /consolidation_recommended/);
  assert.doesNotMatch(declarations, /consolidation_required/);
});

test("published types expose safe text media overloads", () => {
  const declarations = fs.readFileSync(
    path.join(root, "dist", "types", "cortext.d.ts"),
    "utf8"
  );
  assert.match(
    declarations,
    /processTextWithMediaJson\(text: string, sourceId: string, media: Media, options\?: ProcessOptions \| null\): string;/
  );
  assert.match(
    declarations,
    /processTextWithMediaJson\(text: string, sourceId: string, media\?: Uint8Array \| null, mediaMimeType\?: string \| null, options\?: ProcessOptions \| null\): string;/
  );
  assert.match(
    declarations,
    /processTextWithMedia\(text: string, sourceId: string, media: Media, options\?: ProcessOptions \| null\): CortextContext;/
  );
  assert.match(
    declarations,
    /processTextWithMedia\(text: string, sourceId: string, media\?: Uint8Array \| null, mediaMimeType\?: string \| null, options\?: ProcessOptions \| null\): CortextContext;/
  );
  assert.doesNotMatch(
    declarations,
    /processTextWithMediaJson\(text: string, sourceId: string, media\?: Media \| Uint8Array \| null, mediaMimeType\?: string \| ProcessOptions \| null/
  );
  assert.doesNotMatch(
    declarations,
    /processTextWithMedia\(text: string, sourceId: string, media\?: Media \| Uint8Array \| null, mediaMimeType\?: string \| ProcessOptions \| null/
  );
});

test("source typecheck rejects options in the Uint8Array MIME slot", () => {
  execFileSync(
    process.execPath,
    [
      path.join(root, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      path.join(root, "tests", "fixtures", "tsconfig.json"),
      "--noEmit",
    ],
    { stdio: "inherit" }
  );
});

test("package exports dual CJS and ESM entry points", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );
  assert.equal(pkg.main, "./dist/cjs/index.js");
  assert.equal(pkg.module, "./dist/esm/index.js");
  assert.equal(pkg.types, "./dist/types/index.d.ts");
  assert.ok(pkg.exports["."].import);
  assert.ok(pkg.exports["."].require);
  assert.ok(pkg.exports["."].types);
  assert.ok(fs.existsSync(path.join(root, "dist", "cjs", "index.js")));
  assert.ok(fs.existsSync(path.join(root, "dist", "esm", "index.js")));
  assert.ok(fs.existsSync(path.join(root, "dist", "cjs", "package.json")));
});

test("CJS require exposes Cortext and version", () => {
  const cjs = require(path.join(root, "dist", "cjs", "index.js"));
  assert.equal(typeof cjs.Cortext, "function");
  assert.equal(typeof cjs.version, "function");
  assert.equal(typeof cjs.lastError, "function");
  assert.equal(typeof cjs.loadNative, "function");
  assert.equal(typeof cjs.platformTag, "function");
});

test("ESM import re-exports Cortext", async () => {
  const esm = await import(path.join(root, "dist", "esm", "index.js"));
  assert.equal(typeof esm.Cortext, "function");
  assert.equal(typeof esm.version, "function");
  assert.equal(esm.Cortext, require(path.join(root, "dist", "cjs", "index.js")).Cortext);
});

test("runtime consolidation_state contract against native addon", () => {
  const { Cortext } = require(path.join(root, "dist", "cjs", "index.js"));
  const engine = new Cortext(
    { focus: 0.5, sensitivity: 0.5, stability: 0.5 },
    ":memory:"
  );
  const runtime = JSON.parse(
    engine.processTextJson(
      "TypeScript binding consolidation-state contract probe.",
      "contract/runtime",
      { retention: "ephemeral" }
    )
  );

  assert.equal(runtime.consolidation_state, "none");
  assert.equal(
    Object.prototype.hasOwnProperty.call(runtime, "consolidation_recommended"),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(runtime, "consolidation_required"),
    false
  );
});
