/*
 * The following provider is a typescript port of the original allanime stream provider from pystardust/ani-cli.
 * See https://github.com/pystardust/ani-cli (allanime stream provider).
 */
import { StreamProvider, StreamUrlResult } from "./stream-provider";

const ALLANIME_REFERER = "https://allmanga.to";
const ALLANIME_BASE = "allanime.day";
const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";
const IS_DEV = process.env.NODE_ENV !== "production";

const EPISODE_EMBED_GQL = `query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }`;

const OBFUSCATED_DECODE_TABLE: Record<string, string> = {
  "79": "A",
  "7a": "B",
  "7b": "C",
  "7c": "D",
  "7d": "E",
  "7e": "F",
  "7f": "G",
  "70": "H",
  "71": "I",
  "72": "J",
  "73": "K",
  "74": "L",
  "75": "M",
  "76": "N",
  "77": "O",
  "68": "P",
  "69": "Q",
  "6a": "R",
  "6b": "S",
  "6c": "T",
  "6d": "U",
  "6e": "V",
  "6f": "W",
  "60": "X",
  "61": "Y",
  "62": "Z",
  "59": "a",
  "5a": "b",
  "5b": "c",
  "5c": "d",
  "5d": "e",
  "5e": "f",
  "5f": "g",
  "50": "h",
  "51": "i",
  "52": "j",
  "53": "k",
  "54": "l",
  "55": "m",
  "56": "n",
  "57": "o",
  "48": "p",
  "49": "q",
  "4a": "r",
  "4b": "s",
  "4c": "t",
  "4d": "u",
  "4e": "v",
  "4f": "w",
  "40": "x",
  "41": "y",
  "42": "z",
  "08": "0",
  "09": "1",
  "0a": "2",
  "0b": "3",
  "0c": "4",
  "0d": "5",
  "0e": "6",
  "0f": "7",
  "00": "8",
  "01": "9",
  "15": "-",
  "16": ".",
  "67": "_",
  "46": "~",
  "02": ":",
  "17": "/",
  "07": "?",
  "1b": "#",
  "63": "[",
  "65": "]",
  "78": "@",
  "19": "!",
  "1c": "$",
  "1e": "&",
  "10": "(",
  "11": ")",
  "12": "*",
  "13": "+",
  "14": ",",
  "03": ";",
  "05": "=",
  "1d": "%",
};

interface SourceUrl {
  sourceName?: string;
  sourceUrl?: string;
}

interface EpisodeResponse {
  data?: {
    episode?: {
      sourceUrls?: SourceUrl[];
    };
  };
}

interface StreamCandidate {
  url: string;
  quality: number;
  referer: string;
}

interface ProviderPayloadCandidate {
  url: string;
  quality: number;
}

interface ProviderPayloadExtract {
  candidates: ProviderPayloadCandidate[];
  m3u8Referer: string;
}

const SUPPORTED_SOURCE_NAMES = new Set(["Default", "Yt-mp4", "S-mp4"]);

function toAbsoluteAllAnimeUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith("http") ? pathOrUrl : `https://${ALLANIME_BASE}${pathOrUrl}`;
}

function refererForDirectUrl(url: string): string {
  return url.includes("tools.fast4speed.rsvp") ? ALLANIME_REFERER : "";
}

function isSupportedObfuscatedSource(source: SourceUrl): boolean {
  return Boolean(
    source.sourceUrl?.startsWith("--") &&
      source.sourceName &&
      SUPPORTED_SOURCE_NAMES.has(source.sourceName)
  );
}

function getEpisodeSources(json: EpisodeResponse): SourceUrl[] {
  return (json.data?.episode?.sourceUrls ?? []).filter(isSupportedObfuscatedSource);
}

function logStep(label: string, startedAt: number, extra?: string): void {
  if (!IS_DEV) return;
  const durationMs = Date.now() - startedAt;
  const suffix = extra ? ` | ${extra}` : "";
  console.info(`[allanime-stream] ${label} (${durationMs}ms)${suffix}`);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`allanime request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}

function decodeObfuscatedProviderPath(sourceUrl: string): string {
  const encoded = sourceUrl.startsWith("--") ? sourceUrl.slice(2) : sourceUrl;
  if (encoded.length % 2 !== 0) {
    throw new Error("Invalid obfuscated source URL length");
  }

  let decoded = "";
  for (let i = 0; i < encoded.length; i += 2) {
    const chunk = encoded.slice(i, i + 2).toLowerCase();
    const mapped = OBFUSCATED_DECODE_TABLE[chunk];
    if (!mapped) {
      throw new Error(`Unknown obfuscated chunk: ${chunk}`);
    }
    decoded += mapped;
  }

  return decoded.replace("/clock", "/clock.json");
}

function parseQuality(value: string): number {
  const matched = value.match(/(\d{3,4})/);
  if (!matched) return 0;
  return Number(matched[1]);
}

function collectProviderCandidates(node: unknown, out: ProviderPayloadExtract): void {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectProviderCandidates(item, out);
    }
    return;
  }

  if (typeof node !== "object") return;

  const record = node as Record<string, unknown>;
  const link = typeof record.link === "string" ? record.link : "";
  const resolutionStr = typeof record.resolutionStr === "string" ? record.resolutionStr : "";
  if (link && resolutionStr) {
    out.candidates.push({ url: link, quality: parseQuality(resolutionStr) });
  }

  const hls = typeof record.hls === "string" ? record.hls : "";
  const hlsUrl = typeof record.url === "string" ? record.url : "";
  const hardsubLang = typeof record.hardsub_lang === "string" ? record.hardsub_lang : "";
  if (hls === "hls" && hlsUrl && hardsubLang === "en-US") {
    out.candidates.push({ url: hlsUrl, quality: 0 });
  }

  const referer = typeof record.Referer === "string" ? record.Referer : "";
  if (referer) {
    out.m3u8Referer = referer;
  }

  for (const value of Object.values(record)) {
    collectProviderCandidates(value, out);
  }
}

async function expandMasterM3u8(
  masterUrl: string,
  referer: string
): Promise<{ url: string; quality: number } | null> {
  const res = await fetch(masterUrl, {
    method: "GET",
    headers: {
      Referer: referer,
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) return null;
  if (!res.body) return null;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawExtM3uHeader = false;
  let pendingQuality: number | null = null;
  let bestVariant: { url: string; quality: number } | null = null;

  const processLine = (rawLine: string) => {
    const line = rawLine.trim();
    if (!line) return;

    if (line.startsWith("#EXTM3U")) {
      sawExtM3uHeader = true;
      return;
    }

    if (line.startsWith("#EXT-X-STREAM-INF")) {
      if (line.includes("EXT-X-I-FRAME")) {
        pendingQuality = null;
        return;
      }
      const resolutionMatch = line.match(/RESOLUTION=\d+x(\d{3,4})/);
      pendingQuality = resolutionMatch ? Number(resolutionMatch[1]) : 0;
      return;
    }

    if (line.startsWith("#")) return;
    if (pendingQuality == null) return;

    const absoluteUrl = new URL(line, masterUrl).toString();
    if (!bestVariant || pendingQuality > bestVariant.quality) {
      bestVariant = { url: absoluteUrl, quality: pendingQuality };
    }
    pendingQuality = null;
  };

  let streamDone = false;
  while (!streamDone) {
    const { value, done } = await reader.read();
    streamDone = done;
    if (streamDone) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      processLine(line);
    }
  }

  buffer += decoder.decode();
  if (buffer) {
    processLine(buffer);
  }

  if (!sawExtM3uHeader) return null;
  return bestVariant;
}

function selectBestCandidate(candidates: StreamCandidate[]): StreamCandidate | null {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.quality - a.quality);
  return candidates[0];
}

async function buildCandidateFromProviderPayload(
  candidate: ProviderPayloadCandidate,
  m3u8Referer: string
): Promise<StreamCandidate | null> {
  if (!candidate.url) return null;

  if (candidate.url.includes("master.m3u8")) {
    if (!m3u8Referer) return null;
    const m3u8StartedAt = Date.now();
    const bestVariant = await expandMasterM3u8(candidate.url, m3u8Referer);
    logStep("m3u8 variant expansion", m3u8StartedAt, bestVariant ? "ok" : "no-variant");
    if (!bestVariant) return null;
    return { url: bestVariant.url, quality: bestVariant.quality, referer: m3u8Referer };
  }

  return {
    url: candidate.url,
    quality: candidate.quality,
    referer: refererForDirectUrl(candidate.url),
  };
}

async function resolveSourceToCandidates(
  sourceUrl: string,
  sourceName?: string
): Promise<StreamCandidate[]> {
  const decodeStartedAt = Date.now();
  const decodedPath = decodeObfuscatedProviderPath(sourceUrl);
  logStep("provider path decode", decodeStartedAt);

  const providerUrl = toAbsoluteAllAnimeUrl(decodedPath);

  // ani-cli behavior: Yt-mp4 (fast4speed) decoded path is already a direct playable URL.
  if (sourceName === "Yt-mp4") {
    const referer = refererForDirectUrl(providerUrl);
    logStep("yt-mp4 direct url shortcut", decodeStartedAt);
    return [{ url: providerUrl, quality: 0, referer }];
  }

  const providerFetchStartedAt = Date.now();
  const providerRes = await fetch(providerUrl, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": USER_AGENT,
    },
  });
  if (!providerRes.ok) {
    logStep("provider fetch failed", providerFetchStartedAt, `status=${providerRes.status}`);
    return [];
  }
  logStep("provider fetch", providerFetchStartedAt);

  const extractStartedAt = Date.now();
  const payload = (await providerRes.json()) as unknown;
  const extracted: ProviderPayloadExtract = { candidates: [], m3u8Referer: "" };
  collectProviderCandidates(payload, extracted);
  logStep("provider candidate extraction", extractStartedAt, `raw=${extracted.candidates.length}`);

  const streamCandidates: StreamCandidate[] = [];
  const normalizeStartedAt = Date.now();
  for (const candidate of extracted.candidates) {
    const resolvedCandidate = await buildCandidateFromProviderPayload(
      candidate,
      extracted.m3u8Referer
    );
    if (resolvedCandidate) {
      streamCandidates.push(resolvedCandidate);
    }
  }
  logStep(
    "provider candidate normalization",
    normalizeStartedAt,
    `usable=${streamCandidates.length}`
  );

  return streamCandidates;
}

export class AllAnimeStreamProvider implements StreamProvider {
  async getStreamUrl(
    showId: string,
    episode: string,
    mode: "sub" | "dub" = "sub"
  ): Promise<StreamUrlResult> {
    const totalStartedAt = Date.now();

    const episodeQueryStartedAt = Date.now();
    const variables = {
      showId,
      translationType: mode,
      episodeString: episode,
    };
    const url = `${ALLANIME_API}/api?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(EPISODE_EMBED_GQL)}`;
    const json = await fetchJson<EpisodeResponse>(url);
    logStep("episode gql fetch", episodeQueryStartedAt);

    const sourceFilterStartedAt = Date.now();
    const selectedSources = getEpisodeSources(json);
    logStep("source filtering", sourceFilterStartedAt, `obfuscated=${selectedSources.length}`);

    if (selectedSources.length === 0) {
      throw new Error("No obfuscated allanime sources found for this episode");
    }

    const providerStartedAt = Date.now();
    const candidateGroups = await Promise.all(
      selectedSources.map(async (source) => {
        const sourceUrl = source.sourceUrl;
        if (!sourceUrl) return [];

        const sourceStartedAt = Date.now();
        try {
          const candidates = await resolveSourceToCandidates(sourceUrl, source.sourceName);
          logStep(`provider resolve: ${source.sourceName ?? "unknown"}`, sourceStartedAt);
          return candidates;
        } catch (error: unknown) {
          logStep(
            `provider resolve failed: ${source.sourceName ?? "unknown"}`,
            sourceStartedAt,
            error instanceof Error ? error.message : "unknown error"
          );
          return [];
        }
      })
    );
    const allCandidates = candidateGroups.flat();
    logStep("provider resolution total", providerStartedAt, `candidates=${allCandidates.length}`);

    const best = selectBestCandidate(allCandidates);
    if (!best) {
      throw new Error("No valid stream candidates found");
    }

    logStep("stream resolution total", totalStartedAt, `quality=${best.quality}`);
    return {
      url: best.url,
      referer: best.referer,
    };
  }
}
