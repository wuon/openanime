/**
 * Local HTTP proxy that fetches stream URLs with a Referer header
 * so the renderer can play them in a <video> element.
 *
 * Routes:
 *   GET /stream?url=<targetUrl>&referer=<referer>
 *     Pass-through proxy. Rewrites HLS manifests to keep segments going through us.
 *
 *   GET /transcode/playlist.m3u8?url=<targetUrl>&referer=<referer>
 *     Returns a synthesized VOD HLS playlist immediately. Duration is probed up
 *     front so the player can show the seek bar and total time as soon as
 *     playback starts. Segments are produced lazily by a background ffmpeg.
 *
 *   GET /transcode/segment-<N>.ts?url=<targetUrl>&referer=<referer>
 *     Serves segment <N> from disk. If not yet produced, blocks briefly while a
 *     sequential ffmpeg fills forward. If the requested segment is far ahead of
 *     the current transcode position, the sequential job is restarted at <N>.
 */
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { createHash } from "crypto";
import { accessSync, constants, createReadStream } from "fs";
import { mkdir, stat } from "fs/promises";
import type { IncomingMessage, ServerResponse } from "http";
import http from "http";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { URL } from "url";

import { getElectronUserAgent } from "@/main/electron-user-agent";
import { fetchUpstream, normalizeStreamReferer } from "@/main/stream-proxy-upstream";
import { isHlsPlaylistUrl } from "@/shared/utils/hls-url";

let server: http.Server | null = null;
let proxyPort = 0;
const IS_DEV = process.env.NODE_ENV !== "production";
const IS_WINDOWS = process.platform === "win32";
const FFMPEG_BINARY = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
let resolvedFfmpegPath = resolveFfmpegPath();

// Bump when the on-disk segment layout / PTS scheme changes so old cached
// segments don't get served to the player with the new playlist semantics.
const TRANSCODE_CACHE_VERSION = "v1";
const transcodeCacheDir = path.join(tmpdir(), "openanime-transcode-cache", TRANSCODE_CACHE_VERSION);

const HLS_SEGMENT_DURATION_SECONDS = 6;
/** Hard cap when waiting for a segment to be produced by the background job. */
const SEGMENT_WAIT_TIMEOUT_MS = 60_000;
/**
 * If a requested segment is more than this many ahead of the current job's
 * highest-completed segment, kill+restart at the request. Needs to be larger
 * than hls.js's typical prefetch window (~maxBufferLength / hls_time + a small
 * burst) so normal sequential playback doesn't trigger spurious restarts,
 * while still being small enough that forward seeks are answered quickly
 * instead of by grinding through dozens of segments.
 */
const SEGMENT_RESTART_FORWARD_TOLERANCE = 15;
/** ffmpeg duration probe must finish within this window. */
const PROBE_TIMEOUT_MS = 25_000;

export interface TranscodeProgressSnapshot {
  state: "idle" | "running" | "done" | "error";
  progressPercent: number | null;
  message: string;
}

interface SegmentAwaiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

interface HlsSequentialJob {
  child: ChildProcessWithoutNullStreams;
  startSegment: number;
  /** Highest segment index currently believed to be on disk and complete. */
  highestCompletedSegment: number;
  stopped: boolean;
  stderrTail: string;
  /** Resolves when the child exits (any reason). */
  exited: Promise<void>;
  /** Exit code captured in the `close` event, or null if signalled/no exit. */
  exitCode: number | null;
  /** Signal captured in the `close` event, or null. */
  exitSignal: NodeJS.Signals | null;
}

interface HlsSession {
  key: string;
  inputUrl: string;
  targetUrl: string;
  referer: string | null;
  durationSeconds: number;
  segmentCount: number;
  segmentDir: string;
  sequentialJob: HlsSequentialJob | null;
  /** Segments confirmed on disk (max across all observations). */
  segmentsAvailable: Set<number>;
  /**
   * Segments that ffmpeg failed to produce despite a clean exit — almost
   * always because they're past the actual end of the upstream content.
   * We don't retry on these; the client gets a 410 Gone immediately.
   */
  segmentsUnavailable: Set<number>;
  /** Per-segment awaiter lists for in-flight HTTP segment requests. */
  awaiters: Map<number, SegmentAwaiter[]>;
  /** Start segment of the last sequential job that failed without producing anything. */
  lastFailedStartSegment: number | null;
  /** Monotonic ms timestamp of that failure, or 0 if none. */
  lastFailedAtMs: number;
}

const hlsSessions = new Map<string, HlsSession>();
const hlsSessionInits = new Map<string, Promise<HlsSession>>();
const transcodeProgress = new Map<string, TranscodeProgressSnapshot>();

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

/**
 * Public IPC entry point: prepare the HLS transcode for a target URL.
 * Probes duration up front and kicks off the sequential transcode job.
 * Returns when the playlist is ready to be requested (typically <2s).
 */
export async function prepareTranscodedStream(
  inputUrl: string,
  targetUrl: string,
  referer: string | null
): Promise<void> {
  if (!resolvedFfmpegPath) {
    resolvedFfmpegPath = resolveFfmpegPath();
  }
  if (!resolvedFfmpegPath) {
    throw new Error("ffmpeg binary unavailable");
  }
  await ensureHlsSession(inputUrl, targetUrl, referer);
}

export function getTranscodeProgress(targetUrl: string): TranscodeProgressSnapshot {
  const key = getTranscodeCacheKey(targetUrl);
  const existing = transcodeProgress.get(key);
  if (existing) return existing;
  return { state: "idle", progressPercent: null, message: "Waiting to start..." };
}

/** Stop all background ffmpeg processes (e.g. on app quit). */
export function shutdownTranscodeJobs(): void {
  for (const session of hlsSessions.values()) {
    stopSequentialJob(session);
  }
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

  if (parsed.pathname === "/stream") {
    handleStreamPassthrough(req, res, parsed);
    return;
  }

  if (parsed.pathname.startsWith("/transcode/")) {
    void handleTranscodeRoute(req, res, parsed).catch((err: unknown) => {
      if (isBenignStreamError(err)) return;
      if (IS_DEV) {
        console.warn("[stream-proxy] transcode route failed", {
          path: parsed.pathname,
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
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

function handleStreamPassthrough(req: IncomingMessage, res: ServerResponse, parsed: URL): void {
  const targetUrl = parsed.searchParams.get("url");
  const rawReferer = parsed.searchParams.get("referer");
  const referer = targetUrl ? normalizeStreamReferer(targetUrl, rawReferer) : rawReferer;

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
  if (IS_DEV && rawReferer && referer && rawReferer !== referer) {
    console.info("[stream-proxy] normalized referer", {
      targetUrl: targetUrl.slice(0, 96),
      from: rawReferer,
      to: referer,
    });
  }
  if (range) headers.Range = range;

  const ac = new AbortController();
  const onClientGone = () => ac.abort();
  req.once("aborted", onClientGone);
  res.once("close", onClientGone);

  fetchUpstream(targetUrl, headers, ac.signal)
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

async function handleTranscodeRoute(
  req: IncomingMessage,
  res: ServerResponse,
  parsed: URL
): Promise<void> {
  const targetUrl = parsed.searchParams.get("url");
  const rawReferer = parsed.searchParams.get("referer");
  const referer = targetUrl ? normalizeStreamReferer(targetUrl, rawReferer) : rawReferer;

  if (!targetUrl) {
    res.writeHead(400);
    res.end("Missing url parameter");
    return;
  }

  const subpath = parsed.pathname.slice("/transcode/".length);

  if (subpath === "playlist.m3u8") {
    await handlePlaylistRequest(req, res, targetUrl, referer);
    return;
  }

  const segMatch = /^segment-(\d+)\.ts$/.exec(subpath);
  if (segMatch) {
    const segIdx = Number(segMatch[1]);
    await handleSegmentRequest(req, res, targetUrl, referer, segIdx);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
}

async function handlePlaylistRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
  referer: string | null
): Promise<void> {
  const inputUrl = buildLocalProxyInputUrl(targetUrl, referer);
  const session = await ensureHlsSession(inputUrl, targetUrl, referer);

  const body = buildVodPlaylist(session, targetUrl, referer);
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.writeHead(200);
  res.end(body);
}

async function handleSegmentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
  referer: string | null,
  segIdx: number
): Promise<void> {
  const inputUrl = buildLocalProxyInputUrl(targetUrl, referer);
  const session = await ensureHlsSession(inputUrl, targetUrl, referer);

  if (segIdx < 0 || segIdx >= session.segmentCount) {
    res.writeHead(404);
    res.end("Segment out of range");
    return;
  }

  const ac = new AbortController();
  const onClientGone = () => ac.abort();
  req.once("aborted", onClientGone);
  res.once("close", onClientGone);

  try {
    const segPath = await ensureSegmentReady(session, segIdx, ac.signal);
    if (ac.signal.aborted) return;
    await serveSegmentFile(req, res, segPath);
  } catch (err: unknown) {
    if (ac.signal.aborted || isBenignStreamError(err)) return;
    const pastEof = isPastEofError(err);
    if (IS_DEV) {
      console.warn("[stream-proxy] segment serve failed", {
        key: session.key,
        segIdx,
        pastEof,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    if (!res.headersSent) {
      // 410 Gone for past-EOF: hls.js treats 4xx as fatal-for-this-fragment and
      // stops retrying, instead of looping on 502s and pinning the player.
      const status = pastEof ? 410 : 502;
      res.writeHead(status);
      res.end(String(err instanceof Error ? err.message : "Segment unavailable"));
    } else if (!res.writableEnded) {
      res.destroy();
    }
  }
}

function buildLocalProxyInputUrl(targetUrl: string, referer: string | null): string {
  return `${getStreamProxyBaseUrl()}/stream?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer ?? "")}`;
}

function buildVodPlaylist(session: HlsSession, targetUrl: string, referer: string | null): string {
  const baseQuery = `url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer ?? "")}`;
  const base = getStreamProxyBaseUrl();
  const segCount = session.segmentCount;
  const targetDuration = Math.max(1, Math.ceil(HLS_SEGMENT_DURATION_SECONDS));

  const lines: string[] = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXT-X-TARGETDURATION:${String(targetDuration)}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
    "#EXT-X-INDEPENDENT-SEGMENTS",
  ];

  for (let i = 0; i < segCount; i++) {
    // ffmpeg's HLS muxer with `-hls_time 6` writes full 6s segments and the
    // EXTINF must never exceed the actual segment length, otherwise the player
    // stalls at the very end waiting for content that won't arrive. With
    // segmentCount = floor(duration / 6), every advertised segment is a full
    // 6 seconds; any sub-6s tail is intentionally dropped from the playlist.
    const dur = HLS_SEGMENT_DURATION_SECONDS;
    lines.push(`#EXTINF:${dur.toFixed(3)},`);
    lines.push(`${base}/transcode/segment-${String(i)}.ts?${baseQuery}`);
  }
  lines.push("#EXT-X-ENDLIST");
  return lines.join("\n") + "\n";
}

async function ensureHlsSession(
  inputUrl: string,
  targetUrl: string,
  referer: string | null
): Promise<HlsSession> {
  const key = getTranscodeCacheKey(targetUrl);
  const existing = hlsSessions.get(key);
  if (existing) return existing;

  const pending = hlsSessionInits.get(key);
  if (pending !== undefined) return pending;

  const initPromise = (async (): Promise<HlsSession> => {
    if (!resolvedFfmpegPath) {
      resolvedFfmpegPath = resolveFfmpegPath();
    }
    if (!resolvedFfmpegPath) {
      throw new Error("ffmpeg binary unavailable");
    }

    transcodeProgress.set(key, {
      state: "running",
      progressPercent: null,
      message: "Probing stream...",
    });

    const segmentDir = path.join(transcodeCacheDir, key);
    await mkdir(segmentDir, { recursive: true });

    const duration = await probeDurationSeconds(inputUrl).catch((err: unknown) => {
      transcodeProgress.set(key, {
        state: "error",
        progressPercent: null,
        message: "Could not probe stream duration",
      });
      throw err;
    });
    if (!Number.isFinite(duration) || duration <= 0) {
      transcodeProgress.set(key, {
        state: "error",
        progressPercent: null,
        message: "Stream has no known duration",
      });
      throw new Error("Could not determine stream duration");
    }
    // Use floor (not ceil) so we never advertise a phantom trailing segment that
    // the upstream can't actually deliver. ffmpeg's HLS duration probe is parsed
    // from the upstream manifest's EXTINFs, but the *playable* tail is often a
    // bit shorter than the sum of EXTINFs (AAC priming, encoder padding, last
    // segment trimming, etc.). When that happens, ceil() invents a segment past
    // EOF; floor() loses up to ~6s at the absolute end of the file but never
    // claims a segment ffmpeg can't produce. Past-EOF detection handles any
    // residual edge cases by returning 410 instead of an infinite 502 retry loop.
    const segmentCount = Math.max(1, Math.floor(duration / HLS_SEGMENT_DURATION_SECONDS));

    const segmentsAvailable = await listExistingSegments(segmentDir, segmentCount);

    const session: HlsSession = {
      key,
      inputUrl,
      targetUrl,
      referer,
      durationSeconds: duration,
      segmentCount,
      segmentDir,
      sequentialJob: null,
      segmentsAvailable,
      segmentsUnavailable: new Set(),
      awaiters: new Map(),
      lastFailedStartSegment: null,
      lastFailedAtMs: 0,
    };
    hlsSessions.set(key, session);
    if (IS_DEV) {
      console.info("[stream-proxy] session ready", {
        key,
        durationSeconds: duration,
        segmentCount,
        existingOnDisk: segmentsAvailable.size,
      });
    }

    updateSessionProgress(session, "Building stream cache...");

    if (segmentsAvailable.size < segmentCount) {
      const firstMissing = findFirstMissingSegment(session);
      startSequentialJob(session, firstMissing);
    } else {
      transcodeProgress.set(key, {
        state: "done",
        progressPercent: 100,
        message: "Stream cache ready",
      });
    }

    return session;
  })();

  hlsSessionInits.set(key, initPromise);
  try {
    return await initPromise;
  } finally {
    hlsSessionInits.delete(key);
  }
}

function findFirstMissingSegment(session: HlsSession): number {
  for (let i = 0; i < session.segmentCount; i++) {
    if (!session.segmentsAvailable.has(i)) return i;
  }
  return session.segmentCount; // all present
}

async function listExistingSegments(
  segmentDir: string,
  segmentCount: number
): Promise<Set<number>> {
  const result = new Set<number>();
  for (let i = 0; i < segmentCount; i++) {
    try {
      const s = await stat(path.join(segmentDir, `seg-${String(i)}.ts`));
      if (s.isFile() && s.size > 0) result.add(i);
    } catch {
      // missing
    }
  }
  return result;
}

function probeDurationSeconds(inputUrl: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    if (!resolvedFfmpegPath) {
      reject(new Error("ffmpeg binary unavailable"));
      return;
    }
    // Read the container header only. ffmpeg emits "Duration: HH:MM:SS.MS" to stderr
    // as soon as it parses the input, then exits with an error because no output is
    // specified. That's the cheapest probe across input types (HLS, MP4, etc.) and
    // doesn't depend on ffprobe being available.
    const args = [
      "-hide_banner",
      "-loglevel",
      "info",
      ...getInputPermissiveHlsArgs(),
      "-i",
      inputUrl,
    ];
    const child = spawn(resolvedFfmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderrBuf = "";
    let duration: number | null = null;
    const timer = setTimeout(() => {
      if (!child.killed) child.kill("SIGKILL");
      reject(new Error("ffmpeg duration probe timed out"));
    }, PROBE_TIMEOUT_MS);

    const tryExtractDuration = () => {
      if (duration != null) return;
      const m = /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(stderrBuf);
      if (!m) return;
      const hours = Number(m[1]);
      const minutes = Number(m[2]);
      const seconds = Number(m[3]);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
        return;
      }
      const parsed = hours * 3600 + minutes * 60 + seconds;
      if (parsed <= 0 || !Number.isFinite(parsed)) return;
      duration = parsed;
      // Got what we need — kill the process early to avoid waiting for it to do anything else.
      if (!child.killed) child.kill("SIGKILL");
    };

    child.stderr.on("data", (chunk) => {
      stderrBuf += String(chunk);
      if (stderrBuf.length > 16000) stderrBuf = stderrBuf.slice(-16000);
      tryExtractDuration();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      tryExtractDuration();
      if (duration != null && Number.isFinite(duration) && duration > 0) {
        resolve(duration);
        return;
      }
      reject(
        new Error(
          `ffmpeg duration probe failed (code ${String(code)}, signal ${String(signal ?? "")}): ${stderrBuf.slice(-512) || "no output"}`
        )
      );
    });
  });
}

function startSequentialJob(session: HlsSession, startSegment: number): HlsSequentialJob {
  if (startSegment < 0) startSegment = 0;
  if (startSegment >= session.segmentCount) startSegment = session.segmentCount - 1;

  const previousJob = session.sequentialJob;
  if (previousJob) {
    // Any pending awaiter that the new job won't reach must be failed so the HTTP
    // segment handler returns promptly (and hls.js can retry). Awaiters within the
    // new job's range are kept and will resolve when ffmpeg produces those segments.
    failAwaitersOutsideRange(session, startSegment);
    stopSequentialJob(session);
  }
  if (!resolvedFfmpegPath) {
    throw new Error("ffmpeg binary unavailable");
  }

  const startTime = startSegment * HLS_SEGMENT_DURATION_SECONDS;
  // CRITICAL: every restart must produce output whose PTS for seg-N is exactly
  // `N * HLS_SEGMENT_DURATION_SECONDS`. Otherwise hls.js appends a seek-target
  // fragment (e.g. seg-200) at PTS=0 over the already-buffered seg-0..N, the
  // source-buffer ends up with no content at the target time, and the player
  // snaps the playhead back to the last continuously-buffered position and
  // stalls.
  //
  // We let ffmpeg's default shift-to-zero behaviour normalise the per-run
  // input PTS, then use `-output_ts_offset` to anchor the *output* timeline
  // at the segment's expected start time. That gives every restart-produced
  // fragment a PTS that matches its filename / position in the playlist.
  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostats",
    ...(startSegment > 0 ? ["-ss", startTime.toFixed(3)] : []),
    ...getInputPermissiveHlsArgs(),
    "-i",
    session.inputUrl,
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
    "-output_ts_offset",
    startTime.toFixed(3),
    "-f",
    "hls",
    "-hls_time",
    String(HLS_SEGMENT_DURATION_SECONDS),
    "-hls_playlist_type",
    "vod",
    "-hls_segment_type",
    "mpegts",
    "-hls_list_size",
    "0",
    "-start_number",
    String(startSegment),
    "-hls_segment_filename",
    path.join(session.segmentDir, "seg-%d.ts"),
    "-hls_flags",
    "independent_segments+temp_file+omit_endlist",
    "-y",
    path.join(session.segmentDir, ".internal.m3u8"),
  ];

  if (IS_DEV) {
    console.info("[stream-proxy] spawning ffmpeg", {
      key: session.key,
      startSegment,
      startTimeSeconds: startSegment > 0 ? startTime.toFixed(3) : 0,
      segmentCount: session.segmentCount,
    });
  }

  const child = spawn(resolvedFfmpegPath, args, {
    stdio: ["ignore", "ignore", "pipe"],
  });

  const job: HlsSequentialJob = {
    child,
    startSegment,
    highestCompletedSegment: startSegment - 1,
    stopped: false,
    stderrTail: "",
    exitCode: null,
    exitSignal: null,
    exited: new Promise<void>((resolve) => {
      child.once("close", () => {
        resolve();
      });
      child.once("error", () => {
        resolve();
      });
    }),
  };
  session.sequentialJob = job;

  child.stderr.on("data", (chunk) => {
    const text = String(chunk);
    job.stderrTail += text;
    if (job.stderrTail.length > 5000) {
      job.stderrTail = job.stderrTail.slice(-5000);
    }
    if (IS_DEV) {
      // Forward ffmpeg's output live so we can diagnose issues without
      // waiting for the close event (which can fire before we get to log).
      for (const line of text.split(/\r?\n/)) {
        if (line.trim().length === 0) continue;
        console.warn(`[ffmpeg seg=${String(startSegment)}] ${line}`);
      }
    }
  });

  child.on("error", (err) => {
    if (IS_DEV) {
      console.warn("[stream-proxy] ffmpeg sequential spawn error", {
        key: session.key,
        startSegment,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    failPendingAwaitersAfterJob(session, job);
  });

  child.on("close", (code, signal) => {
    job.exitCode = code;
    job.exitSignal = signal;
    if (IS_DEV && !job.stopped) {
      console.warn("[stream-proxy] ffmpeg exited", {
        key: session.key,
        startSegment,
        highestCompletedSegment: job.highestCompletedSegment,
        code,
        signal,
        stderr: job.stderrTail || "<empty>",
      });
    }
    if (session.sequentialJob === job) {
      session.sequentialJob = null;
    }
    // Catch up on any segments produced between the last poll and exit, then
    // figure out whether unresolved awaiters represent past-EOF requests.
    void scanSegmentsForJob(session, job)
      .catch(() => {
        // best-effort
      })
      .finally(() => {
        finalizeAwaitersAfterJobExit(session, job);
      });
  });

  // Filesystem poll: hls muxer with temp_file atomically renames seg-N.ts.tmp -> seg-N.ts
  // when the segment is complete, so any visible seg-N.ts is safe to serve.
  const pollIntervalMs = 200;
  const pollTimer: NodeJS.Timeout = setInterval(() => {
    if (job.stopped || session.sequentialJob !== job) {
      clearInterval(pollTimer);
      return;
    }
    void scanSegmentsForJob(session, job)
      .then(() => {
        if (session.segmentsAvailable.size >= session.segmentCount) {
          clearInterval(pollTimer);
        }
      })
      .catch(() => {
        // ignore — poll loop is best-effort
      });
  }, pollIntervalMs);

  // Final sweep when job exits to catch the last segment(s).
  void job.exited.then(() => {
    clearInterval(pollTimer);
    void scanSegmentsForJob(session, job).catch(() => {
      // ignore
    });
  });

  return job;
}

async function scanSegmentsForJob(session: HlsSession, job: HlsSequentialJob): Promise<void> {
  let probe = Math.max(job.highestCompletedSegment + 1, job.startSegment);
  while (probe < session.segmentCount) {
    const candidate = path.join(session.segmentDir, `seg-${String(probe)}.ts`);
    let exists = false;
    try {
      const s = await stat(candidate);
      exists = s.isFile() && s.size > 0;
    } catch {
      exists = false;
    }
    if (!exists) break;
    job.highestCompletedSegment = probe;
    session.segmentsAvailable.add(probe);
    notifyAwaiters(session, probe);
    probe += 1;
  }
  updateSessionProgress(session, "Building stream cache...");
}

function notifyAwaiters(session: HlsSession, segIdx: number): void {
  const list = session.awaiters.get(segIdx);
  if (!list) return;
  session.awaiters.delete(segIdx);
  for (const w of list) w.resolve();
}

function failPendingAwaitersAfterJob(session: HlsSession, job: HlsSequentialJob): void {
  // Called only on spawn errors (the `child.on("error")` path) where the job
  // never produced anything and we have no exit-code context. The `close`
  // event uses `finalizeAwaitersAfterJobExit` instead, which is more nuanced.
  if (job.stopped) return;
  for (const [segIdx, list] of session.awaiters.entries()) {
    if (session.segmentsAvailable.has(segIdx)) continue;
    session.awaiters.delete(segIdx);
    const err = new Error(
      `Transcoder failed before producing segment ${String(segIdx)}: ${job.stderrTail.slice(-512) || "no output"}`
    );
    for (const w of list) w.reject(err);
  }
}

/**
 * Called after the ffmpeg child for `job` has emitted `close` and we've done a
 * final disk scan. Decides per-awaiter whether the failure is "past EOF" (clean
 * exit but the requested segment is beyond what ffmpeg produced) vs an actual
 * crash worth surfacing as a generic error.
 */
function finalizeAwaitersAfterJobExit(session: HlsSession, job: HlsSequentialJob): void {
  if (job.stopped) return;

  const cleanExit = job.exitCode === 0 && job.exitSignal === null;
  const producedAnything = job.highestCompletedSegment >= job.startSegment;

  // Record fast-failure footprint so `ensureSegmentReady` can refuse to keep
  // re-spawning ffmpeg with the same doomed inputs.
  if (!cleanExit && !producedAnything) {
    session.lastFailedStartSegment = job.startSegment;
    session.lastFailedAtMs = Date.now();
  } else {
    session.lastFailedStartSegment = null;
    session.lastFailedAtMs = 0;
  }

  for (const [segIdx, list] of Array.from(session.awaiters.entries())) {
    if (session.segmentsAvailable.has(segIdx)) continue;
    session.awaiters.delete(segIdx);

    // If ffmpeg returned successfully but never advanced to this segment, it's
    // past the actual end of the upstream stream. Mark it sticky so subsequent
    // requests short-circuit instead of triggering another spawn cycle.
    const pastEof =
      cleanExit &&
      segIdx > job.highestCompletedSegment &&
      job.highestCompletedSegment >= job.startSegment - 1;

    if (pastEof) {
      session.segmentsUnavailable.add(segIdx);
      const err = new PastEofError(segIdx);
      for (const w of list) w.reject(err);
      continue;
    }

    const detail = job.stderrTail.slice(-1024) || "<no stderr>";
    const err = new Error(
      `Transcoder exited (code=${String(job.exitCode)}, signal=${String(job.exitSignal)}) before producing segment ${String(segIdx)}: ${detail}`
    );
    for (const w of list) w.reject(err);
  }
}

/** How long to refuse re-spawning at the same start segment after a fast-failure exit. */
const SAME_START_FAILURE_COOLDOWN_MS = 5000;

/** Sentinel error so `ensureSegmentReady`'s outer loop can transparently retry. */
class TranscoderRestartedError extends Error {
  readonly isTranscoderRestarted = true;
  constructor(segIdx: number, newStartSegment: number) {
    super(
      `Transcoder restarted at segment ${String(newStartSegment)}; segment ${String(segIdx)} no longer scheduled`
    );
    this.name = "TranscoderRestartedError";
  }
}

function isTranscoderRestartedError(err: unknown): boolean {
  return err instanceof TranscoderRestartedError;
}

/**
 * Sentinel: ffmpeg exited cleanly without producing the requested segment.
 * Almost always means `-ss <time>` overshot the actual end of the upstream
 * stream — usually a duration mis-probe or the player requested a segment past
 * the end. We return 410 Gone for these so hls.js stops retrying immediately.
 */
class PastEofError extends Error {
  readonly isPastEof = true;
  constructor(segIdx: number) {
    super(`Segment ${String(segIdx)} is past the end of the stream`);
    this.name = "PastEofError";
  }
}

function isPastEofError(err: unknown): boolean {
  return err instanceof PastEofError;
}

function failAwaitersOutsideRange(session: HlsSession, newStartSegment: number): void {
  // After this returns, only awaiters with segIdx >= newStartSegment remain.
  // ffmpeg writes forward from newStartSegment, so anything before it would never
  // be produced by the upcoming job. Awaiters get a sentinel error so the HTTP
  // handler can transparently re-enter `ensureSegmentReady` (which will spawn a
  // fresh job covering them) instead of returning 502 to the client.
  for (const [segIdx, list] of session.awaiters.entries()) {
    if (segIdx >= newStartSegment) continue;
    if (session.segmentsAvailable.has(segIdx)) continue;
    session.awaiters.delete(segIdx);
    const err = new TranscoderRestartedError(segIdx, newStartSegment);
    for (const w of list) w.reject(err);
  }
}

function stopSequentialJob(session: HlsSession): void {
  const job = session.sequentialJob;
  if (!job) return;
  job.stopped = true;
  session.sequentialJob = null;
  if (!job.child.killed) {
    job.child.kill("SIGKILL");
  }
}

function updateSessionProgress(session: HlsSession, message: string): void {
  const ratio = session.segmentsAvailable.size / Math.max(1, session.segmentCount);
  const percent = Math.min(100, Math.max(0, ratio * 100));
  const done = session.segmentsAvailable.size >= session.segmentCount;
  transcodeProgress.set(session.key, {
    state: done ? "done" : "running",
    progressPercent: done ? 100 : Math.floor(percent * 10) / 10,
    message: done ? "Stream cache ready" : message,
  });
}

/** Safety cap so a pathological state can't pin a connection open forever. */
const ENSURE_SEGMENT_MAX_RESTART_RETRIES = 6;

async function ensureSegmentReady(
  session: HlsSession,
  segIdx: number,
  abortSignal: AbortSignal
): Promise<string> {
  const segPath = path.join(session.segmentDir, `seg-${String(segIdx)}.ts`);

  let restartRetries = 0;
  while (!abortSignal.aborted) {
    // A previous job already proved this segment is past the actual end of the
    // upstream. No amount of retrying will change that — fail fast.
    if (session.segmentsUnavailable.has(segIdx)) {
      throw new PastEofError(segIdx);
    }

    // Re-check filesystem cheaply in case another request just produced it.
    if (!session.segmentsAvailable.has(segIdx)) {
      try {
        const s = await stat(segPath);
        if (s.isFile() && s.size > 0) session.segmentsAvailable.add(segIdx);
      } catch {
        // still missing
      }
    }
    if (session.segmentsAvailable.has(segIdx)) return segPath;

    const job = session.sequentialJob;
    const isReachable =
      job !== null &&
      !job.stopped &&
      segIdx >= job.startSegment &&
      segIdx <= job.highestCompletedSegment + 1 + SEGMENT_RESTART_FORWARD_TOLERANCE;

    if (!isReachable) {
      // Refuse to re-spawn ffmpeg at a start segment we just saw fast-fail.
      // Otherwise hls.js's own fragment retry loop will hammer us through 6
      // identical spawns within a second or two.
      if (
        session.lastFailedStartSegment === segIdx &&
        Date.now() - session.lastFailedAtMs < SAME_START_FAILURE_COOLDOWN_MS
      ) {
        throw new Error(
          `Segment ${String(segIdx)} not retried: transcoder just failed at this position`
        );
      }
      startSequentialJob(session, segIdx);
    }

    try {
      await waitForSegment(session, segIdx, abortSignal);
      return segPath;
    } catch (err: unknown) {
      // If another request triggered a restart that bumped this segment out of
      // the new job's range, our awaiter was rejected with a sentinel. Loop and
      // spawn a fresh job covering this segment instead of failing the client.
      if (isPastEofError(err)) throw err;
      if (!isTranscoderRestartedError(err)) throw err;
      restartRetries += 1;
      if (restartRetries > ENSURE_SEGMENT_MAX_RESTART_RETRIES) {
        throw new Error(`Segment ${String(segIdx)} cancelled by repeated transcoder restarts`);
      }
      // Loop to re-evaluate: this iteration will see the segment unreachable and
      // either start a new sequential job at segIdx or yield (above).
    }
  }

  throw new Error("Client aborted segment request");
}

function waitForSegment(
  session: HlsSession,
  segIdx: number,
  abortSignal: AbortSignal
): Promise<void> {
  if (session.segmentsAvailable.has(segIdx)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      removeAwaiter();
      reject(new Error(`Timed out waiting for segment ${String(segIdx)}`));
    }, SEGMENT_WAIT_TIMEOUT_MS);

    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeAwaiter();
      reject(new Error("Client aborted segment request"));
    };

    const awaiter: SegmentAwaiter = {
      resolve: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        abortSignal.removeEventListener("abort", onAbort);
        resolve();
      },
      reject: (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        abortSignal.removeEventListener("abort", onAbort);
        reject(err);
      },
    };

    const removeAwaiter = () => {
      const list = session.awaiters.get(segIdx);
      if (!list) return;
      const next = list.filter((w) => w !== awaiter);
      if (next.length > 0) session.awaiters.set(segIdx, next);
      else session.awaiters.delete(segIdx);
    };

    const list = session.awaiters.get(segIdx) ?? [];
    list.push(awaiter);
    session.awaiters.set(segIdx, list);

    abortSignal.addEventListener("abort", onAbort, { once: true });
  });
}

async function serveSegmentFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string
): Promise<void> {
  const fileStat = await stat(filePath);
  const fileSize = fileStat.size;
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", "video/mp2t");
  res.setHeader("Cache-Control", "public, max-age=3600");

  if (!range) {
    res.setHeader("Content-Length", String(fileSize));
    res.writeHead(200);
    const stream = createReadStream(filePath);
    await pipeline(stream, res);
    return;
  }

  const parsedRange = parseByteRange(range);
  if (!parsedRange) {
    res.writeHead(416);
    res.end();
    return;
  }
  const start = parsedRange.start;
  const end = parsedRange.end ?? fileSize - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileSize) {
    res.setHeader("Content-Range", `bytes */${String(fileSize)}`);
    res.writeHead(416);
    res.end();
    return;
  }

  res.setHeader("Content-Range", `bytes ${String(start)}-${String(end)}/${String(fileSize)}`);
  res.setHeader("Content-Length", String(end - start + 1));
  res.writeHead(206);
  const stream = createReadStream(filePath, { start, end });
  await pipeline(stream, res);
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

function getTranscodeCacheKey(targetUrl: string): string {
  return createHash("sha1").update(targetUrl).digest("hex");
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
  if (isHlsPlaylistUrl(targetUrl)) return true;
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
