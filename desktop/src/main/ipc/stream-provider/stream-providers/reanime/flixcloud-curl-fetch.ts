import { execFile } from "node:child_process";
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
