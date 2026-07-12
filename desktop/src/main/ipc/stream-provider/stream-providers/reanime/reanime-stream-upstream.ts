import type {
  StreamUpstreamFetchContext,
  StreamUpstreamHandler,
  StreamUpstreamMatchContext,
} from "@/main/stream-proxy-upstream";
import { getElectronUserAgent } from "@/main/electron-user-agent";
import { isHlsPlaylistUrl } from "@/shared/utils/hls-url";

import {
  FLIXCLOUD_REFERER,
  isFlixcloudHost,
  isReanimeCdnUrl,
} from "./constants";
import {
  ensureFlixcloudBrowserReady,
  fetchFlixcloudViaBrowser,
  warmFlixcloudCdnOrigin,
} from "./flixcloud-browser-upstream";
import { curlFetchFlixcloud } from "./flixcloud-curl-fetch";
import {
  decryptFlixcloudPlaylistBody,
  getFlixcloudPlaylistKey,
} from "./flixcloud-playlist-crypto";

const IS_DEV = process.env.NODE_ENV !== "production";
const PLAYLIST_CACHE_TTL_MS = 2 * 60 * 1000;

interface PlaylistCacheEntry {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  expiresAt: number;
}

const playlistCache = new Map<string, PlaylistCacheEntry>();
const prefetchInFlight = new Map<string, Promise<void>>();

function normalizeReanimeReferer(targetUrl: string, referer: string | null): string | null {
  if (!referer?.trim()) return referer;
  try {
    const target = new URL(targetUrl);
    const ref = new URL(referer);
    if (
      isFlixcloudHost(target.hostname) &&
      isFlixcloudHost(ref.hostname) &&
      ref.origin !== target.origin
    ) {
      return FLIXCLOUD_REFERER;
    }
    if (isFlixcloudHost(target.hostname) && ref.pathname.startsWith("/e/")) {
      return FLIXCLOUD_REFERER;
    }
  } catch {
    // keep original referer
  }
  return referer;
}

function looksLikeHtml(bytes: Buffer): boolean {
  const head = bytes.subarray(0, Math.min(96, bytes.length)).toString("utf8").trimStart().toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.includes("just a moment");
}

function looksLikeHlsPlaylist(bytes: Buffer): boolean {
  const head = bytes.subarray(0, Math.min(64, bytes.length)).toString("utf8").trimStart();
  return head.startsWith("#EXTM3U");
}

function bodyPreview(bytes: Buffer): string {
  return bytes
    .subarray(0, Math.min(120, bytes.length))
    .toString("utf8")
    .replace(/\s+/g, " ")
    .trim();
}

function expectPlaylist(targetUrl: string, contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  return (
    isHlsPlaylistUrl(targetUrl) ||
    ct.includes("mpegurl") ||
    ct.includes("application/vnd.apple.mpegurl")
  );
}

/**
 * Flixcloud returns base64(XOR(playlist)) with an HLS content-type.
 * Decrypt in-place when we have the session `__pk` from embed WASM `_c()`.
 */
function maybeDecryptPlaylistBody(
  targetUrl: string,
  contentType: string | null,
  body: Buffer
): Buffer {
  if (!expectPlaylist(targetUrl, contentType)) return body;
  if (looksLikeHlsPlaylist(body)) return body;

  const playlistKey = getFlixcloudPlaylistKey(targetUrl);
  if (!playlistKey) {
    if (IS_DEV) {
      console.warn("[reanime-upstream] playlist encrypted but no key registered", {
        targetUrl: targetUrl.slice(0, 96),
      });
    }
    return body;
  }

  const plain = decryptFlixcloudPlaylistBody(body, playlistKey);
  if (!plain) {
    if (IS_DEV) {
      console.warn("[reanime-upstream] playlist XOR decrypt failed", {
        targetUrl: targetUrl.slice(0, 96),
        preview: bodyPreview(body),
      });
    }
    return body;
  }

  if (IS_DEV) {
    console.info("[reanime-upstream] playlist XOR decrypted", {
      targetUrl: targetUrl.slice(0, 96),
      bytes: plain.length,
    });
  }
  return Buffer.from(plain, "utf8");
}

function isUsableFlixcloudBody(
  targetUrl: string,
  status: number,
  contentType: string | null,
  body: Buffer
): { ok: boolean; reason?: string } {
  if (status >= 400) return { ok: false, reason: `status ${status}` };
  if ((contentType ?? "").toLowerCase().includes("text/html")) {
    return { ok: false, reason: `content-type ${contentType}` };
  }
  if (looksLikeHtml(body)) return { ok: false, reason: "html body" };
  if (expectPlaylist(targetUrl, contentType) && !looksLikeHlsPlaylist(body)) {
    return { ok: false, reason: "missing #EXTM3U" };
  }
  if (body.length === 0) return { ok: false, reason: "empty body" };
  return { ok: true };
}

function toResponse(status: number, headers: Record<string, string>, body: Buffer): Response {
  return new Response(body, {
    status,
    statusText: status >= 400 ? "Error" : "OK",
    headers,
  });
}

function readPlaylistCache(targetUrl: string): Response | null {
  const entry = playlistCache.get(targetUrl);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    playlistCache.delete(targetUrl);
    return null;
  }
  return toResponse(entry.status, entry.headers, entry.body);
}

function writePlaylistCache(
  targetUrl: string,
  status: number,
  headers: Record<string, string>,
  body: Buffer
): void {
  if (!expectPlaylist(targetUrl, headers["content-type"] ?? null)) return;
  if (!looksLikeHlsPlaylist(body)) return;
  playlistCache.set(targetUrl, {
    status,
    headers: { ...headers, "content-type": "application/vnd.apple.mpegurl" },
    body,
    expiresAt: Date.now() + PLAYLIST_CACHE_TTL_MS,
  });
}

async function fetchViaCurl(
  targetUrl: string,
  referer: string,
  headers: Record<string, string>
): Promise<Response | null> {
  try {
    const result = await curlFetchFlixcloud(targetUrl, referer, headers);
    const contentType = result.headers["content-type"] ?? null;
    const body = maybeDecryptPlaylistBody(targetUrl, contentType, result.body);
    const usable = isUsableFlixcloudBody(targetUrl, result.status, contentType, body);
    if (!usable.ok) {
      if (IS_DEV) {
        console.warn("[reanime-upstream] curl fetch unusable", {
          status: result.status,
          reason: usable.reason,
          preview: bodyPreview(body),
          targetUrl: targetUrl.slice(0, 96),
        });
      }
      return null;
    }
    writePlaylistCache(targetUrl, result.status, result.headers, body);
    return toResponse(result.status, result.headers, body);
  } catch (error: unknown) {
    if (IS_DEV) {
      console.warn("[reanime-upstream] curl fetch failed", {
        targetUrl: targetUrl.slice(0, 96),
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
}

async function fetchViaBrowser(
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const response = await fetchFlixcloudViaBrowser(targetUrl, headers, signal);
  const rawBytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type");
  const bytes = maybeDecryptPlaylistBody(targetUrl, contentType, rawBytes);
  const usable = isUsableFlixcloudBody(targetUrl, response.status, contentType, bytes);
  if (!usable.ok) {
    if (IS_DEV) {
      console.warn("[reanime-upstream] browser fetch unusable", {
        status: response.status,
        reason: usable.reason,
        preview: bodyPreview(bytes),
        targetUrl: targetUrl.slice(0, 96),
      });
    }
  } else {
    writePlaylistCache(
      targetUrl,
      response.status,
      Object.fromEntries(response.headers.entries()),
      bytes
    );
  }
  return toResponse(
    response.status,
    Object.fromEntries(response.headers.entries()),
    bytes
  );
}

/**
 * Flixcloud CDN fetch for the local stream proxy.
 *
 * - Playlists on *.flixcloud.cc: curl works (after XOR decrypt with embed `__pk`).
 * - Segments on lock*.stronghole.site (etc.): curl is Cloudflare WAF-blocked;
 *   use Chromium session.fetch instead (page-context fetch dies on CORS).
 */
async function fetchReanimeUpstream(ctx: StreamUpstreamFetchContext): Promise<Response> {
  const { targetUrl, headers, signal, referer } = ctx;
  const effectiveReferer = (referer?.trim() || headers.Referer || FLIXCLOUD_REFERER).trim();

  const cached = readPlaylistCache(targetUrl);
  if (cached) {
    if (IS_DEV) {
      console.info("[reanime-upstream] playlist cache hit", {
        targetUrl: targetUrl.slice(0, 96),
      });
    }
    return cached;
  }

  let hostIsFlixcloud = false;
  try {
    hostIsFlixcloud = isFlixcloudHost(new URL(targetUrl).hostname);
  } catch {
    hostIsFlixcloud = false;
  }

  // Segment CDNs: skip curl (hard 403 WAF). Playlists: curl is fast and reliable.
  if (hostIsFlixcloud) {
    const viaCurl = await fetchViaCurl(targetUrl, effectiveReferer, headers);
    if (viaCurl) return viaCurl;

    if (IS_DEV) {
      console.warn("[reanime-upstream] falling back to browser fetch", {
        targetUrl: targetUrl.slice(0, 96),
      });
    }
  }

  return fetchViaBrowser(targetUrl, headers, signal);
}

function collectHlsUris(manifest: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const line of manifest.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      const uriMatch = /URI="([^"]+)"/i.exec(trimmed);
      if (uriMatch?.[1]) {
        try {
          urls.push(new URL(uriMatch[1], baseUrl).toString());
        } catch {
          // ignore
        }
      }
      continue;
    }
    try {
      urls.push(new URL(trimmed, baseUrl).toString());
    } catch {
      // ignore
    }
  }
  return urls;
}

/**
 * Fetch + decrypt a Flixcloud HLS playlist body (master or media).
 * Requires `registerFlixcloudPlaylistKey` for the stream URL first.
 */
export async function fetchReanimePlaylistText(
  playlistUrl: string,
  referer: string | null = FLIXCLOUD_REFERER
): Promise<string> {
  const effectiveReferer = (referer?.trim() || FLIXCLOUD_REFERER).trim();
  const headers: Record<string, string> = {
    "User-Agent": getElectronUserAgent(),
    Referer: effectiveReferer,
    Accept: "*/*",
  };

  const response = await fetchReanimeUpstream({
    targetUrl: playlistUrl,
    referer: effectiveReferer,
    headers,
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) {
    throw new Error(`Reanime playlist fetch failed (${response.status})`);
  }
  const text = await response.text();
  if (!text.trimStart().startsWith("#EXTM3U")) {
    throw new Error("Reanime playlist was not valid HLS after decrypt");
  }
  return text;
}

/**
 * Prefetch master + child playlists and warm segment CDN origins so the first
 * ffmpeg/transcode pass does not pay cold-start latency on the critical path.
 */
export async function prefetchReanimePlayback(
  masterUrl: string,
  referer: string | null
): Promise<void> {
  const existing = prefetchInFlight.get(masterUrl);
  if (existing) return existing;

  const task = (async () => {
    const startedAt = Date.now();
    const effectiveReferer = (referer?.trim() || FLIXCLOUD_REFERER).trim();
    const headers: Record<string, string> = {
      "User-Agent": getElectronUserAgent(),
      Referer: effectiveReferer,
      Accept: "*/*",
    };

    await ensureFlixcloudBrowserReady().catch(() => undefined);

    const masterText = await fetchReanimePlaylistText(masterUrl, effectiveReferer).catch(
      () => null
    );
    if (!masterText) return;

    const childUrls = collectHlsUris(masterText, masterUrl).filter((url) => isHlsPlaylistUrl(url));
    const childBodies = await Promise.all(
      childUrls.map(async (url) => {
        try {
          const res = await fetchReanimeUpstream({
            targetUrl: url,
            referer: effectiveReferer,
            headers,
            signal: AbortSignal.timeout(45_000),
          });
          if (!res.ok) return null;
          const text = await res.text();
          return text.trimStart().startsWith("#EXTM3U") ? { url, text } : null;
        } catch {
          return null;
        }
      })
    );

    const origins = new Set<string>();
    for (const child of childBodies) {
      if (!child) continue;
      for (const uri of collectHlsUris(child.text, child.url)) {
        try {
          const host = new URL(uri).hostname;
          if (!isFlixcloudHost(host)) {
            origins.add(new URL(uri).origin);
          }
        } catch {
          // ignore
        }
      }
    }

    await Promise.all(
      [...origins].map((origin) => warmFlixcloudCdnOrigin(`${origin}/`).catch(() => undefined))
    );

    if (IS_DEV) {
      console.info("[reanime-upstream] playback prefetch done", {
        master: masterUrl.slice(0, 96),
        playlists: 1 + childUrls.length,
        origins: [...origins],
        ms: Date.now() - startedAt,
      });
    }
  })().finally(() => {
    prefetchInFlight.delete(masterUrl);
  });

  prefetchInFlight.set(masterUrl, task);
  return task;
}

export const reanimeStreamUpstreamHandler: StreamUpstreamHandler = {
  matches(ctx: StreamUpstreamMatchContext): boolean {
    return isReanimeCdnUrl(ctx.targetUrl, ctx.referer);
  },
  normalizeReferer: normalizeReanimeReferer,
  fetch: fetchReanimeUpstream,
};
