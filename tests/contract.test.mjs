import assert from "node:assert/strict";
import { createRequire } from "node:module";
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

test("published types expose text media bytes and MIME arguments", () => {
  const declarations = fs.readFileSync(
    path.join(root, "dist", "types", "types.d.ts"),
    "utf8"
  );
  assert.match(
    declarations,
    /processTextWithMediaJson\([\s\S]*media\?: Uint8Array \| null[\s\S]*mediaMimeType\?: string \| null/
  );

  const cortextDeclarations = fs.readFileSync(
    path.join(root, "dist", "types", "cortext.d.ts"),
    "utf8"
  );
  assert.match(
    cortextDeclarations,
    /processTextWithMedia\([\s\S]*media\?: Media \| Uint8Array \| null[\s\S]*mediaMimeType\?: string \| ProcessOptions \| null/
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
