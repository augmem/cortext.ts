import { createRequire } from "node:module";
import path from "node:path";
import type { NativeBinding } from "./types.js";

// CJS emit provides __dirname / __filename. ESM consumers load via the
// generated re-export shim that createRequire()'s the CJS build.
declare const __dirname: string;
declare const __filename: string;

const nodeRequire = createRequire(__filename);

const SUPPORTED_NATIVE_TARGETS = new Set([
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64",
  "win32-arm64",
  "win32-x64",
]);

export function platformTag(): string {
  return `${process.platform}-${process.arch}`;
}

export function supportedNativeTargets(): string[] {
  return [...SUPPORTED_NATIVE_TARGETS].sort();
}

/**
 * Resolve package root (directory that holds prebuilds/).
 * Compiled output lives in dist/cjs or dist/esm → walk up two levels.
 */
function packageRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function candidatePaths(): string[] {
  const root = packageRoot();
  const tag = platformTag();
  return [
    process.env.CORTEXT_NODE_ADDON_PATH,
    SUPPORTED_NATIVE_TARGETS.has(tag)
      ? path.join(root, "prebuilds", tag, "cortext.node")
      : null,
    // Dev: monorepo sibling checkout (augmem/cortext/bindings/javascript)
    path.join(
      root,
      "..",
      "cortext",
      "bindings",
      "javascript",
      "prebuilds",
      tag,
      "cortext.node"
    ),
    path.join(root, "cortext.node"),
    path.join(
      root,
      "..",
      "cortext",
      "build",
      "ffi-release",
      "bindings",
      "javascript",
      "cortext.node"
    ),
  ].filter((p): p is string => Boolean(p));
}

let cached: NativeBinding | null = null;

/**
 * Load the platform N-API addon. Cached after first successful load.
 */
export function loadNative(): NativeBinding {
  if (cached) {
    return cached;
  }

  const candidates = candidatePaths();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      const binding = nodeRequire(candidate) as NativeBinding;
      if (
        !binding ||
        typeof binding.NativeCortext !== "function" ||
        typeof binding.version !== "function"
      ) {
        throw new Error(`invalid native binding shape at ${candidate}`);
      }
      cached = binding;
      return binding;
    } catch (err) {
      lastError = err;
    }
  }

  const tried = candidates.map((c) => `  - ${c}`).join("\n");
  const detail =
    lastError instanceof Error && lastError.message
      ? `\nLast error: ${lastError.message}`
      : lastError
        ? `\nLast error: ${String(lastError)}`
        : "";
  throw new Error(
    `Could not load cortext Node addon for ${platformTag()}. ` +
      `Bundled packages support: ${supportedNativeTargets().join(", ")}.\n` +
      `Tried:\n${tried}${detail}\n` +
      `Hint: run \`npm run vendor:prebuilds\` or set CORTEXT_NODE_ADDON_PATH.`
  );
}
