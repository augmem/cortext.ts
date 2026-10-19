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

test("evidenceBudgetBytes bounds standing and retrieved memory", () => {
  const memory = new Cortext(":memory:");
  try {
    memory.processText("Always answer with the departure pier.", "chat/rules", {
      retention: "durable",
    });
    for (let i = 0; i < 6; i++) {
      memory.processText(
        `The ferry to the island leaves at ${6 + i} from pier four.`,
        `chat/ferry/${i}`,
        { retention: "durable" }
      );
    }
    const evidence = (ctx) =>
      [...ctx.standing_memory, ...ctx.retrieved_memory]
        .flatMap((m) => m.content ?? [])
        .reduce(
          (sum, c) => sum + (c.mimetype.startsWith("text/") ? c.size_bytes : 480),
          0
        );
    const query = "When does the ferry leave?";
    const whole = memory.processText(query, "query/public", {
      retention: "ephemeral",
    });
    assert.ok(Array.isArray(whole.standing_memory));
    assert.ok(whole.retrieved_memory.length >= 2);
    const budget = Math.floor(evidence(whole) / 2);
    const budgeted = memory.processText(query, "query/public", {
      retention: "ephemeral",
      evidenceBudgetBytes: budget,
    });
    assert.ok(evidence(budgeted) <= budget);
    assert.ok(budgeted.retrieved_memory.length < whole.retrieved_memory.length);
    assert.throws(() =>
      memory.processText(query, "query/public", { evidenceBudgetBytes: 1.5 })
    );
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
