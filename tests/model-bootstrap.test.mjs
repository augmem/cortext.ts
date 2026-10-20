import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

// Late-interaction reranker (AIST-87M-LI.gguf) resolution. The engine throws
// when an AIST model is present without its reranker, so a model cache only
// counts when the reranker resolves too. Needs the real model files, found
// through CORTEXT_AIST_MODEL_PATH (vocab.txt under ../../mdbr-leaf-ir).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const bootstrap = require(path.join(root, "dist", "cjs", "index.js"));

const aistSource = process.env.CORTEXT_AIST_MODEL_PATH;
const liSource =
  process.env.CORTEXT_LI_MODEL_PATH ??
  (aistSource && path.join(path.dirname(aistSource), "AIST-87M-LI.gguf"));
const vocabSource =
  aistSource &&
  path.join(path.dirname(aistSource), "..", "mdbr-leaf-ir", "vocab.txt");
const haveModels =
  aistSource &&
  fs.existsSync(aistSource) &&
  fs.existsSync(liSource) &&
  fs.existsSync(vocabSource);
const skip = haveModels
  ? false
  : "set CORTEXT_AIST_MODEL_PATH (with AIST-87M-LI.gguf and mdbr-leaf-ir/vocab.txt)";

// Run fn with the bootstrap looking only at a fresh cache directory.
function withCache(fn) {
  const saved = {
    cache: process.env.CORTEXT_MODEL_CACHE_DIR,
    li: process.env.CORTEXT_LI_MODEL_PATH,
  };
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), "cortext-models-"));
  process.env.CORTEXT_MODEL_CACHE_DIR = cache;
  delete process.env.CORTEXT_LI_MODEL_PATH;
  const restore = () => {
    for (const [key, env] of [
      ["cache", "CORTEXT_MODEL_CACHE_DIR"],
      ["li", "CORTEXT_LI_MODEL_PATH"],
    ]) {
      if (saved[key] === undefined) delete process.env[env];
      else process.env[env] = saved[key];
    }
    fs.rmSync(cache, { recursive: true, force: true });
  };
  let result;
  try {
    result = fn(cache);
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.finally(restore);
  }
  restore();
  return result;
}

function seed(cache, { li }) {
  const aist = path.join(cache, "AIST-87M-GGUF", "AIST-87M_q8_0.gguf");
  fs.mkdirSync(path.dirname(aist), { recursive: true });
  fs.mkdirSync(path.join(cache, "mdbr-leaf-ir"), { recursive: true });
  fs.symlinkSync(aistSource, aist);
  fs.symlinkSync(vocabSource, path.join(cache, "mdbr-leaf-ir", "vocab.txt"));
  if (li) {
    fs.copyFileSync(liSource, path.join(path.dirname(aist), "AIST-87M-LI.gguf"));
  }
  return aist;
}

test("lateInteractionModelPath: beside AIST, or CORTEXT_LI_MODEL_PATH", () => {
  withCache(() => {
    const aist = path.join("/models", "AIST-87M-GGUF", "AIST-87M_q8_0.gguf");
    assert.equal(
      bootstrap.lateInteractionModelPath(aist),
      path.join("/models", "AIST-87M-GGUF", "AIST-87M-LI.gguf")
    );
    process.env.CORTEXT_LI_MODEL_PATH = "/elsewhere/li.gguf";
    assert.equal(bootstrap.lateInteractionModelPath(aist), "/elsewhere/li.gguf");
  });
});

test("cached AIST without its LI reranker is not a usable default", { skip }, () => {
  withCache((cache) => {
    seed(cache, { li: false });
    assert.equal(bootstrap.defaultAistModelPath(), undefined);
  });
});

test("cached AIST with its LI reranker beside it is the default", { skip }, () => {
  withCache((cache) => {
    const aist = seed(cache, { li: true });
    assert.equal(bootstrap.defaultAistModelPath(), aist);
  });
});

test("cached AIST with CORTEXT_LI_MODEL_PATH is the default", { skip }, () => {
  withCache((cache) => {
    const aist = seed(cache, { li: false });
    process.env.CORTEXT_LI_MODEL_PATH = liSource;
    // The engine reads the reranker from the override, so none is needed
    // beside AIST.
    assert.equal(bootstrap.defaultAistModelPath(), aist);
  });
});

test(
  "ensureDefaultAssets fetches, checksums and places the LI reranker beside AIST",
  { skip: skip || (process.env.CORTEXT_OFFLINE ? "CORTEXT_OFFLINE" : false) },
  async () => {
    await withCache(async (cache) => {
      const aist = seed(cache, { li: false });
      assert.equal(await bootstrap.ensureDefaultAssets(), aist);
      const li = path.join(path.dirname(aist), "AIST-87M-LI.gguf");
      assert.ok(fs.lstatSync(li).isFile());
      assert.deepEqual(fs.readFileSync(li), fs.readFileSync(liSource));
      assert.deepEqual(
        fs.readdirSync(path.dirname(aist)).sort(),
        ["AIST-87M-LI.gguf", "AIST-87M_q8_0.gguf"]
      );
      assert.equal(bootstrap.defaultAistModelPath(), aist);
    });
  }
);
