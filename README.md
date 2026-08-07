# cortext.ts

TypeScript and JavaScript bindings for [Cortext](https://github.com/augmem/cortext.cpp).

This repository is the language-binding home for Node.js — the sibling of
[`cortext.py`](https://github.com/augmem/cortext.py) and
[`cortext.go`](https://github.com/augmem/cortext.go). It publishes the npm
package **`@augmem/cortext`**.

Binding **1.3.0** tracks the Cortext native API and release assets at
[`augmem/cortext.cpp@v1.3.0`](https://github.com/augmem/cortext.cpp/tree/v1.3.0).
The native addon must be built from that same core tag; this wrapper does not
provide a compatibility fallback for older addons because `processTextWithMedia`
requires native support.

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

The package does **not** embed the large AIST GGUF model. Release natives embed
AIST and assemble it on first create. Optional overrides:

| Variable | Role |
| --- | --- |
| `CORTEXT_NODE_ADDON_PATH` | Explicit path to `cortext.node` |
| `CORTEXT_AIST_MODEL_PATH` | Explicit full `.gguf` path |
| `CORTEXT_MODEL_CACHE_DIR` | Cache dir for optional HF downloads |

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

  const ctx = memory.processText(
    "We are leaving soon. What should I remember about the garage?",
    "chat/assistant",
    { includeEmbedding: false, retention: "ephemeral" }
  );

  for (const item of ctx.retrieved_memory ?? []) {
    console.log(item.text, item.relevance, item.composite_score);
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

## API

| Export | Notes |
| --- | --- |
| `Cortext` | Engine handle (`processText`, `embedText`, audio/image variants, `consolidate`, `flush`, `reset`) |
| `version()` / `lastError()` | Native version and last error string |
| `CortextConfig`, `CortextContext`, `ProcessOptions`, `Retention`, `Media` | Public TypeScript types |
| `loadNative`, `platformTag`, `supportedNativeTargets` | Advanced native loading helpers |
| `defaultAistModelPath`, `ensureDefaultAssets`, `modelCacheDir` | Optional model path / bootstrap helpers |

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

# Build the matching v1.3.0 core N-API addons in ../cortext.cpp first, then:
npm run vendor:prebuilds -- --from ../cortext.cpp/bindings/javascript/prebuilds

npm run build
npm test
```

### Build scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Clean + types + CJS + ESM shim |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Build + all `node:test` checks (requires native model assets) |
| `npm run test:release` | Build + package/prebuild/contract checks without model inference |
| `npm run build:prebuild -- --core-tag <tag>` | Build one host addon from an exact core tag |
| `npm run collect:prebuilds -- --input <dir> --core-tag <tag>` | Collect the six matrix outputs and write the manifest |
| `npm run check:prebuilds -- --core-tag <tag>` | Verify all six files, hashes, symbols, and core provenance |
| `npm run vendor:prebuilds` | Legacy local copy helper (not used by release CI) |
| `npm run pack:check` | `npm pack --dry-run` |

Prebuild binaries are **not** committed (GitHub size / cleanliness). The
TypeScript-owned pipeline checks out or clones `augmem/cortext.cpp` at the
explicit `--core-tag`, configures CMake with
`CORTEXT_BUILD_NODE_BINDINGS=ON`, and emits only `cortext.node` plus a small
provenance sidecar. The release matrix runs this once on each of the six Node
platforms. The collector copies only the six addons, writes
`prebuilds/manifest.json` with the exact core tag/commit and required
JS-visible symbols, and the publish job refuses to proceed until the complete
manifest validates. Core C++ and N-API source is never duplicated here.

For a local host build (the checkout must already be at the exact tag):

```bash
CORTEXT_CORE_TAG=v1.3.0 npm run build:prebuild -- \
  --core-dir ../cortext.cpp --target "$(node -p '`${process.platform}-${process.arch}`')"
```

The workflow dispatch input intentionally defaults to
`REPLACE_WITH_MATCHING_CORE_TAG`. Replace it with the follow-up
`augmem/cortext.cpp` tag that contains the Node text-media wrapper; do not
silently substitute an older native addon.

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
