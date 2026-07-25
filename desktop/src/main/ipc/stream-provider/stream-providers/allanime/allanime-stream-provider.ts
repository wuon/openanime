/*
 * The following provider is a typescript port of the original allanime stream provider from pystardust/ani-cli.
 * See https://github.com/pystardust/ani-cli (allanime stream provider).
 */
import { getElectronUserAgent } from "@/main/electron-user-agent";
import { Episode, ShowSearchResult } from "@/shared/types";

import { StreamMode, StreamProvider, StreamUrlResult } from "../stream-provider";
import {
  ALLANIME_REFERER,
  allAnimeGql,
  getEpisodeEmbedPersistedQuery,
  normalizeAllAnimePayload,
} from "./allanime-gql";

const ALLANIME_BASE = "allanime.day";
const IS_DEV = process.env.NODE_ENV !== "production";

const MP4UPLOAD_REFERER = "https://www.mp4upload.com/";
const PROVIDER_FETCH_TIMEOUT_MS = 25_000;

const RECENT_UPLOADS_GQL = `
  query (
    $search: SearchInput
    $limit: Int
    $page: Int
    $translationType: VaildTranslationTypeEnumType
    $countryOrigin: VaildCountryOriginEnumType
  ) {
    shows(
      search: $search
      limit: $limit
      page: $page
      translationType: $translationType
      countryOrigin: $countryOrigin
    ) {
      edges {
        _id
        aniListId
        name
        englishName
        nativeName
        thumbnail
        availableEpisodes
      }
    }
  }
`;

const SEARCH_GQL = `
  query (
    $search: SearchInput
    $limit: Int
    $page: Int
    $translationType: VaildTranslationTypeEnumType
    $countryOrigin: VaildCountryOriginEnumType
  ) {
    shows(
      search: $search
      limit: $limit
      page: $page
      translationType: $translationType
      countryOrigin: $countryOrigin
    ) {
      edges {
        _id
        aniListId
        name
        availableEpisodes
        score
        status
        thumbnail
        type
        englishName
        nativeName
        episodeDuration
        season
      }
    }
  }
`;

interface GqlShowEdge {
  _id: string;
  aniListId?: string;
  name?: string;
  englishName?: string;
  nativeName?: string;
  thumbnail?: string;
  availableEpisodes?: {
    sub?: number;
    dub?: number;
    raw?: number;
  };
  score?: number;
  status?: string;
  type?: string;
  episodeDuration?: number;
  season?: {
    quarter?: string;
    year?: number;
  };
}

interface GqlSearchResponse {
  data?: {
    shows?: {
      edges?: GqlShowEdge[];
    };
  };
}

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
  priority?: number;
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

const SUPPORTED_SOURCE_NAMES = new Set([
  "Default",
  "Luf-Mp4",
  "Yt-mp4",
  "S-mp4",
  "S-Mp4",
  "Mp4",
  "Uv-mp4",
  "Ak",
]);

const CLOCK_STUB_RETRY_ATTEMPTS = 4;
const CLOCK_STUB_RETRY_DELAY_MS = 400;

function toAbsoluteAllAnimeUrl(pathOrUrl: string): string {
  return pathOrUrl.startsWith("http") ? pathOrUrl : `https://${ALLANIME_BASE}${pathOrUrl}`;
}

function refererForDirectUrl(url: string): string {
  if (url.includes("mp4upload.com")) return MP4UPLOAD_REFERER;
  // ani-cli unsets the referer for sharepoint playback URLs.
  if (url.includes("sharepoint.com")) return "";
  // ani-cli defaults the playback referer to the allanime referer for everything else
  // (wixmp direct mp4 extracts, fast4speed Yt-mp4, and expanded m3u8 variants).
  return ALLANIME_REFERER;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = PROVIDER_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractMp4UploadLink(html: string): string | null {
  const match = html.match(/(?:src|file)\s*:\s*"([^"]+\.mp4[^"]*)"/);
  if (!match) return null;
  return match[1].replace(/\\u0026/g, "&").replace(/\\/g, "");
}

function isResolvableSource(source: SourceUrl): boolean {
  const url = source.sourceUrl;
  if (!url || !source.sourceName) return false;
  if (!SUPPORTED_SOURCE_NAMES.has(source.sourceName)) return false;
  return url.startsWith("--") || url.startsWith("http://") || url.startsWith("https://");
}

function getEpisodeSources(json: EpisodeResponse): SourceUrl[] {
  return (json.data?.episode?.sourceUrls ?? [])
    .filter(isResolvableSource)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

function isProviderPayloadPending(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const links = (payload as { links?: unknown }).links;
  if (!Array.isArray(links)) return false;
  return links.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { link?: string; resolutionStr?: string };
    return typeof record.resolutionStr === "string" && typeof record.link !== "string";
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(label: string, startedAt: number, extra?: string): void {
  if (!IS_DEV) return;
  const durationMs = Date.now() - startedAt;
  const suffix = extra ? ` | ${extra}` : "";
  console.info(`[allanime-stream] ${label} (${durationMs}ms)${suffix}`);
}

function getEpisodeCount(edge: GqlShowEdge, mode: StreamMode): number {
  const ep = edge.availableEpisodes?.[mode];
  if (ep == null) return 0;
  if (Array.isArray(ep)) return ep.length;
  if (typeof ep === "number") return ep;
  return 0;
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
  const res = await fetchWithTimeout(masterUrl, {
    method: "GET",
    headers: {
      Referer: referer,
      "User-Agent": getElectronUserAgent(),
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
    // Fetch the master playlist with the payload Referer (ani-cli's `m3u8_refr`),
    // falling back to the allanime referer when the payload doesn't carry one.
    const fetchReferer = m3u8Referer || ALLANIME_REFERER;
    const m3u8StartedAt = Date.now();
    const bestVariant = await expandMasterM3u8(candidate.url, fetchReferer);
    logStep("m3u8 variant expansion", m3u8StartedAt, bestVariant ? "ok" : "no-variant");
    if (!bestVariant) return null;
    return {
      url: bestVariant.url,
      quality: bestVariant.quality,
      referer: refererForDirectUrl(bestVariant.url),
    };
  }

  return {
    url: candidate.url,
    quality: candidate.quality,
    referer: refererForDirectUrl(candidate.url),
  };
}

async function fetchMp4UploadCandidates(embedUrl: string): Promise<StreamCandidate[]> {
  const mp4StartedAt = Date.now();
  const mp4Res = await fetchWithTimeout(embedUrl, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": getElectronUserAgent(),
    },
  });
  if (!mp4Res.ok) {
    logStep("mp4upload fetch failed", mp4StartedAt, `status=${mp4Res.status}`);
    return [];
  }
  const html = await mp4Res.text();
  const mp4Link = extractMp4UploadLink(html);
  logStep("mp4upload extract", mp4StartedAt, mp4Link ? "ok" : "no-link");
  if (!mp4Link) return [];
  return [{ url: mp4Link, quality: 0, referer: MP4UPLOAD_REFERER }];
}

async function resolveDirectSourceToCandidates(
  sourceUrl: string,
  sourceName: string
): Promise<StreamCandidate[]> {
  if (sourceName === "Yt-mp4") {
    return [{ url: sourceUrl, quality: 0, referer: refererForDirectUrl(sourceUrl) }];
  }
  if (sourceName === "Mp4") {
    return fetchMp4UploadCandidates(sourceUrl);
  }
  return [];
}

async function fetchProviderPayload(providerUrl: string): Promise<unknown> {
  let lastPayload: unknown = null;
  for (let attempt = 0; attempt < CLOCK_STUB_RETRY_ATTEMPTS; attempt++) {
    const providerRes = await fetchWithTimeout(providerUrl, {
      method: "GET",
      headers: {
        Referer: ALLANIME_REFERER,
        "User-Agent": getElectronUserAgent(),
      },
    });
    if (!providerRes.ok) {
      throw new Error(`Provider fetch failed with status ${providerRes.status}`);
    }
    const json: unknown = JSON.parse(await providerRes.text());
    lastPayload = normalizeAllAnimePayload(json);
    if (!isProviderPayloadPending(lastPayload)) {
      return lastPayload;
    }
    if (attempt < CLOCK_STUB_RETRY_ATTEMPTS - 1) {
      await sleep(CLOCK_STUB_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  return lastPayload;
}

async function resolveSourceToCandidates(
  sourceUrl: string,
  sourceName?: string
): Promise<StreamCandidate[]> {
  if (sourceName && (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://"))) {
    return resolveDirectSourceToCandidates(sourceUrl, sourceName);
  }

  const decodeStartedAt = Date.now();
  const decodedPath = decodeObfuscatedProviderPath(sourceUrl);
  logStep("provider path decode", decodeStartedAt);

  const providerUrl = toAbsoluteAllAnimeUrl(decodedPath);

  logStep("provider url", decodeStartedAt, providerUrl);

  // Provider behavior: Yt-mp4 (fast4speed) decoded path is already a direct playable URL.
  if (sourceName === "Yt-mp4") {
    const referer = refererForDirectUrl(providerUrl);
    logStep("yt-mp4 direct url shortcut", decodeStartedAt);
    return [{ url: providerUrl, quality: 0, referer }];
  }

  // Provider behavior: Mp4 (mp4upload) decoded path is an HTML embed; scrape the .mp4 link.
  if (sourceName === "Mp4") {
    return fetchMp4UploadCandidates(providerUrl);
  }

  const providerFetchStartedAt = Date.now();
  let payload: unknown;
  try {
    payload = await fetchProviderPayload(providerUrl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    logStep("provider fetch failed", providerFetchStartedAt, message);
    return [];
  }
  logStep("provider fetch", providerFetchStartedAt);

  const extractStartedAt = Date.now();
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

async function resolveSourceGroup(sources: SourceUrl[]): Promise<StreamCandidate[]> {
  const candidateGroups = await Promise.all(
    sources.map(async (source) => {
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
  return candidateGroups.flat();
}

export class AllAnimeStreamProvider implements StreamProvider {
  async getStreamUrl(
    _id: string | null,
    providerId: string | null,
    episode: string,
    mode: "sub" | "dub" = "sub"
  ): Promise<StreamUrlResult> {
    if (!providerId) {
      throw new Error("Missing providerId for AllAnime stream lookup");
    }
    const totalStartedAt = Date.now();

    const episodeQueryStartedAt = Date.now();
    const variables = {
      showId: providerId,
      translationType: mode,
      episodeString: episode,
    };
    const persisted = await getEpisodeEmbedPersistedQuery();
    const json = await allAnimeGql<EpisodeResponse>(variables, persisted.query, persisted.hash);
    logStep("episode gql fetch", episodeQueryStartedAt);

    const sourceFilterStartedAt = Date.now();
    const rawSources = json.data?.episode?.sourceUrls ?? [];
    const selectedSources = getEpisodeSources(json);
    logStep(
      "source filtering",
      sourceFilterStartedAt,
      `selected=${selectedSources.length} raw=${rawSources.length}`
    );
    if (IS_DEV && selectedSources.length === 0) {
      console.warn(
        `[allanime-stream] no resolvable sources; raw names=${JSON.stringify(
          rawSources.map((s) => s.sourceName)
        )} episode=${json.data?.episode == null ? "null" : "present"}`
      );
    }

    if (selectedSources.length === 0) {
      throw new Error("No playable allanime sources found for this episode");
    }

    const providerStartedAt = Date.now();

    // Yt-mp4 decodes to a direct URL with no clock.json fetch; resolve it alone so a
    // slow or timing-out provider (e.g. Luf-Mp4 at 25s) does not block playback.
    const ytMp4Source = selectedSources.find((source) => source.sourceName === "Yt-mp4");
    let allCandidates: StreamCandidate[] = [];
    if (ytMp4Source?.sourceUrl) {
      allCandidates = await resolveSourceGroup([ytMp4Source]);
      if (allCandidates.length > 0) {
        logStep(
          "provider resolution total",
          providerStartedAt,
          `candidates=${allCandidates.length} (yt-mp4 fast path)`
        );
      }
    }

    if (allCandidates.length === 0) {
      const fallbackSources = selectedSources.filter((source) => source.sourceName !== "Yt-mp4");
      allCandidates = await resolveSourceGroup(fallbackSources);
      logStep("provider resolution total", providerStartedAt, `candidates=${allCandidates.length}`);
    }

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

  async getRecentUploads(page: number, limit = 12, mode: StreamMode = "sub"): Promise<Episode[]> {
    const variables = {
      search: { allowAdult: false, allowUnknown: false },
      limit,
      page: Math.max(1, page),
      translationType: mode,
      countryOrigin: "ALL",
    };

    // Use POST (no persisted-query GET): the gateway's registered shows hash returns a
    // minimal selection set without aniListId, which breaks AniList enrichment and routing.
    const json = await allAnimeGql<GqlSearchResponse>(variables, RECENT_UPLOADS_GQL);
    const edges = json.data?.shows?.edges ?? [];

    const episodes = edges.map((edge) => {
      return {
        id: edge.aniListId ?? edge._id,
        providerId: edge._id,
        title: {
          english: edge.englishName,
          romanji: edge.name,
          native: edge.nativeName,
        },
        thumbnail: edge.thumbnail,
        index: getEpisodeCount(edge, mode),
        mode,
      };
    });

    return episodes;
  }

  async search(query: string, mode: StreamMode = "sub"): Promise<ShowSearchResult[]> {
    const variables = {
      search: {
        allowAdult: false,
        allowUnknown: false,
        query,
      },
      limit: 36,
      page: 1,
      translationType: mode,
      countryOrigin: "ALL",
    };

    const json = await allAnimeGql<GqlSearchResponse>(variables, SEARCH_GQL);
    const edges = json.data?.shows?.edges ?? [];

    const shows = edges.map((edge) => {
      return {
        id: edge.aniListId ?? edge._id,
        providerId: edge._id,
        title: {
          english: edge.englishName,
          romanji: edge.name,
          native: edge.nativeName,
        },
        thumbnail: edge.thumbnail,
        availableEpisodes: edge.availableEpisodes,
        score: edge.score,
        status: edge.status,
        type: edge.type,
        episodeDuration: edge.episodeDuration,
        season: edge.season,
      };
    });

    return shows;
  }
}
