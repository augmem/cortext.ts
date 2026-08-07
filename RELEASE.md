# cortext.ts v1.3.0 Release Metadata

This document records the source and packaging contract for the `v1.3.0`
release. It does **not** create the tag or publish the package.

## Version and baseline

- npm package: `@augmem/cortext@1.3.0`
- Git tag to create after review: `v1.3.0`
- Binding baseline: `351db23d032fa50fec15cb9b5c0b12fb9f961c0a` (merged PR #1)
- Version surfaces: `package.json` and `package-lock.json` are both `1.3.0`.

## Native/core source of truth

`processTextWithMedia` is a binding and native API contract. The release must
stage N-API addons built from the matching
[`augmem/cortext.cpp` `v1.3.0` tag](https://github.com/augmem/cortext.cpp/tree/v1.3.0);
do not reuse `v1.2.4` (or another older) addon. Build the core JavaScript
package from that tag, then copy its `bindings/javascript/prebuilds/` tree into
this repository with:

```bash
npm run vendor:prebuilds -- \
  --from ../cortext.cpp/bindings/javascript/prebuilds --force
node scripts/check-prebuilds.mjs
```

The matching shared native/model source is the core release asset
[`cortext-assets-1.3.0.tar.gz`](https://github.com/augmem/cortext.cpp/releases/download/v1.3.0/cortext-assets-1.3.0.tar.gz).
The asset and N-API build must come from the same core tag.

## Verification before tagging

```bash
npm ci
npm run typecheck
npm run build
npm test
npm pack --dry-run
node scripts/check-prebuilds.mjs
git diff --check
```

Only after review and all checks pass should a maintainer create/push `v1.3.0`
and allow `.github/workflows/release.yml` to publish.
