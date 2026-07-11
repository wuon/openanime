/**
 * Port of https://github.com/walterwhite-69/Anivexa-API/blob/main/providers/reanime.js
 * Decrypts flixcloud.cc embed pages to a playable HLS URL.
 */
import { createDecipheriv, createHash, pbkdf2Sync } from "crypto";
import { net } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";

import { FLIXCLOUD_BASE, FLIXCLOUD_REFERER } from "./constants";
import { type FlixcloudTokenPayloadFetcher, withFlixcloudBrowser } from "./flixcloud-browser-fetch";
import { curlFetchFlixcloudHtml, curlFetchFlixcloudJson } from "./flixcloud-curl-fetch";

const IS_DEV = process.env.NODE_ENV !== "production";

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[reanime-flix] ${event}${suffix}`);
}

function logStep(label: string, startedAt: number, extra?: string): void {
  if (!IS_DEV) return;
  const durationMs = Date.now() - startedAt;
  const suffix = extra ? ` | ${extra}` : "";
  console.info(`[reanime-flix] ${label} (${durationMs}ms)${suffix}`);
}

function formatFetchError(error: unknown, url: string): string {
  if (!(error instanceof Error)) {
    return `request failed (${url})`;
  }
  const cause =
    error.cause instanceof Error
      ? `: ${error.cause.message}`
      : error.cause != null
        ? `: ${String(error.cause)}`
        : "";
  return `${error.message}${cause} (${url})`;
}

function refererOrigin(referer: string): string {
  try {
    return new URL(referer).origin;
  } catch {
    return "https://reanime.to";
  }
}

/** Use Chromium networking — Node fetch often cannot reach flixcloud.cc from the main process. */
async function flixFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await net.fetch(url, init);
  } catch (error: unknown) {
    throw new Error(formatFetchError(error, url));
  }
}

export interface FlixcloudStreamResult {
  url: string;
  /** Base64 playlist XOR key from WASM `_c()` (flixcloud `__pk`). */
  playlistKey: string;
  subtitles: unknown[];
  thumbnailsVtt: string | null;
  videoTitle: string | null;
  introChapter: unknown | null;
  outroChapter: unknown | null;
  videoId: string | null;
}

interface ObfuscatedFieldNames {
  keyField: string;
  ivField: string;
  containerName: string;
  arrayName: string;
  objectName: string;
  tokenField: string;
  keyFrag2Field: string;
}

interface FlixEmbedSsrData {
  obfuscation_seed: string;
  obfuscated_crypto_data: Record<string, unknown>;
  w_payload: string;
  subtitles?: unknown[];
  thumbnails_vtt?: string | null;
  video_title?: string | null;
  intro_chapter?: unknown | null;
  outro_chapter?: unknown | null;
  video_id?: string | null;
  [key: string]: unknown;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function decodeBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function deriveObfuscatedFieldNames(seed: string): ObfuscatedFieldNames {
  let e = seed;
  for (let i = 0; i < 3; i++) {
    e = sha256Hex(e + i);
  }
  let l = e;
  for (let i = 0; i < 3; i++) {
    l = sha256Hex(l + i);
  }
  return {
    keyField: `kf_${e.substring(8, 16)}`,
    ivField: `ivf_${e.substring(16, 24)}`,
    containerName: `cd_${e.substring(24, 32)}`,
    arrayName: `ad_${e.substring(32, 40)}`,
    objectName: `od_${e.substring(40, 48)}`,
    tokenField: `${e.substring(48, 64)}_${e.substring(56, 64)}`,
    keyFrag2Field: `${l.substring(0, 16)}_${l.substring(16, 24)}`,
  };
}

function extractSsrDataObjectLiteral(html: string): string {
  const marker = /\{type:"data",data:(\{)/;
  const match = marker.exec(html);
  if (!match) {
    throw new Error("Flixcloud SSR data block not found");
  }

  const start = html.indexOf("{", (match.index ?? 0) + match[0].length - 1);
  if (start < 0) {
    throw new Error("Flixcloud SSR data start not found");
  }

  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const char = html[i];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        return html.slice(start, i + 1);
      }
    }
  }

  throw new Error("Flixcloud SSR brace matching failed");
}

function parseSsrDataObject(source: string): FlixEmbedSsrData {
  // Embed ships a JS object literal, not JSON (same as upstream decrypt.mjs).
  const runner = new Function(`return (${source})`) as () => FlixEmbedSsrData;
  return runner();
}

interface WasmDecryptResult {
  keyMaterial: Buffer;
  /** Base64 of 32-byte playlist XOR key (`window.__pk` on flixcloud). */
  playlistKey: string;
}

/**
 * Instantiate embed WASM: `_s`/`_r` produce AES key material; `_c` is the playlist XOR key.
 */
async function runWasmDecrypt(
  wasmBase64: string,
  frag1: Buffer,
  keyFrag2: Buffer,
  tokenBytes: Buffer,
  seedInt: number
): Promise<WasmDecryptResult> {
  const wasmBytes = decodeBase64(wasmBase64);
  if (!wasmBytes.length) {
    throw new Error("Flixcloud w_payload missing from embed data");
  }

  try {
    const { instance } = await WebAssembly.instantiate(wasmBytes, {});
    const exports = instance.exports as {
      memory: WebAssembly.Memory;
      _s: (seed: number) => void;
      _r: (a: number, b: number, c: number, d: number, len: number) => void;
      _c: () => number;
    };
    if (typeof exports._s !== "function" || typeof exports._r !== "function") {
      throw new Error("Flixcloud WASM missing _s/_r exports");
    }
    if (typeof exports._c !== "function") {
      throw new Error("Flixcloud WASM missing _c export (playlist key)");
    }

    const memory = exports.memory;
    if (memory.buffer.byteLength === 0) {
      memory.grow(1);
    }
    const heap = new Uint8Array(memory.buffer);
    const len = frag1.length;
    const p = 1000;
    const v = p + len;
    const t = v + len;
    const outPtr = t + len;
    heap.set(frag1, p);
    heap.set(keyFrag2, v);
    heap.set(tokenBytes, t);
    exports._s(seedInt);
    exports._r(p, v, t, outPtr, len);

    const keyMaterial = Buffer.from(heap.subarray(outPtr, outPtr + len));
    const pkPtr = exports._c();
    const pkBytes = Buffer.from(new Uint8Array(memory.buffer).subarray(pkPtr, pkPtr + 32));
    if (pkBytes.length !== 32) {
      throw new Error("Flixcloud WASM _c returned invalid playlist key");
    }
    return {
      keyMaterial,
      playlistKey: pkBytes.toString("base64"),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log("wasm:instantiate-failed", { reason: message });
    // Without `_c`, playlists stay XOR-wrapped and ffmpeg/hls cannot play them.
    throw new Error(`Flixcloud WASM playlist key unavailable: ${message}`);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readNestedCryptoObject(
  obfuscated: Record<string, unknown>,
  fields: ObfuscatedFieldNames
): Record<string, unknown> {
  const container = asRecord(obfuscated[fields.containerName]);
  const array = container[fields.arrayName];
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("Flixcloud obfuscated crypto array missing");
  }
  const first = asRecord(array[0]);
  return asRecord(first[fields.objectName]);
}

export function parseFlixcloudEmbedLink(link: string): { accessId: string; version: number } {
  const match = link.match(/\/e\/([^?#\s]+)\?v=(\d+)/i);
  if (!match) {
    throw new Error("Invalid flixcloud embed URL");
  }
  return {
    accessId: match[1],
    version: Number(match[2]),
  };
}

async function fetchTokenViaNet(token: string, referer: string): Promise<Record<string, string>> {
  const tokenResponse = await flixFetch(`${FLIXCLOUD_BASE}/api/m3u8/${token}`, {
    headers: {
      Accept: "application/json",
      Referer: referer,
      Origin: refererOrigin(referer),
      "User-Agent": getElectronUserAgent(),
    },
  });
  if (!tokenResponse.ok) {
    throw new Error(`Flixcloud token request failed (${tokenResponse.status})`);
  }
  return (await tokenResponse.json()) as Record<string, string>;
}

export async function decryptFlixcloudEmbedHtml(
  html: string,
  fetchTokenPayload: FlixcloudTokenPayloadFetcher
): Promise<FlixcloudStreamResult> {
  const startedAt = Date.now();
  log("decrypt:start", { htmlBytes: html.length });

  const data = parseSsrDataObject(extractSsrDataObjectLiteral(html));
  logStep("ssr parse", startedAt);
  const seed = data.obfuscation_seed;
  if (!seed) {
    throw new Error("Flixcloud obfuscation seed missing");
  }

  const fields = deriveObfuscatedFieldNames(seed);
  const cryptoObject = readNestedCryptoObject(asRecord(data.obfuscated_crypto_data), fields);
  const frag1 = decodeBase64(String(cryptoObject[fields.keyField] ?? ""));
  const iv = decodeBase64(String(cryptoObject[fields.ivField] ?? ""));
  const keyFrag2 = decodeBase64(String(data[fields.keyFrag2Field] ?? ""));
  const token = data[fields.tokenField];

  if (typeof token !== "string" || !token) {
    throw new Error("Flixcloud token field missing from embed data");
  }

  const tokenStartedAt = Date.now();
  const tokenData = await fetchTokenPayload(token);
  logStep("token fetch", tokenStartedAt, `keys=${Object.keys(tokenData).join(",")}`);
  const videoKey = sha256Hex(`${token}vid`).substring(0, 10);
  const keyKey = sha256Hex(`${token}key`).substring(0, 10);
  const encryptedUrl = decodeBase64(tokenData[videoKey] ?? "");
  const tokenBytes = decodeBase64(tokenData[keyKey] ?? "");

  if (!encryptedUrl.length || !tokenBytes.length) {
    throw new Error(`Flixcloud token payload missing fields: ${Object.keys(tokenData).join(", ")}`);
  }

  const seedInt = parseInt(seed.substring(0, 8), 16);
  const wasmStartedAt = Date.now();
  const { keyMaterial: wasmOut, playlistKey } = await runWasmDecrypt(
    String(data.w_payload ?? ""),
    frag1,
    keyFrag2,
    tokenBytes,
    seedInt
  );
  logStep("wasm", wasmStartedAt, `bytes=${wasmOut.length}`);
  const derived = pbkdf2Sync(wasmOut, seed, 1000, 32, "sha256");
  const mixed = Buffer.from(derived);
  for (let i = 0; i < 32; i++) {
    mixed[i] ^= seed.charCodeAt(i % seed.length);
  }
  const aesKey = createHash("sha256").update(mixed).digest();

  const decipher = createDecipheriv("aes-256-cbc", aesKey, iv);
  const url = Buffer.concat([decipher.update(encryptedUrl), decipher.final()])
    .toString("utf8")
    .trim();

  if (!url.startsWith("http")) {
    throw new Error(`Flixcloud decrypted unexpected URL: ${url.slice(0, 80)}`);
  }

  logStep("decrypt total", startedAt, `url=${url.slice(0, 96)}`);

  return {
    url,
    playlistKey,
    subtitles: Array.isArray(data.subtitles) ? data.subtitles : [],
    thumbnailsVtt: data.thumbnails_vtt ?? null,
    videoTitle: data.video_title ?? null,
    introChapter: data.intro_chapter ?? null,
    outroChapter: data.outro_chapter ?? null,
    videoId: data.video_id ?? null,
  };
}

export async function decryptFlixcloudLink(
  link: string,
  options?: { referer?: string }
): Promise<FlixcloudStreamResult> {
  const { accessId, version } = parseFlixcloudEmbedLink(link);
  const referer = options?.referer ?? "https://reanime.to/";
  const embedUrl = `${FLIXCLOUD_BASE}/e/${accessId}?v=${version}`;
  log("embed:fetch", { accessId, version, referer });

  const errors: string[] = [];

  const fetchTokenViaCurl: FlixcloudTokenPayloadFetcher = async (token: string) =>
    curlFetchFlixcloudJson(`${FLIXCLOUD_BASE}/api/m3u8/${token}`, referer);

  try {
    const html = await curlFetchFlixcloudHtml(embedUrl, referer);
    return await decryptFlixcloudEmbedHtml(html, fetchTokenViaCurl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    errors.push(`curl: ${message}`);
    log("embed:curl-failed", { reason: message });
  }

  try {
    log("embed:browser-fallback", { embedUrl });
    return await withFlixcloudBrowser(embedUrl, referer, (html, fetchTokenPayload) =>
      decryptFlixcloudEmbedHtml(html, fetchTokenPayload)
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    errors.push(`browser: ${message}`);
    log("embed:browser-failed", { reason: message });
  }

  try {
    const response = await flixFetch(embedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        Referer: referer,
        Origin: refererOrigin(referer),
        "User-Agent": getElectronUserAgent(),
      },
    });
    if (!response.ok) {
      throw new Error(`Flixcloud embed fetch failed (${response.status})`);
    }
    const html = await response.text();
    return await decryptFlixcloudEmbedHtml(html, (token) => fetchTokenViaNet(token, referer));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    errors.push(`net: ${message}`);
  }

  throw new Error(`Flixcloud decrypt failed: ${errors.join("; ")}`);
}

export { FLIXCLOUD_REFERER };
