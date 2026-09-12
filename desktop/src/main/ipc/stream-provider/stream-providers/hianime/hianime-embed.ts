/**
 * ZokoAnime embed config is shipped as base64(json XOR "otaku-embed-v1").
 * @see https://github.com/pystardust/ani-cli (deobfuscate_blob / hianime_m3u8)
 */
import type { StreamSubtitleTrack } from "../stream-provider";

const EMBED_XOR_KEY = Buffer.from("otaku-embed-v1", "utf8");

export interface HianimeEmbedConfig {
  masterUrl: string;
  subtitles: StreamSubtitleTrack[];
}

export function deobfuscateEmbedBlob(b64: string): string {
  const bytes = Buffer.from(b64.trim(), "base64");
  if (bytes.length === 0) {
    throw new Error("HiAnime embed blob was empty");
  }
  const keyLen = EMBED_XOR_KEY.length;
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    const keyByte = EMBED_XOR_KEY[i % keyLen] ?? 0;
    out[i] = byte ^ keyByte;
  }
  return out.toString("utf8");
}

export function extractEmbedBlob(html: string): string | null {
  const match = /window\.__P\s*=\s*"([^"]*)"/i.exec(html);
  return match?.[1]?.trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function guessSubtitleFormat(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".ass") || pathname.endsWith(".ssa")) return "ass";
    if (pathname.endsWith(".vtt")) return "vtt";
    if (pathname.endsWith(".srt")) return "srt";
  } catch {
    // ignore
  }
  return "vtt";
}

function pickM3u8(data: Record<string, unknown>): string | null {
  const direct = typeof data.src === "string" ? data.src.trim() : "";
  if (/\.m3u8(?:\?|$)/i.test(direct)) return direct.replace(/\\\//g, "/");

  const sources = data.sources;
  if (Array.isArray(sources)) {
    for (const item of sources) {
      const record = asRecord(item);
      const src = typeof record?.src === "string" ? record.src.trim() : "";
      if (/\.m3u8(?:\?|$)/i.test(src)) return src.replace(/\\\//g, "/");
      const file = typeof record?.file === "string" ? record.file.trim() : "";
      if (/\.m3u8(?:\?|$)/i.test(file)) return file.replace(/\\\//g, "/");
    }
  }

  const file = typeof data.file === "string" ? data.file.trim() : "";
  if (/\.m3u8(?:\?|$)/i.test(file)) return file.replace(/\\\//g, "/");
  return null;
}

function parseSubtitleTracks(raw: unknown): StreamSubtitleTrack[] {
  if (!Array.isArray(raw)) return [];
  const tracks: StreamSubtitleTrack[] = [];
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const url =
      (typeof record.src === "string" && record.src.trim()) ||
      (typeof record.file === "string" && record.file.trim()) ||
      (typeof record.url === "string" && record.url.trim()) ||
      "";
    if (!url) continue;
    const language =
      (typeof record.label === "string" && record.label.trim()) ||
      (typeof record.lang === "string" && record.lang.trim()) ||
      (typeof record.language === "string" && record.language.trim()) ||
      "Unknown";
    tracks.push({
      url: url.replace(/\\\//g, "/"),
      language,
      format: guessSubtitleFormat(url),
      default: record.default === true,
    });
  }
  return tracks;
}

export function parseEmbedConfig(jsonText: string): HianimeEmbedConfig {
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("HiAnime embed config was not valid JSON");
  }
  const record = asRecord(data);
  if (!record) {
    throw new Error("HiAnime embed config was not an object");
  }
  const masterUrl = pickM3u8(record);
  if (!masterUrl) {
    throw new Error("HiAnime embed config missing m3u8 src");
  }
  return {
    masterUrl,
    subtitles: parseSubtitleTracks(record.subtitles),
  };
}

export function decodeEmbedHash(hash: string): string {
  const embed = Buffer.from(hash.trim(), "base64").toString("utf8").trim();
  if (!/^https?:\/\//i.test(embed)) {
    throw new Error("HiAnime ZokoAnime hash did not decode to an embed URL");
  }
  return embed;
}

export function embedOriginReferer(embedUrl: string): string {
  return `${new URL(embedUrl).origin}/`;
}

export function extractMalIdFromEmbed(embedUrl: string): number | null {
  const match = /\/mal\/(\d+)\//i.exec(embedUrl);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
