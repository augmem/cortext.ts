# cortext.ts v1.3.0 Release Metadata

This document records the source and packaging contract for the `v1.3.0`
release. It does **not** create the tag or publish the package.

## Version and baseline

- npm package: `@augmem/cortext@1.3.0`
- Git tag to create after review: `v1.3.0`
- Binding baseline: `351db23d032fa50fec15cb9b5c0b12fb9f961c0a` (merged PR #1)
- Version surfaces: `package.json` and `package-lock.json` are both `1.3.0`.

## Native/core source of truth

`processTextWithMedia` is a binding and native API contract. Every shipped
addon is built by `.github/workflows/release.yml` from one exact
[`augmem/cortext.cpp` tag](https://github.com/augmem/cortext.cpp/tags). The
workflow's `core_tag` input is intentionally a placeholder until the matching
follow-up core tag containing the Node text-media wrapper is available.

The TypeScript repository owns the orchestration only:

1. Each of the six host runners checks out/downloads the requested core tag.
2. CMake is configured with `CORTEXT_BUILD_NODE_BINDINGS=ON` and builds the
   `cortext_node` target.
3. A publish job collects all six `cortext.node` files and writes
   `prebuilds/manifest.json` with the core tag, commit, SHA-256 hashes, N-API
   version, and JS-visible symbol contract.
4. Publish and release upload run only after `check-prebuilds.mjs` passes.

No core addon source is copied into this repository. The old
`vendor:prebuilds` command remains only as a local compatibility helper and is
not used by release CI.

## Verification before tagging

```bash
npm ci
npm run typecheck
npm run build
npm test
npm run test:release
npm pack --dry-run
git diff --check
```

Release CI runs `npm run test:release` rather than the full model-inference
suite: this validates the package, declarations, wrapper contract, and
prebuild checks without downloading the approximately 142 MiB AIST GGUF. Full
`npm test` remains the local/model-equipped runtime suite.

Native verification is performed in the release workflow after the six matrix
artifacts are collected:

```bash
node scripts/check-prebuilds.mjs --core-tag <matching-core-tag>
```

Only after review and all checks pass should a maintainer create/push the
binding tag and allow `.github/workflows/release.yml` to publish. Do not merge,
tag, or publish from an implementation branch.
