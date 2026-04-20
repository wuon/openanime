/**
 * Local HTTP proxy that fetches stream URLs with a Referer header
 * so the renderer can play them in a <video> element.
 */
import { spawn } from "child_process";
import { createHash } from "crypto";
import ffmpegPath from "ffmpeg-static";
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
const FFMPEG_BINARY = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const resolvedFfmpegPath = resolveFfmpegPath();
const transcodeCacheDir = path.join(tmpdir(), "openanime-transcode-cache");
const transcodeJobs = new Map<string, Promise<string>>();

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
    res.writeHead(500);
    res.end("ffmpeg binary unavailable");
    return;
  }

  const hasRange = typeof req.headers.range === "string" && req.headers.range.length > 0;

  void findExistingTranscodedFile(targetUrl)
    .then(async (cachedPath) => {
      // Best path: already transcoded, supports full duration + seeking.
      if (cachedPath) {
        await serveFileWithRange(req, res, cachedPath);
        return;
      }

      // For seek requests, block until a seekable file exists.
      if (hasRange) {
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
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto,data",
    "-allowed_extensions",
    "ALL",
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
  const key = createHash("sha1").update(targetUrl).digest("hex");
  const finalPath = path.join(transcodeCacheDir, `${key}.mp4`);

  const existing = await findExistingTranscodedFile(targetUrl);
  if (existing) return existing;

  const inFlight = transcodeJobs.get(key);
  if (inFlight !== undefined) return inFlight;

  const job = transcodeToFile(inputUrl, targetUrl, referer, finalPath).finally(() => {
    transcodeJobs.delete(key);
  });
  transcodeJobs.set(key, job);
  return job;
}

async function findExistingTranscodedFile(targetUrl: string): Promise<string | null> {
  const key = createHash("sha1").update(targetUrl).digest("hex");
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
    IS_DEV ? "info" : "error",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto,data",
    "-allowed_extensions",
    "ALL",
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
    ffmpeg.stderr.on("data", (chunk) => {
      stderrTail += String(chunk);
      if (stderrTail.length > 5000) {
        stderrTail = stderrTail.slice(-5000);
      }
    });

    ffmpeg.on("error", (err) => {
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
        resolve();
        return;
      }
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
      reject(new Error(`ffmpeg exited with code ${String(code)}`));
    });
  });

  await rename(partialPath, finalPath);
  return finalPath;
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
  const candidates = [
    ffmpegPath ?? "",
    path.join(process.cwd(), "node_modules", "ffmpeg-static", FFMPEG_BINARY),
    path.join(process.cwd(), "desktop", "node_modules", "ffmpeg-static", FFMPEG_BINARY),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      accessSync(candidate, constants.X_OK);
      if (IS_DEV && candidate !== ffmpegPath) {
        console.warn("[stream-proxy] using ffmpeg fallback path", { candidate });
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

  if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
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
