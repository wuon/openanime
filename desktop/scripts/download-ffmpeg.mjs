#!/usr/bin/env node
/**
 * Downloads a pinned ffmpeg static build for this platform into desktop/bin/.
 * Packaged builds still ship the binary via Electron Forge extraResource.
 */
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";

const VERSION = "b4.4.1";
const RELEASE_BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${VERSION}`;

/** @typedef {{ asset: string, sha256: string, binary: string }} FfmpegBuild */

/** @type {Record<string, FfmpegBuild>} */
const BUILDS = {
  "darwin-arm64": {
    asset: "darwin-arm64.gz",
    sha256: "a9f5e7b8c10cbed188a945ae893d753296a5561683af3a354ff41b42c8841e54",
    binary: "ffmpeg",
  },
  "darwin-x64": {
    asset: "darwin-x64.gz",
    sha256: "b3231bfd8304cade21bac9c9ddb2ff2aad710627d84bc985580166d6df3aa63e",
    binary: "ffmpeg",
  },
  "linux-arm64": {
    asset: "linux-arm64.gz",
    sha256: "c4633e344b2c8e8a38990821a4c27eb956425d5fabc349f526a2bd2eb3eb791c",
    binary: "ffmpeg",
  },
  "linux-x64": {
    asset: "linux-x64.gz",
    sha256: "e8eb59e6d519eef28e571111dbc200a2c58a4d17be5f3f7eac41fb066d3f1a0f",
    binary: "ffmpeg",
  },
  "win32-x64": {
    asset: "win32-x64.gz",
    sha256: "7277536c2a8cb46c7ee687e8247f906a1c8939b920ea34000e3766501e3a0bf4",
    binary: "ffmpeg.exe",
  },
};

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const binDir = path.join(desktopRoot, "bin");
const stampPath = path.join(binDir, ".ffmpeg-version");

function platformKey() {
  const arch = process.arch === "arm64" || process.arch === "x64" ? process.arch : null;
  if (!arch) return null;
  return `${process.platform}-${arch}`;
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

async function alreadyInstalled(key, binaryPath) {
  if (!existsSync(binaryPath)) return false;
  try {
    const stamp = (await readFile(stampPath, "utf8")).trim();
    return stamp === `${VERSION} ${key}`;
  } catch {
    return false;
  }
}

async function download(url, destPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`ffmpeg download failed: ${response.status} ${response.statusText} (${url})`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destPath));
}

async function main() {
  const key = platformKey();
  const build = key ? BUILDS[key] : undefined;
  if (!key || !build) {
    throw new Error(
      `No pinned ffmpeg build for ${process.platform}-${process.arch}. Add one in scripts/download-ffmpeg.mjs.`
    );
  }

  await mkdir(binDir, { recursive: true });
  const binaryPath = path.join(binDir, build.binary);
  const force = process.env.FFMPEG_FORCE === "1";

  if (!force && (await alreadyInstalled(key, binaryPath))) {
    console.log(`ffmpeg ${VERSION} (${key}) already present at ${binaryPath}`);
    return;
  }

  const archivePath = path.join(tmpdir(), `openanime-${build.asset}`);
  const tempBinaryPath = `${binaryPath}.tmp`;
  const url = `${RELEASE_BASE}/${build.asset}`;

  console.log(`Downloading ffmpeg ${VERSION} (${key})…`);
  await download(url, archivePath);

  const digest = await sha256File(archivePath);
  if (digest !== build.sha256) {
    await rm(archivePath, { force: true });
    throw new Error(
      `ffmpeg checksum mismatch for ${build.asset}\n  expected ${build.sha256}\n  got      ${digest}`
    );
  }

  await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(tempBinaryPath));
  await rm(archivePath, { force: true });
  if (process.platform !== "win32") {
    await chmod(tempBinaryPath, 0o755);
  }
  await rename(tempBinaryPath, binaryPath);
  await writeFile(stampPath, `${VERSION} ${key}\n`, "utf8");
  console.log(`Installed ffmpeg ${VERSION} → ${binaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
