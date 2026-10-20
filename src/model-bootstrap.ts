import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";

// CJS emit provides __dirname. ESM loads through the CJS re-export shim.
declare const __dirname: string;

const AIST_REPO = "augmem/AIST-87M-GGUF";
const AIST_REVISION = "main";
const AIST_MODEL_FILE = {
  filename: "AIST-87M_q8_0.gguf",
  sha256: "bf4c49954eccc65183f1a97e44606e86c7ee5a4fea500457124b687a3ec97898",
  size: 141_491_936,
} as const;

const TOKENIZER_REPO = "bert-base-uncased";
const TOKENIZER_REVISION = "main";
const TOKENIZER_FILE = {
  filename: "vocab.txt",
  target: path.join("mdbr-leaf-ir", "vocab.txt"),
  sha256: "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3",
  size: 231_508,
} as const;

// The AIST late-interaction reranker. The engine requires it whenever an AIST
// model is present: it reads CORTEXT_LI_MODEL_PATH, else AIST-87M-LI.gguf
// beside the AIST model. It is not on the Hugging Face model repo; it ships as
// Git shards in augmem/cortext.cpp (models/manifest.json), fetched here from an
// immutable commit and reassembled without re-sharding.
const LI_SOURCE_REPO = "augmem/cortext.cpp";
const LI_SOURCE_COMMIT = "f0b681e97450a4955458d0f4b140f58d15bba650";
const LI_MODEL_FILE = {
  filename: "AIST-87M-LI.gguf",
  sha256: "e5fc69ab84fbfe826a4730346b9a9315f12dc1e11767c66d5bc38557ef4290a4",
  size: 410_848,
  chunks: [
    {
      filename: "models/AIST-87M-GGUF/chunks/AIST-87M-LI.gguf.part-000",
      sha256:
        "e5fc69ab84fbfe826a4730346b9a9315f12dc1e11767c66d5bc38557ef4290a4",
    },
  ],
} as const;

const DOWNLOAD_TIMEOUT_MS = 60_000;

function packageRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function hfUrl(repo: string, revision: string, filename: string): string {
  return `https://huggingface.co/${repo}/resolve/${revision}/${filename}?download=1`;
}

function sha256File(filePath: string): string {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(filePath));
  return digest.digest("hex");
}

function verifyFile(
  filePath: string,
  expectedSha256: string,
  expectedSize: number
): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const stat = fs.statSync(filePath);
  return (
    stat.isFile() &&
    stat.size === expectedSize &&
    sha256File(filePath) === expectedSha256
  );
}

export function modelCacheDir(): string {
  if (process.env.CORTEXT_MODEL_CACHE_DIR) {
    return path.resolve(process.env.CORTEXT_MODEL_CACHE_DIR);
  }

  let root: string;
  if (process.platform === "win32") {
    root =
      process.env.LOCALAPPDATA ||
      process.env.APPDATA ||
      path.join(os.homedir(), "AppData", "Local");
  } else if (process.platform === "darwin") {
    root = path.join(os.homedir(), "Library", "Caches");
  } else {
    root = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  }

  return path.join(root, "augmem", "cortext", "models");
}

function githubRawUrl(repo: string, commit: string, filename: string): string {
  return `https://raw.githubusercontent.com/${repo}/${commit}/${filename}`;
}

/**
 * Path the engine resolves the late-interaction reranker from for an AIST
 * model: CORTEXT_LI_MODEL_PATH when set, else AIST-87M-LI.gguf beside it.
 */
export function lateInteractionModelPath(aistModel: string): string {
  const override = process.env.CORTEXT_LI_MODEL_PATH;
  if (override) {
    return path.resolve(override);
  }
  return path.join(path.dirname(aistModel), LI_MODEL_FILE.filename);
}

function aistModelPath(dir: string): string | undefined {
  const candidates = [
    path.join(dir, "AIST-87M-GGUF", "AIST-87M_q8_0.gguf"),
    path.join(dir, "AIST-87M-GGUF", "AIST-87M_q5_1.gguf"),
  ];
  // An AIST model without its reranker makes the engine throw, so a model
  // directory only counts when the reranker resolves too.
  return candidates.find(
    (candidate) =>
      fs.existsSync(candidate) &&
      fs.existsSync(lateInteractionModelPath(candidate))
  );
}

function cachedDefaultAistModelPath(): string | undefined {
  const cacheRoot = modelCacheDir();
  const modelPath = path.join(
    cacheRoot,
    "AIST-87M-GGUF",
    AIST_MODEL_FILE.filename
  );
  const tokenizerPath = path.join(cacheRoot, TOKENIZER_FILE.target);
  if (
    verifyFile(modelPath, AIST_MODEL_FILE.sha256, AIST_MODEL_FILE.size) &&
    verifyFile(tokenizerPath, TOKENIZER_FILE.sha256, TOKENIZER_FILE.size) &&
    // An explicit CORTEXT_LI_MODEL_PATH is the caller's file; only the cached
    // copy is checked against the pinned digest.
    (process.env.CORTEXT_LI_MODEL_PATH
      ? fs.existsSync(lateInteractionModelPath(modelPath))
      : verifyFile(
          lateInteractionModelPath(modelPath),
          LI_MODEL_FILE.sha256,
          LI_MODEL_FILE.size
        ))
  ) {
    return modelPath;
  }
  return undefined;
}

/**
 * Prefer package/repo/cache models when present. Does not force a download:
 * default release natives embed AIST and assemble at load.
 */
export function defaultAistModelPath(): string | undefined {
  const packageModel = aistModelPath(path.join(packageRoot(), "models"));
  if (packageModel) {
    return packageModel;
  }
  // Sibling monorepo checkout
  const repoModel = aistModelPath(
    path.join(packageRoot(), "..", "cortext", "models")
  );
  if (repoModel) {
    return repoModel;
  }
  return cachedDefaultAistModelPath();
}

export function ensureDefaultAistModelPathSync(): string | undefined {
  return defaultAistModelPath();
}

function requestToFile(
  url: string,
  dest: string,
  redirectCount = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(
        new Error(`too many redirects while downloading ${path.basename(dest)}`)
      );
      return;
    }

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = path.join(
      path.dirname(dest),
      `.${path.basename(dest)}.${process.pid}.${Date.now()}.tmp`
    );
    const headers: Record<string, string> = {
      "User-Agent": "cortext.ts-model-bootstrap/1.0",
    };
    const token = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const cleanup = (): void => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // Best effort cleanup after failed downloads.
      }
    };

    const req = https.get(url, { headers }, (res) => {
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        typeof res.headers.location === "string"
      ) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        requestToFile(nextUrl, dest, redirectCount + 1).then(resolve, reject);
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        cleanup();
        reject(
          new Error(
            `HTTP ${res.statusCode} while downloading ${path.basename(dest)}`
          )
        );
        return;
      }

      const out = fs.createWriteStream(tmp);
      res.pipe(out);
      out.on("finish", () => {
        out.close(() => {
          fs.renameSync(tmp, dest);
          resolve();
        });
      });
      out.on("error", (err) => {
        cleanup();
        reject(err);
      });
    });

    req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      req.destroy(
        new Error(`timeout while downloading ${path.basename(dest)}`)
      );
    });
    req.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

async function ensureVerifiedFile(
  url: string,
  dest: string,
  expectedSha256: string,
  expectedSize: number
): Promise<void> {
  if (verifyFile(dest, expectedSha256, expectedSize)) {
    return;
  }
  await requestToFile(url, dest);
  const stat = fs.statSync(dest);
  const actualSha256 = sha256File(dest);
  if (stat.size !== expectedSize) {
    throw new Error(
      `${path.basename(dest)} has size ${stat.size}, expected ${expectedSize}`
    );
  }
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `${path.basename(dest)} has sha256 ${actualSha256}, expected ${expectedSha256}`
    );
  }
}

/**
 * Download every chunk of a Git-sharded asset, check each chunk's digest,
 * concatenate them in order and check the whole file.
 */
async function ensureVerifiedChunkedFile(
  repo: string,
  commit: string,
  chunks: ReadonlyArray<{ filename: string; sha256: string }>,
  dest: string,
  expectedSha256: string,
  expectedSize: number
): Promise<void> {
  if (verifyFile(dest, expectedSha256, expectedSize)) {
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const parts: string[] = [];
  const assembled = path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.${process.pid}.${Date.now()}.assembling`
  );
  try {
    for (const [index, chunk] of chunks.entries()) {
      const part = `${assembled}.part-${String(index).padStart(3, "0")}`;
      parts.push(part);
      await requestToFile(githubRawUrl(repo, commit, chunk.filename), part);
      const actual = sha256File(part);
      if (actual !== chunk.sha256) {
        throw new Error(
          `${path.basename(chunk.filename)} has sha256 ${actual}, expected ${chunk.sha256}`
        );
      }
    }
    fs.writeFileSync(assembled, Buffer.concat(parts.map((p) => fs.readFileSync(p))));
    if (!verifyFile(assembled, expectedSha256, expectedSize)) {
      throw new Error(
        `${path.basename(dest)} reassembled from ${chunks.length} chunk(s) does not match sha256 ${expectedSha256} and size ${expectedSize}`
      );
    }
    fs.renameSync(assembled, dest);
  } finally {
    for (const leftover of [...parts, assembled]) {
      fs.rmSync(leftover, { force: true });
    }
  }
}

/**
 * Explicit download of the default AIST model, its late-interaction reranker
 * (AIST-87M-LI.gguf, placed beside it) and the tokenizer into the user cache.
 * With CORTEXT_LI_MODEL_PATH set, the reranker is read from there instead and
 * must already exist.
 */
export async function ensureDefaultAssets(): Promise<string> {
  const cacheRoot = modelCacheDir();
  const modelPath = path.join(
    cacheRoot,
    "AIST-87M-GGUF",
    AIST_MODEL_FILE.filename
  );
  const tokenizerPath = path.join(cacheRoot, TOKENIZER_FILE.target);
  await ensureVerifiedFile(
    hfUrl(AIST_REPO, AIST_REVISION, AIST_MODEL_FILE.filename),
    modelPath,
    AIST_MODEL_FILE.sha256,
    AIST_MODEL_FILE.size
  );
  await ensureVerifiedFile(
    hfUrl(TOKENIZER_REPO, TOKENIZER_REVISION, TOKENIZER_FILE.filename),
    tokenizerPath,
    TOKENIZER_FILE.sha256,
    TOKENIZER_FILE.size
  );
  const liPath = lateInteractionModelPath(modelPath);
  if (process.env.CORTEXT_LI_MODEL_PATH) {
    if (!fs.existsSync(liPath)) {
      throw new Error(`CORTEXT_LI_MODEL_PATH does not exist: ${liPath}`);
    }
  } else {
    await ensureVerifiedChunkedFile(
      LI_SOURCE_REPO,
      LI_SOURCE_COMMIT,
      LI_MODEL_FILE.chunks,
      liPath,
      LI_MODEL_FILE.sha256,
      LI_MODEL_FILE.size
    );
  }
  return modelPath;
}
