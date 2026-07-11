import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { getElectronUserAgent } from "@/main/electron-user-agent";

const execFileAsync = promisify(execFile);
const IS_DEV = process.env.NODE_ENV !== "production";
const CURL_TIMEOUT_SEC = "30";

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[reanime-flix] ${event}${suffix}`);
}

async function curlRequest(
  url: string,
  referer: string,
  accept: string
): Promise<string> {
  const startedAt = Date.now();
  log("curl:start", { url: url.slice(0, 96) });

  const { stdout } = await execFileAsync(
    "curl",
    [
      "-sS",
      "-L",
      "--max-time",
      CURL_TIMEOUT_SEC,
      "-A",
      getElectronUserAgent(),
      "-H",
      `Referer: ${referer}`,
      "-H",
      `Accept: ${accept}`,
      url,
    ],
    { maxBuffer: 15 * 1024 * 1024 }
  );

  const body = stdout.toString();
  if (!body.trim()) {
    throw new Error("Flixcloud curl response was empty");
  }

  log("curl:done", { bytes: body.length, ms: Date.now() - startedAt });
  return body;
}

export async function curlFetchFlixcloudHtml(url: string, referer: string): Promise<string> {
  return curlRequest(url, referer, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
}

export async function curlFetchFlixcloudJson(
  url: string,
  referer: string
): Promise<Record<string, string>> {
  const body = await curlRequest(url, referer, "application/json");
  return JSON.parse(body) as Record<string, string>;
}

export interface CurlFetchResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * Fetch arbitrary Flixcloud CDN bytes (playlists/segments) via curl.
 * Returns status + body even for non-2xx so callers can decide on fallbacks.
 */
export async function curlFetchFlixcloud(
  url: string,
  referer: string,
  extraHeaders?: Record<string, string>
): Promise<CurlFetchResult> {
  const startedAt = Date.now();
  log("curl:bytes:start", { url: url.slice(0, 96) });

  const bodyPath = path.join(
    tmpdir(),
    `openanime-flix-${process.pid}-${randomBytes(8).toString("hex")}.bin`
  );

  const curlArgs = [
    "-sS",
    "-L",
    "--max-time",
    CURL_TIMEOUT_SEC,
    "-A",
    getElectronUserAgent(),
    "-H",
    `Referer: ${referer}`,
    "-H",
    "Accept: */*",
  ];

  if (extraHeaders) {
    for (const [key, value] of Object.entries(extraHeaders)) {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "connection" || lower === "content-length") continue;
      if (lower === "referer" || lower === "user-agent" || lower === "accept") continue;
      curlArgs.push("-H", `${key}: ${value}`);
    }
  }

  curlArgs.push("-o", bodyPath, "-w", "%{http_code}", url);

  try {
    const { stdout } = await execFileAsync("curl", curlArgs, {
      maxBuffer: 1024 * 1024,
    });
    const status = Number(String(stdout).trim());
    if (!Number.isFinite(status)) {
      throw new Error(`Flixcloud curl returned invalid status: ${String(stdout)}`);
    }

    const body = await fs.readFile(bodyPath);
    log("curl:bytes:done", {
      status,
      bytes: body.length,
      ms: Date.now() - startedAt,
    });

    return {
      status,
      headers: {
        "content-type": guessContentType(url, body),
      },
      body,
    };
  } finally {
    await fs.unlink(bodyPath).catch(() => undefined);
  }
}

function guessContentType(url: string, body: Buffer): string {
  const head = body.subarray(0, Math.min(16, body.length)).toString("utf8").trimStart();
  if (head.startsWith("#EXTM3U")) {
    return "application/vnd.apple.mpegurl";
  }
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".ts")) return "video/mp2t";
    if (pathname.endsWith(".m4s") || pathname.endsWith(".mp4")) return "video/mp4";
    if (pathname.includes(".m3u8")) return "application/vnd.apple.mpegurl";
  } catch {
    // ignore
  }
  return "application/octet-stream";
}
