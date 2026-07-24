/**
 * @augmem/cortext — TypeScript and JavaScript bindings for Cortext.
 *
 * Package root: https://github.com/augmem/cortext.ts
 * Engine: https://github.com/augmem/cortext
 */

import { loadNative } from "./load-native.js";
import type { NativeCortextConstructor } from "./types.js";

export { Cortext } from "./cortext.js";
export {
  defaultAistModelPath,
  ensureDefaultAistModelPathSync,
  ensureDefaultAssets,
  modelCacheDir,
} from "./model-bootstrap.js";
export {
  loadNative,
  platformTag,
  supportedNativeTargets,
} from "./load-native.js";
export type {
  ConsolidationState,
  CortextConfig,
  CortextContext,
  CortextEmbedding,
  CortextMemory,
  Media,
  NativeBinding,
  NativeCortext,
  NativeCortextConstructor,
  ProcessOptions,
  Retention,
} from "./types.js";

/** Engine version string from the loaded native addon. */
export function version(): string {
  return loadNative().version();
}

/** Last native error message, if any. */
export function lastError(): string {
  return loadNative().lastError();
}

/**
 * Direct access to the N-API constructor (advanced). Prefer {@link Cortext}.
 */
export function getNativeCortext(): NativeCortextConstructor {
  return loadNative().NativeCortext;
}
