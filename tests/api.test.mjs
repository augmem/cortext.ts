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

const decode = (c) => Buffer.from(c.base64, "base64").toString("utf8");
const bySource = (ctx, sourceId) =>
  (ctx.retrieved_memory ?? []).find((m) => m.source_id === sourceId);

test("standing_memory carries directives outside retrieved_memory", () => {
  const memory = new Cortext(":memory:");
  try {
    memory.processText("Always answer with the departure pier.", "chat/rules", {
      retention: "durable",
    });
    memory.processText(
      "The ferry to the island leaves at seven from pier four.",
      "chat/ferry",
      { retention: "durable" }
    );
    const ctx = memory.processText("When does the ferry leave?", "query/public", {
      retention: "ephemeral",
      includeEmbedding: false,
    });
    assert.ok(Array.isArray(ctx.standing_memory));
    const standing = ctx.standing_memory.find((m) => m.source_id === "chat/rules");
    assert.ok(standing, "directive is in standing_memory");
    assert.deepEqual(
      standing.content.map(decode),
      ["Always answer with the departure pier."]
    );
    assert.ok(bySource(ctx, "chat/ferry"), "fact is retrieved");
  } finally {
    memory.flush();
  }
});

test("content entries carry per-blob timestamps", () => {
  const memory = new Cortext(":memory:");
  try {
    const before = Date.now();
    memory.processText("Bailey likes tennis balls.", "chat/main", {
      retention: "durable",
    });
    const after = Date.now();
    const ctx = memory.processText("What does Bailey like?", "query/public", {
      retention: "ephemeral",
      includeEmbedding: false,
    });
    const item = bySource(ctx, "chat/main");
    assert.ok(item);
    assert.ok(item.content.length >= 1);
    for (const c of item.content) {
      assert.equal(typeof c.timestamp, "number");
      assert.ok(Number.isInteger(c.timestamp));
      assert.ok(
        c.timestamp >= before && c.timestamp <= after,
        `${c.timestamp} within [${before}, ${after}]`
      );
    }
  } finally {
    memory.flush();
  }
});

test("referenceMs adds a reference time; asOf hides later memories", () => {
  const memory = new Cortext(":memory:");
  try {
    const earlier = Date.now() - 60_000;
    memory.processText(
      "The ferry to the island leaves at seven from pier four.",
      "chat/ferry",
      { retention: "durable" }
    );
    const later = Date.now() + 60_000;
    const query = "When does the ferry leave?";
    const ask = (extra) =>
      memory.processText(query, "query/public", {
        retention: "ephemeral",
        includeEmbedding: false,
        ...extra,
      });

    assert.ok(bySource(ask({}), "chat/ferry"), "no reference time");
    // Without asOf nothing is dropped for being later than the reference.
    assert.ok(bySource(ask({ referenceMs: earlier }), "chat/ferry"));
    assert.ok(bySource(ask({ referenceMs: null, asOf: true }), "chat/ferry"));
    // asOf before the memory was stored hides it; after keeps it.
    assert.equal(
      bySource(ask({ referenceMs: earlier, asOf: true }), "chat/ferry"),
      undefined
    );
    assert.ok(bySource(ask({ referenceMs: later, asOf: true }), "chat/ferry"));

    for (const referenceMs of [-1, 1.5, "1700000000000"]) {
      assert.throws(() => ask({ referenceMs }), `referenceMs ${referenceMs}`);
    }
  } finally {
    memory.flush();
  }
});

test("processTextWithMedia stores text for empty media and typed payloads otherwise", () => {
  const memory = new Cortext(":memory:");
  try {
    memory.processTextWithMedia(
      "Bailey's vet is Dr. Ortiz.",
      "chat/vet",
      new Uint8Array(0),
      "image/png",
      { retention: "durable" }
    );
    const html = "<p>Bailey's groomer is Sam.</p>";
    memory.processTextWithMedia(
      "Bailey's groomer is Sam.",
      "chat/groomer",
      { data: new TextEncoder().encode(html), mimetype: "text/html" },
      { retention: "durable" }
    );
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    memory.processTextWithMedia(
      "A photo of Bailey at the beach.",
      "chat/photo",
      png,
      "image/png",
      { retention: "durable" }
    );
    const ask = (q) =>
      memory.processText(q, "query/public", {
        retention: "ephemeral",
        includeEmbedding: false,
      });

    const vet = bySource(ask("Who is Bailey's vet?"), "chat/vet");
    assert.ok(vet);
    assert.equal(vet.content[0].mimetype, "text/plain");
    assert.equal(decode(vet.content[0]), "Bailey's vet is Dr. Ortiz.");

    const groomer = bySource(ask("Who grooms Bailey?"), "chat/groomer");
    assert.ok(groomer);
    assert.equal(groomer.content[0].mimetype, "text/html");
    assert.equal(decode(groomer.content[0]), html);

    const photo = bySource(ask("A photo of Bailey at the beach"), "chat/photo");
    assert.ok(photo);
    assert.equal(photo.mimetype, "image/png");
    assert.equal(photo.content[0].mimetype, "image/png");
    assert.deepEqual(
      [...Buffer.from(photo.content[0].base64, "base64")],
      [...png]
    );
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
