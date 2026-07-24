import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("package.json follows dual-package publish conventions", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );

  assert.equal(pkg.name, "@augmem/cortext");
  assert.equal(pkg.license, "Apache-2.0");
  assert.ok(pkg.engines?.node);
  assert.equal(pkg.publishConfig?.access, "public");
  assert.ok(pkg.files.includes("dist/**/*"));
  assert.ok(pkg.files.includes("prebuilds/**/*"));
  assert.ok(pkg.repository?.url?.includes("cortext.ts"));
  assert.ok(pkg.scripts?.prepublishOnly);
  assert.ok(pkg.scripts?.build);
});

test("required root files exist", () => {
  for (const rel of [
    "LICENSE",
    "NOTICE",
    "README.md",
    "CHANGELOG.md",
    "package.json",
    "tsconfig.json",
    "src/index.ts",
    "src/cortext.ts",
    "src/types.ts",
    "src/load-native.ts",
    "src/model-bootstrap.ts",
  ]) {
    assert.ok(
      fs.existsSync(path.join(root, rel)),
      `missing ${rel}`
    );
  }
});
