/**
 * Local HTTP proxy that fetches stream URLs with a Referer header
 * so the renderer can play them in a <video> element.
 */
import { spawn } from "child_process";
import { createHash } from "crypto";
import { accessSync, constants, createReadStream } from "fs";
import { mkdir, rename, stat, unlink } from "fs/promises";
import type { IncomingMessage, ServerResponse } from "http";
import http from "http";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { URL } from "url";

import { getElectronUserAgent } from "@/main/electron-user-agent";

let server: http.Server | null = null;
let proxyPort = 0;
const IS_DEV = process.env.NODE_ENV !== "production";
const IS_WINDOWS = process.platform === "win32";
const FFMPEG_BINARY = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
let resolvedFfmpegPath = resolveFfmpegPath();
const transcodeCacheDir = path.join(tmpdir(), "openanime-transcode-cache");
const transcodeJobs = new Map<string, Promise<string>>();
const transcodeProgress = new Map<string, TranscodeProgressSnapshot>();
const TRANSCODE_MAX_ATTEMPTS = 3;
const TRANSCODE_RETRY_DELAYS_MS = [1200, 2500];

function getInputPermissiveHlsArgs(): string[] {
  const args = [
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto,data",
    "-allowed_extensions",
    "ALL",
  ];
  if (IS_WINDOWS) {
    // Allow HLS segments fetched through our local proxy path (/stream), which has no extension.
    args.push("-extension_picky", "0");
    args.push("-allowed_segment_extensions", "ALL");
  }
  return args;
}

export interface TranscodeProgressSnapshot {
  state: "idle" | "running" | "done" | "error";
  progressPercent: number | null;
  message: string;
}

interface TranscodeFailureDetails {
  message: string;
  stderr: string;
  exitCode: number | null;
}

export function startStreamProxy(): Promise<number> {
  if (server) return Promise.resolve(proxyPort);

  return new Promise((resolve) => {
    server = http.createServer(handleStreamRequest);
    server.listen(0, "127.0.0.1", () => {
      const addr = server?.address();
      proxyPort = typeof addr === "object" && addr ? addr.port : 0;
      resolve(proxyPort);
    });
  });
}

export function getStreamProxyPort(): number {
  return proxyPort;
}

export function getStreamProxyBaseUrl(): string {
  return `http://127.0.0.1:${proxyPort}`;
}

export async function prepareTranscodedStream(
  inputUrl: string,
  targetUrl: string,
  referer: string | null
) {
  if (!resolvedFfmpegPath) {
    resolvedFfmpegPath = resolveFfmpegPath();
  }
  if (!resolvedFfmpegPath) {
    throw new Error("ffmpeg binary unavailable");
  }
  await ensureTranscodedFile(inputUrl, targetUrl, referer);
}

export function getTranscodeProgress(targetUrl: string): TranscodeProgressSnapshot {
  const key = getTranscodeCacheKey(targetUrl);
  const existing = transcodeProgress.get(key);
  if (existing) return existing;
  return { state: "idle", progressPercent: null, message: "Waiting to start..." };
}

function handleStreamRequest(req: IncomingMessage, res: ServerResponse): void {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }

  const parsed = new URL(req.url ?? "", `http://127.0.0.1`);
  if (parsed.pathname !== "/stream") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const targetUrl = parsed.searchParams.get("url");
  const referer = parsed.searchParams.get("referer");
  const shouldTranscode = parsed.searchParams.get("transcode") === "1";

  if (!targetUrl) {
    res.writeHead(400);
    res.end("Missing url parameter");
    return;
  }

  const range = req.headers.range;
  const headers: Record<string, string> = {
    "User-Agent": getElectronUserAgent(),
    Accept: req.headers.accept ?? "*/*",
  };
  if (referer && referer.trim().length > 0) {
    headers.Referer = referer;
    try {
      headers.Origin = new URL(referer).origin;
    } catch {
      // ignore invalid referer
    }
  }
  if (range) headers.Range = range;

  if (shouldTranscode) {
    const localProxyInputUrl = `${getStreamProxyBaseUrl()}/stream?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer ?? "")}`;
    handleTranscodeRequest(req, res, localProxyInputUrl, targetUrl, referer);
    return;
  }

  const ac = new AbortController();
  const onClientGone = () => ac.abort();
  req.once("aborted", onClientGone);
  res.once("close", onClientGone);

  fetch(targetUrl, { headers, signal: ac.signal })
    .then(async (fetchRes) => {
      const status = fetchRes.status;
      if (IS_DEV && status >= 400) {
        console.warn("[stream-proxy] upstream non-OK", {
          status,
          targetUrl,
          referer: referer ?? null,
        });
      }
      const resHeaders: Record<string, string> = {};
      fetchRes.headers.forEach((v, k) => {
        const lower = k.toLowerCase();
        if (lower !== "transfer-encoding" && lower !== "connection" && lower !== "content-length") {
          resHeaders[k] = v;
        }
      });

      if (isHlsManifestResponse(targetUrl, fetchRes.headers.get("content-type"))) {
        const manifestBody = await fetchRes.text();
        const rewrittenBody = rewriteHlsManifest(
          manifestBody,
          targetUrl,
          referer,
          getStreamProxyBaseUrl()
        );
        resHeaders["content-type"] = "application/vnd.apple.mpegurl; charset=utf-8";
        res.writeHead(status === 206 ? 206 : status, resHeaders);
        res.end(rewrittenBody);
        return;
      }

      res.writeHead(status === 206 ? 206 : status, resHeaders);
      const body = fetchRes.body;
      if (!body) {
        res.end();
        return;
      }
      const nodeStream = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
      try {
        await pipeline(nodeStream, res);
      } catch (err: unknown) {
        // Client closed (seek, buffer trim, new Range) or upstream ended early — not fatal.
        if (isBenignStreamError(err)) return;
        if (!res.headersSent) {
          res.writeHead(502);
          res.end(String(err instanceof Error ? err.message : "Proxy error"));
        } else if (!res.writableEnded) {
          res.destroy();
        }
      }
    })
    .catch((err: unknown) => {
      if (ac.signal.aborted || isBenignStreamError(err)) return;
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(String(err instanceof Error ? err.message : "Proxy error"));
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
}

function handleTranscodeRequest(
  req: IncomingMessage,
  res: ServerResponse,
  inputUrl: string,
  targetUrl: string,
  referer: string | null
): void {
  if (!resolvedFfmpegPath) {
    resolvedFfmpegPath = resolveFfmpegPath();
  }

  if (!resolvedFfmpegPath) {
    res.writeHead(500);
    res.end("ffmpeg binary unavailable");
    return;
  }

  const parsedRange = parseByteRange(req.headers.range);
  const hasNonZeroRangeStart = parsedRange !== null && parsedRange.start > 0;

  void findExistingTranscodedFile(targetUrl)
    .then(async (cachedPath) => {
      // Best path: already transcoded, supports full duration + seeking.
      if (cachedPath) {
        await serveFileWithRange(req, res, cachedPath);
        return;
      }

      // For true seek requests (non-zero byte offset), block until a seekable file exists.
      // Many players issue Range: bytes=0-... during startup/metadata load; do not block those.
      if (hasNonZeroRangeStart) {
        const filePath = await ensureTranscodedFile(inputUrl, targetUrl, referer);
        await serveFileWithRange(req, res, filePath);
        return;
      }

      // Hybrid: start playback immediately while building cache in background.
      void ensureTranscodedFile(inputUrl, targetUrl, referer).catch((err: unknown) => {
        if (isBenignStreamError(err)) return;
        if (!IS_DEV) return;
        console.warn("[stream-proxy] background transcode failed", {
          ffmpegPath: resolvedFfmpegPath,
          inputUrl,
          targetUrl,
          referer: referer ?? null,
          message: err instanceof Error ? err.message : String(err),
        });
      });
      streamLiveTranscode(req, res, inputUrl, targetUrl, referer);
    })
    .catch((err: unknown) => {
      if (isBenignStreamError(err)) return;
      if (IS_DEV) {
        console.warn("[stream-proxy] transcode failed", {
          ffmpegPath: resolvedFfmpegPath,
          inputUrl,
          targetUrl,
          referer: referer ?? null,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(String(err instanceof Error ? err.message : "Transcode failed"));
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
}

function parseByteRange(
  rangeHeader: string | string[] | undefined
): { start: number; end: number | null } | null {
  if (typeof rangeHeader !== "string") return null;
  const trimmed = rangeHeader.trim();
  if (!trimmed) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(trimmed);
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : null;
  if (!Number.isFinite(start) || start < 0) return null;
  if (end !== null && (!Number.isFinite(end) || end < 0)) return null;
  return { start, end };
}

function streamLiveTranscode(
  req: IncomingMessage,
  res: ServerResponse,
  inputUrl: string,
  targetUrl: string,
  referer: string | null
): void {
  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    IS_DEV ? "warning" : "error",
    ...getInputPermissiveHlsArgs(),
    "-i",
    inputUrl,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-profile:a",
    "aac_low",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-f",
    "mp4",
    "pipe:1",
  ];

  const ffmpeg = spawn(resolvedFfmpegPath, ffmpegArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stopFfmpeg = () => {
    if (!ffmpeg.killed) {
      ffmpeg.kill("SIGKILL");
    }
  };
  req.once("aborted", stopFfmpeg);
  res.once("close", stopFfmpeg);

  let stderrTail = "";
  ffmpeg.stderr.on("data", (chunk) => {
    if (!IS_DEV) return;
    stderrTail += String(chunk);
    if (stderrTail.length > 2400) {
      stderrTail = stderrTail.slice(-2400);
    }
  });

  res.setHeader("content-type", "video/mp4");
  res.setHeader("cache-control", "no-store");
  ffmpeg.stdout.pipe(res);

  ffmpeg.on("error", (err) => {
    if (IS_DEV) {
      console.warn("[stream-proxy] ffmpeg spawn error", {
        ffmpegPath: resolvedFfmpegPath,
        targetUrl,
        referer: referer ?? null,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`ffmpeg spawn failed: ${String(err)}`);
    } else if (!res.writableEnded) {
      res.destroy();
    }
  });

  ffmpeg.on("close", (code, signal) => {
    if (IS_DEV && code !== 0) {
      console.warn("[stream-proxy] ffmpeg live transcode exited non-zero", {
        code,
        signal: signal ?? null,
        ffmpegPath: resolvedFfmpegPath,
        inputUrl,
        targetUrl,
        referer: referer ?? null,
        stderr: stderrTail || null,
      });
    }
    if (!res.writableEnded) {
      res.end();
    }
  });
}

async function ensureTranscodedFile(
  inputUrl: string,
  targetUrl: string,
  referer: string | null
): Promise<string> {
  const key = getTranscodeCacheKey(targetUrl);
  const finalPath = path.join(transcodeCacheDir, `${key}.mp4`);

  const existing = await findExistingTranscodedFile(targetUrl);
  if (existing) {
    transcodeProgress.set(key, {
      state: "done",
      progressPercent: 100,
      message: "Transcode complete",
    });
    return existing;
  }

  const inFlight = transcodeJobs.get(key);
  if (inFlight !== undefined) return inFlight;

  transcodeProgress.set(key, {
    state: "running",
    progressPercent: 0,
    message: "Starting transcode...",
  });

  const job = transcodeToFileWithRetry(inputUrl, targetUrl, referer, finalPath).finally(() => {
    transcodeJobs.delete(key);
  });
  transcodeJobs.set(key, job);
  return job;
}

async function transcodeToFileWithRetry(
  inputUrl: string,
  targetUrl: string,
  referer: string | null,
  finalPath: string
): Promise<string> {
  const key = getTranscodeCacheKey(targetUrl);
  let attempt = 1;
  while (attempt <= TRANSCODE_MAX_ATTEMPTS) {
    transcodeProgress.set(key, {
      state: "running",
      progressPercent: 0,
      message:
        attempt > 1
          ? `Retrying transcode (${String(attempt)}/${String(TRANSCODE_MAX_ATTEMPTS)})...`
          : "Starting transcode...",
    });
    try {
      return await transcodeToFile(inputUrl, targetUrl, referer, finalPath);
    } catch (err: unknown) {
      const details = getTranscodeFailureDetails(err);
      const retryable = isRetryableTranscodeFailure(details);
      const canRetry = retryable && attempt < TRANSCODE_MAX_ATTEMPTS;
      if (!canRetry) throw err;
      const delayMs = TRANSCODE_RETRY_DELAYS_MS[attempt - 1] ?? 2500;
      transcodeProgress.set(key, {
        state: "running",
        progressPercent: null,
        message: `Upstream stream failed (${details.exitCode ?? "error"}). Retrying...`,
      });
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

async function findExistingTranscodedFile(targetUrl: string): Promise<string | null> {
  const key = getTranscodeCacheKey(targetUrl);
  const finalPath = path.join(transcodeCacheDir, `${key}.mp4`);
  try {
    const s = await stat(finalPath);
    if (s.isFile() && s.size > 0) return finalPath;
  } catch {
    // Cache miss.
  }
  return null;
}

async function transcodeToFile(
  inputUrl: string,
  targetUrl: string,
  referer: string | null,
  finalPath: string
): Promise<string> {
  if (!resolvedFfmpegPath) {
    resolvedFfmpegPath = resolveFfmpegPath();
  }
  if (!resolvedFfmpegPath) {
    throw new Error("ffmpeg binary unavailable");
  }
  const key = getTranscodeCacheKey(targetUrl);
  const partialPath = `${finalPath}.partial`;
  try {
    await unlink(partialPath);
  } catch {
    // ignore
  }

  await mkdir(transcodeCacheDir, { recursive: true });

  const ffmpegArgs = [
    "-hide_banner",
    "-loglevel",
    "info",
    "-nostats",
    "-progress",
    "pipe:2",
    ...getInputPermissiveHlsArgs(),
    "-i",
    inputUrl,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-profile:a",
    "aac_low",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-y",
    partialPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const ffmpeg = spawn(resolvedFfmpegPath, ffmpegArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });

    let stderrTail = "";
    let totalDurationSeconds: number | null = null;
    let progressOutTimeSeconds = 0;

    const updateProgress = (percent: number | null, message: string) => {
      transcodeProgress.set(key, {
        state: "running",
        progressPercent: percent,
        message,
      });
    };

    const updatePercentFromOutTime = () => {
      if (totalDurationSeconds == null || totalDurationSeconds <= 0) return;
      if (!Number.isFinite(progressOutTimeSeconds) || progressOutTimeSeconds < 0) return;
      const rawPercent = (progressOutTimeSeconds / totalDurationSeconds) * 100;
      const bounded = Math.max(0, Math.min(99.5, rawPercent));
      updateProgress(Math.floor(bounded * 10) / 10, "Transcoding video...");
    };

    const parseDurationToSeconds = (raw: string): number | null => {
      const match = /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(raw);
      if (!match) return null;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds))
        return null;
      return hours * 3600 + minutes * 60 + seconds;
    };

    ffmpeg.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderrTail += text;
      if (stderrTail.length > 5000) {
        stderrTail = stderrTail.slice(-5000);
      }

      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        if (!line) continue;

        const durationMatch = /Duration:\s*(\d{2}:\d{2}:\d{2}(?:\.\d+)?)/.exec(line);
        if (durationMatch) {
          const parsed = parseDurationToSeconds(durationMatch[1]);
          if (parsed && parsed > 0) {
            totalDurationSeconds = parsed;
            updatePercentFromOutTime();
          }
        }

        const outTimeMsMatch = /^out_time_ms=(\d+)$/i.exec(line);
        if (outTimeMsMatch) {
          const outMs = Number(outTimeMsMatch[1]);
          if (Number.isFinite(outMs) && outMs >= 0) {
            progressOutTimeSeconds = outMs / 1_000_000;
            updatePercentFromOutTime();
          }
        }

        const progressMatch = /^progress=(\w+)$/i.exec(line);
        if (progressMatch?.[1]?.toLowerCase() === "continue") {
          if (totalDurationSeconds == null) {
            updateProgress(null, "Transcoding video...");
          }
        }
      }
    });

    ffmpeg.on("error", (err) => {
      transcodeProgress.set(key, {
        state: "error",
        progressPercent: null,
        message: "Transcode failed",
      });
      if (IS_DEV) {
        console.warn("[stream-proxy] ffmpeg spawn error", {
          ffmpegPath: resolvedFfmpegPath,
          targetUrl,
          referer: referer ?? null,
          message: err instanceof Error ? err.message : String(err),
        });
      }
      reject(err);
    });

    ffmpeg.on("close", (code, signal) => {
      if (code === 0) {
        transcodeProgress.set(key, {
          state: "done",
          progressPercent: 100,
          message: "Transcode complete",
        });
        resolve();
        return;
      }
      transcodeProgress.set(key, {
        state: "error",
        progressPercent: null,
        message: "Transcode failed",
      });
      if (IS_DEV) {
        console.warn("[stream-proxy] ffmpeg transcode exited non-zero", {
          code,
          signal: signal ?? null,
          ffmpegPath: resolvedFfmpegPath,
          inputUrl,
          targetUrl,
          referer: referer ?? null,
          stderr: stderrTail || null,
        });
      }
      reject(
        createTranscodeFailureError(
          `ffmpeg exited with code ${String(code)}`,
          stderrTail,
          code ?? null
        )
      );
    });
  });

  await rename(partialPath, finalPath);
  return finalPath;
}

function getTranscodeCacheKey(targetUrl: string): string {
  return createHash("sha1").update(targetUrl).digest("hex");
}

function getTranscodeFailureDetails(err: unknown): TranscodeFailureDetails {
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      stderr?: unknown;
      exitCode?: unknown;
    };
    const message = typeof e.message === "string" ? e.message : "Transcode failed";
    const stderr = typeof e.stderr === "string" ? e.stderr : "";
    const exitCode = typeof e.exitCode === "number" ? e.exitCode : null;
    return { message, stderr, exitCode };
  }
  return { message: String(err), stderr: "", exitCode: null };
}

function createTranscodeFailureError(
  message: string,
  stderr: string,
  exitCode: number | null
): Error & { stderr: string; exitCode: number | null } {
  const error = new Error(message) as Error & { stderr: string; exitCode: number | null };
  error.stderr = stderr;
  error.exitCode = exitCode;
  return error;
}

function isRetryableTranscodeFailure(details: TranscodeFailureDetails): boolean {
  const haystack = `${details.message}\n${details.stderr}`.toLowerCase();
  return (
    /http error 5\d\d/.test(haystack) ||
    haystack.includes("server returned 5xx") ||
    haystack.includes("temporarily unavailable") ||
    haystack.includes("connection reset") ||
    haystack.includes("network is unreachable") ||
    haystack.includes("timed out")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function serveFileWithRange(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string
): Promise<void> {
  const fileStat = await stat(filePath);
  const fileSize = fileStat.size;
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("content-type", "video/mp4");
  res.setHeader("cache-control", "no-store");

  if (!range) {
    res.setHeader("Content-Length", String(fileSize));
    res.writeHead(200);
    const stream = createReadStream(filePath);
    await pipeline(stream, res);
    return;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.writeHead(416);
    res.end();
    return;
  }

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileSize) {
    res.setHeader("Content-Range", `bytes */${fileSize}`);
    res.writeHead(416);
    res.end();
    return;
  }

  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", String(end - start + 1));
  res.writeHead(206);
  const stream = createReadStream(filePath, { start, end });
  await pipeline(stream, res);
}

function resolveFfmpegPath(): string | null {
  const accessMode = IS_WINDOWS ? constants.F_OK : constants.X_OK;
  const candidates = [
    // Electron Forge extraResource places "bin/ffmpeg.exe" at "resources/ffmpeg.exe".
    path.join(process.resourcesPath, FFMPEG_BINARY),
    path.join(process.resourcesPath, "bin", FFMPEG_BINARY),
    path.join(process.cwd(), "bin", FFMPEG_BINARY),
    path.join(process.cwd(), "desktop", "bin", FFMPEG_BINARY),
  ];

  for (const candidate of candidates) {
    try {
      accessSync(candidate, accessMode);
      if (IS_DEV) {
        console.warn("[stream-proxy] using bundled ffmpeg path", { candidate });
      }
      return candidate;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Range,Accept,Content-Type,Origin,Referer,User-Agent"
  );
}

function isHlsManifestResponse(targetUrl: string, contentType: string | null): boolean {
  if (/\.m3u8(?:$|\?)/i.test(targetUrl)) return true;
  const ct = (contentType ?? "").toLowerCase();
  return ct.includes("application/vnd.apple.mpegurl") || ct.includes("application/x-mpegurl");
}

function rewriteHlsManifest(
  manifest: string,
  manifestUrl: string,
  referer: string | null,
  proxyBaseUrl: string
): string {
  const effectiveReferer =
    typeof referer === "string" && referer.trim().length > 0 ? referer : manifestUrl;

  const toProxyUrl = (rawUri: string): string => {
    const trimmed = rawUri.trim();
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return rawUri;
    const absolute = toAbsoluteUrl(trimmed, manifestUrl);
    return `${proxyBaseUrl}/stream?url=${encodeURIComponent(absolute)}&referer=${encodeURIComponent(effectiveReferer)}`;
  };

  return manifest
    .split(/\r?\n/)
    .map((line) => {
      if (!line) return line;

      if (line.startsWith("#")) {
        if (line.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${toProxyUrl(uri)}"`);
        }
        return line;
      }

      return toProxyUrl(line);
    })
    .join("\n");
}

function toAbsoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function isBenignStreamError(err: unknown): boolean {
  if (!err) return false;

  if (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === "AbortError"
  ) {
    return true;
  }

  const maybeErr = err as {
    code?: unknown;
    name?: unknown;
    message?: unknown;
    cause?: unknown;
  };

  if (typeof maybeErr.code === "string") {
    if (
      maybeErr.code === "ABORT_ERR" ||
      maybeErr.code === "UND_ERR_ABORTED" ||
      maybeErr.code === "ECONNRESET" ||
      maybeErr.code === "EPIPE" ||
      maybeErr.code === "ERR_STREAM_PREMATURE_CLOSE" ||
      maybeErr.code === "ERR_STREAM_DESTROYED"
    ) {
      return true;
    }
  }

  const name = typeof maybeErr.name === "string" ? maybeErr.name.toLowerCase() : "";
  const message = typeof maybeErr.message === "string" ? maybeErr.message.toLowerCase() : "";
  if (
    name.includes("abort") ||
    message.includes("abort") ||
    message.includes("premature close") ||
    message.includes("socket hang up") ||
    message.includes("network socket disconnected")
  ) {
    return true;
  }

  return isBenignStreamError(maybeErr.cause);
}
