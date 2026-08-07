# Changelog

All notable changes to `@augmem/cortext` (this repository: **cortext.ts**) are
documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [1.3.1] - Unreleased

### Changed

- Release ownership moved to the TypeScript repository's six-runner CMake
  N-API prebuild pipeline. Addons are provenance-checked against the exact
  `augmem/cortext.cpp` `v1.3.1` core tag before publishing.
- Generated prebuilds and manifests are release artifacts and are not tracked
  in the source checkout.

## [1.3.0] - 2026-08-06

### Added

- `processTextWithMedia` and `processTextWithMediaJson` for retaining caller
  supplied text media bytes with a MIME type, including safe TypeScript
  overloads for `Media` objects and raw `Uint8Array` values.

### Release provenance

- Release baseline: merged PR [#1](https://github.com/augmem/cortext.ts/pull/1)
  at commit `351db23d032fa50fec15cb9b5c0b12fb9f961c0a`.
- The N-API prebuilds must be built from the matching
  [`augmem/cortext.cpp` `v1.3.0` tag](https://github.com/augmem/cortext.cpp/tree/v1.3.0);
  older native addons do not implement the text-media entry point.
- Shared core/model assets come from the matching
  [`cortext-assets-1.3.0.tar.gz`](https://github.com/augmem/cortext.cpp/releases/download/v1.3.0/cortext-assets-1.3.0.tar.gz)
  release asset. See `README.md` for the prebuild staging command.

## [1.2.4] - 2026-07-24

### Added

- Standalone **cortext.ts** repository for TypeScript/JavaScript bindings.
- Dual-package publish layout: CJS (`require`) + ESM shim (`import`) + `.d.ts`.
- TypeScript sources for `Cortext`, config/context types, model bootstrap, and
  native N-API loader.
- `npm run vendor:prebuilds` to stage platform `cortext.node` artifacts.
- Contract and API tests via `node:test`.
- CI and npm release GitHub Actions workflows.

### Notes

- Binding version **1.2.4** tracks Cortext engine **v1.2.4**.
- Continuity: package name remains `@augmem/cortext` (same as the former
  monorepo `bindings/javascript` publish path).
