# cortext.ts

TypeScript and JavaScript bindings for [Cortext](https://github.com/augmem/cortext).

This repository is the language-binding home for Node.js — the sibling of
[`cortext.py`](https://github.com/augmem/cortext.py) and
[`cortext.go`](https://github.com/augmem/cortext.go). It publishes the npm
package **`@augmem/cortext`**.

Binding **1.2.4** tracks engine **v1.2.4**.

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
# From a monorepo-style checkout next to augmem/cortext
git clone https://github.com/augmem/cortext.ts.git
cd cortext.ts
npm install

# Copy N-API prebuilds from sibling engine tree (or a published package)
npm run vendor:prebuilds

npm run build
npm test
```

### Build scripts

| Script | Purpose |
| --- | --- |
| `npm run build` | Clean + types + CJS + ESM shim |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Build + `node --test tests/*.test.mjs` |
| `npm run vendor:prebuilds` | Copy/link prebuilds into `prebuilds/` |
| `npm run pack:check` | `npm pack --dry-run` |

Prebuild binaries are **not** committed (GitHub size / cleanliness). CI and
`prepublishOnly` vendor or verify them before packing.

## Maintainer release flow

```bash
# 1) Vendor all platform prebuilds (from monorepo build or prior package)
npm run vendor:prebuilds

# 2) Verify
npm test
node scripts/check-prebuilds.mjs

# 3) Bump version in package.json + CHANGELOG.md, then:
git tag v1.2.4
git push origin v1.2.4
# CI (.github/workflows/release.yml) publishes to npm
```

Manual publish:

```bash
npm run build
node scripts/check-prebuilds.mjs
npm publish --access public
```

## Why a separate repo?

| Repo | Role |
| --- | --- |
| [`augmem/cortext`](https://github.com/augmem/cortext) | Engine (C++/Zig), in-tree binding prototypes |
| [`augmem/cortext.py`](https://github.com/augmem/cortext.py) | Python wheels (ctypes + platform natives) |
| [`augmem/cortext.go`](https://github.com/augmem/cortext.go) | Pure Go FFI package |
| **`augmem/cortext.ts`** | npm `@augmem/cortext` — dual ESM/CJS TypeScript |

Language bindings follow their ecosystem’s packaging norms. Node/TypeScript
belongs on npm with dual exports, declaration maps, and N-API prebuilds — not
buried only under the engine monorepo’s `bindings/javascript`.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
