# cortext.ts

TypeScript and JavaScript bindings for [Cortext](https://github.com/augmem/cortext.cpp).

This repository is the language-binding home for Node.js — the sibling of
[`cortext.py`](https://github.com/augmem/cortext.py) and
[`cortext.go`](https://github.com/augmem/cortext.go). It publishes the npm
package **`@augmem/cortext`**.

Binding **2.0.0** tracks the Cortext native API and release assets at
[`augmem/cortext.cpp@v2.0.0`](https://github.com/augmem/cortext.cpp/tree/v2.0.0)
(engine v5). The native addon must be built from that same core tag; this
wrapper does not provide a compatibility fallback for older addons, which do
not read the evidence-budget or reference-time options.

## Install

```bash
npm install @augmem/cortext
# or
pnpm add @augmem/cortext
# or
yarn add @augmem/cortext
```

Node.js **18+**. Prebuilt N-API addons ship for:

| Platform tag   | OS / arch        |
| -------------- | ---------------- |
| `linux-x64`    | Linux x86_64     |
| `linux-arm64`  | Linux aarch64    |
| `darwin-x64`   | macOS Intel      |
| `darwin-arm64` | macOS Apple Silicon |
| `win32-x64`    | Windows x64      |
| `win32-arm64`  | Windows ARM64    |

Release addons are built natively with CMake on the named GitHub runner for
each target, for a fixed CPU baseline rather than the runner's CPU: x86-64-v3
(AVX2, FMA, F16C, BMI2) on x64, ARMv8.2-A with dotprod and FP16 on Linux arm64
(Graviton2, Ampere Altra, Raspberry Pi 5 and newer), the Apple M1 baseline on
macOS arm64, and ARMv8-A on Windows arm64. They are not Zig cross-builds, and
the manifest does not promise a portable glibc baseline. Linux x64 uses the Ubuntu 22.04 runner ABI (glibc
>= 2.35), Linux arm64 uses Ubuntu 24.04 ARM (glibc >= 2.39), and macOS/Windows
use their documented native runner ABIs. Consumers needing older Linux
systems must provide a compatible addon through `CORTEXT_NODE_ADDON_PATH`.

The package and its published addons do **not** embed the AIST GGUF model.
Point the engine at it with `CORTEXT_AIST_MODEL_PATH`, or fetch it into the
user cache once with `ensureDefaultAssets()`. Whenever an AIST model is present
the engine also requires its late-interaction reranker, `AIST-87M-LI.gguf`,
read from `CORTEXT_LI_MODEL_PATH` or else from beside the AIST model; without it
`new Cortext(...)` throws. `ensureDefaultAssets()` downloads the reranker too
(from the Git shards in `augmem/cortext.cpp`, checksummed and reassembled
beside AIST), and a model cache only counts as the default when its reranker
resolves.

| Variable | Role |
| --- | --- |
| `CORTEXT_NODE_ADDON_PATH` | Explicit path to `cortext.node` |
| `CORTEXT_AIST_MODEL_PATH` | Explicit full AIST `.gguf` path |
| `CORTEXT_LI_MODEL_PATH` | Explicit `AIST-87M-LI.gguf` path (default: beside the AIST model) |
| `CORTEXT_MODEL_CACHE_DIR` | Cache dir for `ensureDefaultAssets()` downloads |

## Dual package (ESM + CJS)

Published with modern dual-package exports:

```json
{
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/types/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/types/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  }
}
```

```ts
// ESM / TypeScript
import { Cortext, version } from "@augmem/cortext";

console.log(version());
```

```js
// CommonJS
const { Cortext, version } = require("@augmem/cortext");
```

## Quickstart

```ts
import { Cortext } from "@augmem/cortext";

const memory = new Cortext(
  {
    focus: 0.55,
    sensitivity: 0.5,
    stability: 0.65,
  },
  "memory.sqlite"
);

try {
  memory.processText("The garage door code is 8841.", "user/profile", {
    includeEmbedding: false,
    retention: "durable",
  });

  // evidenceBudgetBytes: the reader's evidence budget (omit for whole
  // memories); 8,000 tokens at 4.35 chars/token is 34,800 bytes.
  const ctx = memory.processText(
    "We are leaving soon. What should I remember about the garage?",
    "chat/assistant",
    { includeEmbedding: false, retention: "ephemeral", evidenceBudgetBytes: 34_800 }
  );

  // Standing directives lead, then the retrieved memories.
  for (const item of [...(ctx.standing_memory ?? []), ...(ctx.retrieved_memory ?? [])]) {
    // Every signal payload of the memory, each with its own MIME type and
    // timestamp (ms since the Unix epoch, 0 when unknown); modality is the
    // one its signals share, or "mixed".
    const payloads = (item.content ?? []).map((c) => [c.mimetype, c.timestamp]);
    console.log(item.modality, payloads, item.relevance, item.composite_score);
  }

  if (ctx.consolidation_state !== "none") {
    memory.consolidate();
  }
} finally {
  memory.flush();
}
```

Use `new Cortext(":memory:")` for a temporary engine. Use a file path when
memories should survive process restarts.

To retain arbitrary source media alongside text, pass raw bytes and their MIME
type to `processTextWithMedia` (or pass a `Media` object):

```ts
const ctx = memory.processTextWithMedia(
  "Bailey sent a voice note.",
  "chat/main",
  new Uint8Array([0x00, 0xff, 0x01]),
  "audio/ogg",
  { includeEmbedding: false }
);
```

A query (`retention: "ephemeral"`) can also take a reference time,
`referenceMs` (whole ms since the Unix epoch, past or future). Unset, retrieval
is unchanged. Set, the long-term memories nearest that time join the
candidates; nothing is dropped for being later. Add `asOf: true` to answer as of
that time: memories that start after it are hidden.

```ts
const asOfMarch = memory.processText("Where did we park?", "chat/assistant", {
  retention: "ephemeral",
  referenceMs: Date.parse("2026-03-01T00:00:00Z"),
  asOf: true,
});
```

## API

| Export | Notes |
| --- | --- |
| `Cortext` | Engine handle (`processText`, `embedText`, audio/image variants, `consolidate`, `flush`, `reset`) |
| `version()` / `lastError()` | Native version and last error string |
| `CortextConfig`, `CortextContext`, `ProcessOptions`, `Retention`, `Media` | Public TypeScript types |
| `loadNative`, `platformTag`, `supportedNativeTargets` | Advanced native loading helpers |
| `defaultAistModelPath`, `ensureDefaultAssets`, `lateInteractionModelPath`, `modelCacheDir` | Optional model path / bootstrap helpers |

Retention values: `"natural" | "durable" | "boundary" | "ephemeral"` (or `0..3`).

## Repository layout

```text
cortext.ts/
  src/                 TypeScript sources
  dist/                build output (CJS + ESM shim + .d.ts) — not committed
  prebuilds/           platform cortext.node addons (vendored for publish)
  scripts/             vendor-prebuilds, dual-package helpers
  tests/               node:test contract + API tests
  .github/workflows/   CI and npm release
```

## Develop

```bash
# From a checkout next to augmem/cortext.cpp
git clone https://github.com/augmem/cortext.ts.git
cd cortext.ts
npm install

# Build the host addon from the exact available core tag.
CORTEXT_CORE_TAG=v2.0.0 npm run build:prebuild -- \
  --core-dir ../cortext.cpp \
  --target "$(node -p '`${process.platform}-${process.arch}`')"

npm run build
npm run test:release
# Full npm test additionally requires local AIST model assets, for example:
#   CORTEXT_AIST_MODEL_PATH=/models/AIST-87M-GGUF/AIST-87M_q8_0.gguf \
#   CORTEXT_LI_MODEL_PATH=/models/AIST-87M-GGUF/AIST-87M-LI.gguf npm test
# (vocab.txt under /models/mdbr-leaf-ir). Set CORTEXT_OFFLINE=1 to skip the
# test that downloads the LI reranker.
```

`build:prebuild` deliberately accepts only exact core tags. To test against an
untagged core checkout, build it directly with CMake
(`-DCORTEXT_BUILD_NODE_BINDINGS=ON`, target `cortext_node`) and point
`CORTEXT_NODE_ADDON_PATH` at the resulting `ffi/node/cortext.node`.

`npm run vendor:prebuilds` is retained only as a legacy compatibility helper;
it is not the source of release artifacts and should not point at a nonexistent
`bindings/javascript/prebuilds` tree.

### Build scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Clean + types + CJS + ESM shim |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Build + all `node:test` checks (requires native model assets) |
| `npm run test:release` | Build + package/prebuild/contract checks without model inference |
| `npm run build:prebuild -- --core-tag <tag>` | Build one host addon from an exact core tag |
| `npm run collect:prebuilds -- --input <dir> --core-tag <tag> --core-dir <checkout>` | Collect outputs and independently verify core provenance |
| `npm run check:prebuilds -- --core-tag <tag>` | Verify all six files, hashes, symbols, and core provenance |
| `npm run vendor:prebuilds` | Legacy local copy helper (not used by release CI) |
| `npm run pack:check` | `npm pack --dry-run` |

Prebuild binaries are **not** committed (GitHub size / cleanliness). The
TypeScript-owned pipeline checks out or clones `augmem/cortext.cpp` at the
explicit `--core-tag`, installs the pinned `node-api-headers` development
package, configures CMake with `CORTEXT_BUILD_NODE_BINDINGS=ON`, and emits only
`cortext.node` plus a small artifact sidecar. Every addon disables GGML
OpenMP to avoid static `libgomp` relocations; every target retains embedded
sqlite-vec and the generated manifest records that feature metadata. Windows
builds use `node.lib` when the Node toolchain provides it, or generate it from
the pinned `node-api-headers` `.def` file with Visual Studio `lib.exe`; Windows
ARM uses the core `CORTEXT_ALLOW_CLANGCL_ARM=ON` opt-in with LLVM `clang-cl`.
Linux ARM builds retain the targeted `class-memaccess` warning downgrade needed
by Eigen. The release matrix runs
this once on each of the six Node
platforms. The collector independently checks out the exact core tag, verifies
the commit and required `ffi/node/addon.cpp` methods, then copies only the six
addons and writes `prebuilds/manifest.json` with core provenance, hashes,
required JS-visible symbols, native targets, runner toolchains, and ABI notes.
The publish job refuses to proceed until the complete manifest validates. Core
C++ and N-API source is never duplicated here.

For a local host build (the checkout must already be at the exact tag):

```bash
CORTEXT_CORE_TAG=v2.0.0 npm run build:prebuild -- \
  --core-dir ../cortext.cpp --target "$(node -p '`${process.platform}-${process.arch}`')"
```

A pushed `vX.Y.Z` tag builds against the core tag of the same version; the
workflow dispatch `core_tag` input defaults to `v2.0.0`. Do not silently
substitute an older native addon.

Release CI uses `npm run test:release`: it builds the package and runs the
package, declaration, prebuild-manifest, and wrapper-contract checks while
excluding model-inference tests. This is intentional because published
prebuilds do not include the approximately 142 MiB AIST GGUF; full `npm test`
remains the local/model-equipped runtime suite.

## Maintainer release flow

1. Prepare the binding release commit and push it; do **not** copy C++ addon
   source into this repository.
2. Run `.github/workflows/release.yml` manually with the binding `tag` and the
   exact matching `core_tag` (replace its placeholder with the follow-up core
   tag when the Node text-media wrapper lands), or push a version tag when the
   two versions intentionally match.
3. The six-host matrix builds from that core tag. The publish job collects and
   verifies all six addons, including manifest hashes, N-API symbols, and core
   commit provenance, before `npm publish` or GitHub Release upload.

The release workflow is the only supported path for publishing native
artifacts. `npm run check:prebuilds` is deliberately strict: a local checkout
without the six generated binaries must fail rather than publish a partial
package.

## Why a separate repo?

| Repo | Role |
| --- | --- |
| [`augmem/cortext.cpp`](https://github.com/augmem/cortext.cpp) | Engine (C++/Zig), native release assets |
| [`augmem/cortext.py`](https://github.com/augmem/cortext.py) | Python wheels (ctypes + platform natives) |
| [`augmem/cortext.go`](https://github.com/augmem/cortext.go) | Pure Go FFI package |
| **`augmem/cortext.ts`** | npm `@augmem/cortext` — dual ESM/CJS TypeScript |

Language bindings follow their ecosystem’s packaging norms. Node/TypeScript
belongs on npm with dual exports, declaration maps, and N-API prebuilds — not
buried only under the engine monorepo’s `bindings/javascript`.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
