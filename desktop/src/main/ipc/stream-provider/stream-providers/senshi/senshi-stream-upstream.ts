import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { getElectronUserAgent } from "@/main/electron-user-agent";
import type {
  StreamUpstreamFetchContext,
  StreamUpstreamHandler,
  StreamUpstreamMatchContext,
} from "@/main/stream-proxy-upstream";
import { isHlsPlaylistUrl } from "@/shared/utils/hls-url";
import { net } from "electron";

const execFileAsync = promisify(execFile);
const IS_DEV = process.env.NODE_ENV !== "production";
const SENSHI_REFERER = "https://senshi.live/";
const CURL_TIMEOUT_SEC = "30";
const NET_FETCH_TIMEOUT_MS = 12_000;
const RETRY_DELAY_MS = 450;

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[senshi-upstream] ${event}${suffix}`);
}

export function isSenshiCdnUrl(targetUrl: string): boolean {
  try {
    const host = new URL(targetUrl).hostname.toLowerCase();
    return host === "ninstream.com" || host.endsWith(".ninstream.com");
  } catch {
    return false;
  }
}

function normalizeSenshiReferer(_targetUrl: string, referer: string | null): string {
  const trimmed = referer?.trim();
  if (trimmed) {
    try {
      const origin = new URL(trimmed).origin;
      if (origin === "https://senshi.live" || origin === "http://senshi.live") {
        return SENSHI_REFERER;
      }
    } catch {
      // fall through
    }
  }
  return SENSHI_REFERER;
}

function buildHeaders(
  referer: string,
  incoming: Record<string, string>
): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": getElectronUserAgent(),
    Accept: incoming.Accept ?? "*/*",
    Referer: referer,
    Origin: "https://senshi.live",
  };
  if (incoming.Range) {
    headers.Range = incoming.Range;
  }
  return headers;
}

function toResponse(status: number, headers: Record<string, string>, body: Buffer): Response {
  return new Response(body, { status, headers });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialize CDN hits so we don't open a curl flock that trips CF. */
let upstreamQueue: Promise<void> = Promise.resolve();

function enqueueUpstream<T>(task: () => Promise<T>): Promise<T> {
  const run = upstreamQueue.then(task, task);
  upstreamQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function fetchViaCurl(
  targetUrl: string,
  referer: string,
  headers: Record<string, string>
): Promise<Response | null> {
  const bodyPath = path.join(
    tmpdir(),
    `openanime-senshi-${process.pid}-${randomBytes(8).toString("hex")}.bin`
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
    "Origin: https://senshi.live",
    "-H",
    "Accept: */*",
    // Keep-alive across redirects; closer to a browser than Connection: close.
    "-H",
    "Connection: keep-alive",
  ];

  if (headers.Range) {
    curlArgs.push("-H", `Range: ${headers.Range}`);
  }

  curlArgs.push("-o", bodyPath, "-w", "%{http_code}", "-D", `${bodyPath}.hdr`, targetUrl);

  try {
    log("curl:start", { targetUrl: targetUrl.slice(0, 96), ranged: Boolean(headers.Range) });
    const { stdout } = await execFileAsync("curl", curlArgs, { maxBuffer: 1024 * 1024 });
    const status = Number(String(stdout).trim());
    if (!Number.isFinite(status)) {
      throw new Error(`Senshi curl returned invalid status: ${String(stdout)}`);
    }
    const body = await fs.readFile(bodyPath);
    const headerText = await fs.readFile(`${bodyPath}.hdr`, "utf8").catch(() => "");
    const responseHeaders: Record<string, string> = {};
    for (const line of headerText.split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key && value && key !== "transfer-encoding") {
        responseHeaders[key] = value;
      }
    }
    log("curl:done", { status, bytes: body.length, targetUrl: targetUrl.slice(0, 96) });
    return toResponse(status, responseHeaders, body);
  } catch (error: unknown) {
    log("curl:failed", {
      targetUrl: targetUrl.slice(0, 96),
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    await fs.unlink(bodyPath).catch(() => undefined);
    await fs.unlink(`${bodyPath}.hdr`).catch(() => undefined);
  }
}

async function fetchViaNet(
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const timeout = AbortSignal.timeout(NET_FETCH_TIMEOUT_MS);
  const combined =
    typeof AbortSignal.any === "function"
      ? AbortSignal.any([signal, timeout])
      : timeout;
  return net.fetch(targetUrl, { headers, signal: combined });
}

async function fetchSenshiUpstream(ctx: StreamUpstreamFetchContext): Promise<Response> {
  return enqueueUpstream(async () => {
    const referer = normalizeSenshiReferer(ctx.targetUrl, ctx.referer);
    const isPlaylist = isHlsPlaylistUrl(ctx.targetUrl);
    // Never send Range on playlists — CF frequently 403s them.
    const baseHeaders = buildHeaders(referer, {
      Accept: ctx.headers.Accept ?? "*/*",
      ...(isPlaylist ? {} : ctx.headers.Range ? { Range: ctx.headers.Range } : {}),
    });

    log("fetch:start", { targetUrl: ctx.targetUrl.slice(0, 96), playlist: isPlaylist });

    let viaCurl = await fetchViaCurl(ctx.targetUrl, referer, baseHeaders);
    if (viaCurl && viaCurl.status < 400) {
      return viaCurl;
    }

    // One quiet retry without Range — recovers many intermittent CF 403s.
    if (viaCurl?.status === 403 || viaCurl == null) {
      log("curl:retry", { targetUrl: ctx.targetUrl.slice(0, 96), afterMs: RETRY_DELAY_MS });
      await sleep(RETRY_DELAY_MS);
      const retryHeaders = { ...baseHeaders };
      delete retryHeaders.Range;
      viaCurl = await fetchViaCurl(ctx.targetUrl, referer, retryHeaders);
      if (viaCurl && viaCurl.status < 400) {
        return viaCurl;
      }
    }

    if (viaCurl) {
      log("curl:non-ok", { status: viaCurl.status, targetUrl: ctx.targetUrl.slice(0, 96) });
      // Don't immediately hammer with net.fetch on a definitive 403 — that doubles CF hits.
      if (viaCurl.status === 403 || viaCurl.status === 429) {
        return viaCurl;
      }
    }

    try {
      const response = await fetchViaNet(ctx.targetUrl, baseHeaders, ctx.signal);
      if (response.status < 400) {
        return response;
      }
      log("net:non-ok", { status: response.status, targetUrl: ctx.targetUrl.slice(0, 96) });
      if (viaCurl) return viaCurl;
      return response;
    } catch (error: unknown) {
      log("net:failed", {
        targetUrl: ctx.targetUrl.slice(0, 96),
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (viaCurl) return viaCurl;
    return fetch(ctx.targetUrl, { headers: baseHeaders, signal: ctx.signal });
  });
}

export const senshiStreamUpstreamHandler: StreamUpstreamHandler = {
  matches(ctx: StreamUpstreamMatchContext): boolean {
    return isSenshiCdnUrl(ctx.targetUrl);
  },
  normalizeReferer: normalizeSenshiReferer,
  fetch: fetchSenshiUpstream,
};

/** Fetch a Senshi CDN playlist body (used at resolve-time to list qualities). */
export async function fetchSenshiPlaylistText(url: string): Promise<string> {
  const response = await fetchSenshiUpstream({
    targetUrl: url,
    referer: SENSHI_REFERER,
    headers: { Accept: "*/*" },
    signal: AbortSignal.timeout(NET_FETCH_TIMEOUT_MS),
  });
  if (response.status >= 400) {
    throw new Error(`Senshi playlist fetch failed (${response.status})`);
  }
  return response.text();
}
