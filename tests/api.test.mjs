import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { Cortext, version, platformTag, supportedNativeTargets } = require(
  path.join(root, "dist", "cjs", "index.js")
);

test("version() returns a non-empty string", () => {
  const v = version();
  assert.equal(typeof v, "string");
  assert.ok(v.length > 0);
});

test("platformTag is a supported prebuild target on this host", () => {
  const tag = platformTag();
  assert.ok(supportedNativeTargets().includes(tag), `unexpected tag ${tag}`);
});

test("processText durable then ephemeral recall", () => {
  const memory = new Cortext(
    { focus: 0.55, sensitivity: 0.5, stability: 0.65 },
    ":memory:"
  );
  try {
    memory.processText("Bailey likes tennis balls.", "chat/main", {
      retention: "durable",
    });
    const ctx = memory.processText(
      "What does Bailey like?",
      "chat/main",
      { retention: "ephemeral" }
    );
    assert.equal(typeof ctx.consolidation_state, "string");
    assert.ok(
      ["none", "recommended", "required"].includes(ctx.consolidation_state)
    );
    assert.ok(Array.isArray(ctx.retrieved_memory) || ctx.retrieved_memory === undefined);
  } finally {
    memory.flush();
  }
});

test("processAudioWithMedia accepts binary Uint8Array and MIME", () => {
  const memory = new Cortext(":memory:");
  try {
    const ctx = memory.processAudioWithMedia(
      new Float32Array(160),
      "media/audio",
      new Uint8Array([0x00, 0x7f, 0xff, 0x01]),
      "audio/ogg",
      { retention: "ephemeral", includeEmbedding: false }
    );
    assert.equal(typeof ctx.consolidation_state, "string");
    assert.ok(ctx.output && typeof ctx.output === "object");
  } finally {
    memory.flush();
  }
});

test("embedText returns a non-empty float vector", () => {
  const memory = new Cortext(":memory:");
  try {
    const emb = memory.embedText("embed without storing");
    assert.ok(Array.isArray(emb));
    assert.ok(emb.length > 0);
    assert.equal(typeof emb[0], "number");
  } finally {
    memory.flush();
  }
});

test("constructor accepts db path string overload", () => {
  const memory = new Cortext(":memory:");
  try {
    const ctx = memory.processText("hello", "src", { retention: "ephemeral" });
    assert.ok(ctx);
    assert.equal(typeof ctx.consolidation_state, "string");
  } finally {
    memory.flush();
  }
});
