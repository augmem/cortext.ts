# Changelog

All notable changes to `@augmem/cortext` (this repository: **cortext.ts**) are
documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

Requires the next `augmem/cortext.cpp` release (engine v5, per-blob content
timestamps and reference-time retrieval; `main` at `f0b681e9`). The package
version and the pinned core tag (`v1.3.3`) are unchanged until that release
exists; a `v1.3.3` addon does not implement these options.

### Breaking

- `CortextConfig.proceduralEnabled` is removed, as are the Soft Anchors
  config, stats and memory fields.
- Recalled memories are no longer trimmed to 3 KiB each: they come back whole
  unless `evidenceBudgetBytes` is set.
- `CortextMemory.content` is a list of typed payloads
  (`{ size_bytes, mimetype, base64, timestamp }`), one per stored signal.
- The engine now requires the AIST late-interaction reranker
  (`AIST-87M-LI.gguf`) whenever an AIST model is present, and throws without
  it. Provide it beside the AIST model or through `CORTEXT_LI_MODEL_PATH`.
- The release pipeline's required core symbols now include the
  `evidenceBudgetBytes`, `referenceMs` and `asOf` options, so prebuilds can no
  longer be produced from a core tag that predates them.

### Added

- `ProcessOptions.evidenceBudgetBytes`: a per-call evidence budget in bytes
  (text counts its UTF-8 bytes, every other payload 480 bytes).
- `CortextContext.standing_memory`: standing directives returned outside the
  retrieved top-k.
- `memory.modality` can be `"mixed"`; each `content` entry carries its own
  `mimetype`, and `memory.mimetype` is that of the first signal.
- `CortextMemoryContent.timestamp`: when each payload happened, in ms since
  the Unix epoch (0 when unknown).
- `ProcessOptions.referenceMs` and `ProcessOptions.asOf`: a query reference
  time; with `asOf`, memories that start after it are hidden. Only ephemeral
  (query) calls read them.
- `ensureDefaultAssets()` downloads, checksums and reassembles the LI reranker
  beside the cached AIST model (from the Git shards in `augmem/cortext.cpp` at
  `f0b681e9`); `defaultAistModelPath()` only reports a model whose reranker
  resolves. New `lateInteractionModelPath()` helper.
- Tests for each surface above, plus `processTextWithMedia` storing the text
  for empty media and keeping typed `text/*` and binary payloads.

## [1.3.3] - Unreleased

### Changed

- `1.3.3` is the first intended published package release carrying the Node
  text-media N-API wrapper and its matching six-platform prebuilds.
- Release ownership moved to the TypeScript repository's six-runner CMake
  N-API prebuild pipeline. Addons are provenance-checked against the exact
  `augmem/cortext.cpp` `v1.3.3` core tag before publishing.
- Generated prebuilds and manifests are release artifacts and are not tracked
  in the source checkout.

## [1.3.2] - Canceled pre-publish dry run

### Notes

- Validation dry runs were canceled before npm or GitHub publication while
  the core Node text-media and native build fixes were completed. No
  `@augmem/cortext@1.3.2` package or release was published.

## [1.3.1] - Canceled pre-publish dry run

### Notes

- Validation dry runs were canceled before npm or GitHub publication while
  the core Node text-media and native build fixes were completed. No
  `@augmem/cortext@1.3.1` package or release was published.

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
