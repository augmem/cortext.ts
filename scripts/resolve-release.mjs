#!/usr/bin/env node
/** Resolve and validate an immutable binding release checkout for GitHub Actions. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertReleaseVersion, assertVersionTag } from "./prebuilds-common.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLACEHOLDER = "REPLACE_WITH_MATCHING_CORE_TAG";

function capture(command, args) {
  return execFileSync(command, args, { cwd: root, encoding: "utf8" }).trim();
}

function output(values) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required in release workflows");
  for (const [key, value] of Object.entries(values)) {
    if (!/^[a-z_]+$/.test(key) || !/^[^\r\n]+$/.test(value)) {
      throw new Error(`unsafe workflow output ${key}`);
    }
    fs.appendFileSync(outputPath, `${key}=${value}\n`, "utf8");
  }
}

function main() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const version = assertReleaseVersion(packageJson.version);
  const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  if (lock.version !== version || lock.packages?.["" ]?.version !== version) {
    throw new Error(`package-lock version does not match package.json ${version}`);
  }

  const inputTag = process.env.INPUT_TAG ?? "";
  const eventTag = process.env.GITHUB_REF_TYPE === "tag" ? (process.env.GITHUB_REF_NAME ?? "") : "";
  const tag = inputTag || eventTag || `v${version}`;
  assertVersionTag(tag, "binding release tag");
  if (tag !== `v${version}`) {
    throw new Error(`release tag ${tag} must exactly match package.json version v${version}`);
  }

  const inputCoreTag = process.env.INPUT_CORE_TAG ?? "";
  const coreTag = inputCoreTag && inputCoreTag !== PLACEHOLDER ? inputCoreTag :
    (eventTag ? `v${version}` : "");
  assertVersionTag(coreTag, "core tag");

  const checkoutSha = capture("git", ["rev-parse", "HEAD"]);
  if (!/^[a-f0-9]{40}$/.test(checkoutSha)) throw new Error(`invalid checkout SHA ${checkoutSha}`);
  // A tag ref checked out by actions/checkout must resolve to the same commit.
  // Manual dispatch from a branch is allowed to resolve here; the publish job
  // independently verifies that the release tag exists at this SHA before npm.
  try {
    const tagSha = capture("git", ["rev-parse", `${tag}^{commit}`]);
    if (tagSha !== checkoutSha) throw new Error(`tag ${tag} resolves to ${tagSha}, checkout is ${checkoutSha}`);
  } catch (error) {
    if (eventTag || inputTag) throw error;
  }

  output({ tag, version, core_tag: coreTag, checkout_sha: checkoutSha });
  console.log(`binding=${tag} version=${version} core=${coreTag} checkout=${checkoutSha}`);
}

try {
  main();
} catch (error) {
  console.error(`resolve-release failed: ${error.message}`);
  process.exitCode = 1;
}
