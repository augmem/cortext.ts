# Changelog

All notable changes to `@augmem/cortext` (this repository: **cortext.ts**) are
documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

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
