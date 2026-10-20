#!/usr/bin/env node
/** Verify a remote GitHub tag resolves to the immutable release checkout. */
import { assertGitTag, assertCommit } from "./prebuilds-common.mjs";

function parseArgs(argv) {
  const args = {
    repository: process.env.GITHUB_REPOSITORY ?? "",
    tag: process.env.RELEASE_TAG ?? "",
    commit: process.env.RELEASE_COMMIT ?? "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--repository") args.repository = argv[++i] ?? "";
    else if (arg === "--tag") args.tag = argv[++i] ?? "";
    else if (arg === "--commit") args.commit = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: verify-github-tag.mjs --repository <owner/repo> --tag <tag> --commit <sha>");
      process.exit(0);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`GitHub API ${response.status}: ${body.message ?? "request failed"}`);
  return body;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(args.repository)) throw new Error("repository must be owner/name");
  const tag = assertGitTag(args.tag, "release tag");
  assertCommit(args.commit, "release commit");
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
  const base = `https://api.github.com/repos/${args.repository}`;
  const ref = await getJson(`${base}/git/ref/tags/${encodeURIComponent(tag)}`, token);
  let commit = ref.object?.sha;
  if (ref.object?.type === "tag") {
    const annotated = await getJson(`${base}/git/tags/${encodeURIComponent(commit)}`, token);
    commit = annotated.object?.sha;
  }
  if (ref.object?.type !== "commit" && ref.object?.type !== "tag") throw new Error("release ref is not a commit or annotated tag");
  assertCommit(commit, "remote release commit");
  if (commit !== args.commit) throw new Error(`remote tag ${tag} points to ${commit}, expected ${args.commit}`);
  console.log(`verified ${args.repository}@${tag} -> ${commit}`);
}

main().catch((error) => {
  console.error(`verify-github-tag failed: ${error.message}`);
  process.exitCode = 1;
});
