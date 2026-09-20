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

const VERSION = "b6.1.1";
const RELEASE_BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${VERSION}`;

/** @typedef {{ asset: string, sha256: string, binary: string }} FfmpegBuild */

/** @type {Record<string, FfmpegBuild>} */
const BUILDS = {
  "darwin-arm64": {
    asset: "ffmpeg-darwin-arm64.gz",
    sha256: "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa",
    binary: "ffmpeg",
  },
  "darwin-x64": {
    asset: "ffmpeg-darwin-x64.gz",
    sha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106",
    binary: "ffmpeg",
  },
  "linux-arm64": {
    asset: "ffmpeg-linux-arm64.gz",
    sha256: "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0",
    binary: "ffmpeg",
  },
  "linux-x64": {
    asset: "ffmpeg-linux-x64.gz",
    sha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa",
    binary: "ffmpeg",
  },
  "win32-x64": {
    asset: "ffmpeg-win32-x64.gz",
    sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77",
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
