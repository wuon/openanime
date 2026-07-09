import { getElectronUserAgent } from "@/main/electron-user-agent";
import { Episode, ShowSearchResult } from "@/shared/types";

import { StreamMode, StreamProvider, StreamUrlResult } from "./stream-provider";

const API_BASE = process.env.ANIMEPARADISE_API_BASE || "https://api.animeparadise.moe";
const STREAM_BASE = process.env.ANIMEPARADISE_STREAM_BASE || "https://stream.animeparadise.moe";
const REFERER = process.env.ANIMEPARADISE_REFERER || "https://animeparadise.moe/";
const SEARCH_LIMIT = 36;
const IS_DEV = process.env.NODE_ENV !== "production";

interface AnimeParadisePosterImage {
  large?: string;
  medium?: string;
  small?: string;
}

interface AnimeParadiseAlternativeTitle {
  english?: string;
  native?: string;
  romaji?: string;
}

interface AnimeParadiseAnimeSeason {
  season?: string;
  year?: number;
}

interface AnimeParadiseMappings {
  anilist?: number;
  myanimelist?: number;
}

interface AnimeParadiseSearchItem {
  _id?: string;
  title?: string;
  link?: string;
  episodes?: number;
  episodeCount?: number;
  rate?: string;
  genres?: string[];
  posterImage?: AnimeParadisePosterImage;
  alternativeTitle?: AnimeParadiseAlternativeTitle;
  animeSeason?: AnimeParadiseAnimeSeason;
  released?: string;
  year?: number;
}

interface AnimeParadiseEpisodeItem {
  uid?: string;
  number?: string | number;
  title?: string;
  image?: string;
  origin?: string;
}

interface AnimeParadiseAnimeData {
  _id?: string;
  title?: string;
  link?: string;
  mappings?: AnimeParadiseMappings;
}

interface AnimeParadiseEpisodeDetails {
  streamLink?: string;
}

interface AnimeParadiseEpisodeResponse {
  episode?: AnimeParadiseEpisodeDetails;
  animeData?: AnimeParadiseAnimeData;
}

interface AnimeParadiseAnimeDetails extends AnimeParadiseSearchItem {
  type?: string;
  synopsys?: string;
  mappings?: AnimeParadiseMappings;
}

interface AnimeParadiseApiResponse<T> {
  success?: boolean;
  data?: T;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractAnilistId(item: {
  mappings?: AnimeParadiseMappings;
  posterImage?: AnimeParadisePosterImage;
}): string | null {
  const mapped = item.mappings?.anilist;
  if (typeof mapped === "number" && mapped > 0) {
    return String(mapped);
  }

  const posterUrl =
    item.posterImage?.large ?? item.posterImage?.medium ?? item.posterImage?.small;
  if (!posterUrl) return null;
  const match = posterUrl.match(/\/bx(\d+)-/i);
  return match?.[1] ?? null;
}

function pickThumbnail(
  poster?: AnimeParadisePosterImage,
  episodeImage?: string | null
): string | null {
  const episode = episodeImage?.trim();
  if (episode) return episode;
  return poster?.medium?.trim() || poster?.large?.trim() || poster?.small?.trim() || null;
}

function mapTitle(
  item: Pick<AnimeParadiseSearchItem, "title" | "alternativeTitle">,
  fallback: string
) {
  const alt = item.alternativeTitle;
  return {
    english: alt?.english?.trim() || item.title?.trim() || fallback,
    romanji: alt?.romaji?.trim() || undefined,
    native: alt?.native?.trim() || undefined,
  };
}

function mapSeason(item: AnimeParadiseSearchItem) {
  const quarter = item.animeSeason?.season?.trim();
  const year =
    item.animeSeason?.year ??
    item.year ??
    (item.released ? new Date(item.released).getUTCFullYear() : undefined);
  if (!quarter && !year) return undefined;
  return {
    quarter: quarter || undefined,
    year: year && year > 0 ? year : undefined,
  };
}

function mapSearchItemToShowSearchResult(item: AnimeParadiseSearchItem): ShowSearchResult | null {
  const providerId = asString(item._id);
  if (!providerId) return null;

  const episodeCount = asNumber(item.episodes ?? item.episodeCount) ?? undefined;
  const score = asNumber(item.rate) ?? undefined;

  return {
    id: extractAnilistId(item) ?? providerId,
    providerId,
    title: mapTitle(item, providerId),
    thumbnail: pickThumbnail(item.posterImage),
    availableEpisodes: {
      sub: episodeCount,
    },
    score,
    type: "TV",
    season: mapSeason(item),
  };
}

function mapSearchItemToEpisode(item: AnimeParadiseSearchItem, mode: StreamMode): Episode {
  const providerId = item._id ?? "";
  const index = asNumber(item.episodes ?? item.episodeCount) ?? 0;

  return {
    id: extractAnilistId(item) ?? providerId,
    providerId,
    title: mapTitle(item, providerId),
    thumbnail: pickThumbnail(item.posterImage),
    index,
    mode,
  };
}

export class AnimeParadiseStreamProvider implements StreamProvider {
  private readonly episodesCache = new Map<
    string,
    { expiresAt: number; value: AnimeParadiseEpisodeItem[] }
  >();
  private readonly episodesInFlight = new Map<string, Promise<AnimeParadiseEpisodeItem[]>>();
  private readonly episodesCacheTtlMs = 5 * 60_000;

  private log(event: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.info(`[animeparadise-provider] ${event}${suffix}`);
  }

  private async apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const startedAt = Date.now();
    const url = new URL(`${API_BASE}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    this.log("api:start", { path, params: params ?? null });

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": getElectronUserAgent(),
      },
    });
    if (!response.ok) {
      this.log("api:failed", { path, status: response.status, ms: Date.now() - startedAt });
      throw new Error(`AnimeParadise request failed (${response.status}): ${path}`);
    }

    const json = (await response.json()) as T;
    this.log("api:done", { path, status: response.status, ms: Date.now() - startedAt });
    return json;
  }

  private async fetchEpisodes(providerId: string): Promise<AnimeParadiseEpisodeItem[]> {
    const cached = this.episodesCache.get(providerId);
    if (cached && cached.expiresAt > Date.now()) {
      this.log("episodes:cache-hit", { providerId, count: cached.value.length });
      return cached.value;
    }

    const existing = this.episodesInFlight.get(providerId);
    if (existing !== undefined) {
      this.log("episodes:inflight-hit", { providerId });
      return existing;
    }

    const task = this.loadEpisodes(providerId).finally(() => {
      this.episodesInFlight.delete(providerId);
    });
    this.episodesInFlight.set(providerId, task);
    return task;
  }

  private async loadEpisodes(providerId: string): Promise<AnimeParadiseEpisodeItem[]> {
    const startedAt = Date.now();
    this.log("episodes:start", { providerId });

    const json = await this.apiGet<AnimeParadiseApiResponse<AnimeParadiseEpisodeItem[]>>(
      `/anime/${encodeURIComponent(providerId)}/episode`
    );
    const episodes = Array.isArray(json.data) ? json.data : [];
    this.episodesCache.set(providerId, {
      expiresAt: Date.now() + this.episodesCacheTtlMs,
      value: episodes,
    });
    this.log("episodes:done", {
      providerId,
      count: episodes.length,
      ms: Date.now() - startedAt,
    });
    return episodes;
  }

  private async resolveEpisodeUid(
    providerId: string,
    episodeNumber: number
  ): Promise<{ uid: string; episode: AnimeParadiseEpisodeItem }> {
    const episodes = await this.fetchEpisodes(providerId);
    const match = episodes.find((item) => asNumber(item.number) === episodeNumber);
    const uid = asString(match?.uid);
    if (!match || !uid) {
      throw new Error(`AnimeParadise episode ${episodeNumber} not found for ${providerId}`);
    }
    return { uid, episode: match };
  }

  private async fetchEpisodeDetails(
    providerId: string,
    uid: string
  ): Promise<AnimeParadiseEpisodeResponse> {
    const json = await this.apiGet<AnimeParadiseApiResponse<AnimeParadiseEpisodeResponse>>(
      `/ep/${encodeURIComponent(uid)}`,
      { origin: providerId }
    );
    return json.data ?? {};
  }

  private async fetchAnimeDetailsByLink(link: string): Promise<AnimeParadiseAnimeDetails | null> {
    const json = await this.apiGet<AnimeParadiseApiResponse<AnimeParadiseAnimeDetails>>(
      `/anime/${encodeURIComponent(link)}`
    );
    return json.data ?? null;
  }

  async getStreamUrl(
    _id: string | null,
    providerId: string | null,
    episode: string,
    mode: StreamMode = "sub"
  ): Promise<StreamUrlResult> {
    const startedAt = Date.now();
    this.log("stream:start", { providerId, episode, mode });

    if (mode === "dub") {
      throw new Error("AnimeParadise does not provide dubbed streams");
    }
    if (!providerId) {
      throw new Error("Missing providerId for AnimeParadise stream lookup");
    }

    const episodeNumber = Number(episode);
    if (!Number.isFinite(episodeNumber) || episodeNumber < 1) {
      throw new Error(`Invalid episode number for AnimeParadise: ${episode}`);
    }

    const { uid } = await this.resolveEpisodeUid(providerId, episodeNumber);
    const details = await this.fetchEpisodeDetails(providerId, uid);
    const streamLink = asString(details.episode?.streamLink);
    if (!streamLink) {
      throw new Error("AnimeParadise: no streamLink in response");
    }

    const url = `${STREAM_BASE}/m3u8?url=${encodeURIComponent(streamLink)}`;
    this.log("stream:done", {
      providerId,
      episode,
      uid,
      urlPreview: url.slice(0, 96),
      ms: Date.now() - startedAt,
    });
    return { url, referer: REFERER };
  }

  async getRecentUploads(
    page: number,
    limit = 12,
    mode: StreamMode = "sub"
  ): Promise<Episode[]> {
    const startedAt = Date.now();
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    this.log("recent:start", { page: safePage, limit: safeLimit, mode });

    if (mode === "dub") {
      this.log("recent:done", { page: safePage, returned: 0, reason: "dub-unsupported" });
      return [];
    }

    const json = await this.apiGet<AnimeParadiseApiResponse<AnimeParadiseSearchItem[]>>(
      "/search",
      {
        limit: String(safeLimit),
        page: String(safePage),
      }
    );
    const rows = Array.isArray(json.data) ? json.data : [];
    const episodes = rows.map((item) => mapSearchItemToEpisode(item, mode));
    this.log("recent:done", {
      page: safePage,
      fetched: rows.length,
      returned: episodes.length,
      ms: Date.now() - startedAt,
    });
    return episodes;
  }

  async search(query: string): Promise<ShowSearchResult[]> {
    const startedAt = Date.now();
    const trimmed = query.trim();
    this.log("search:start", { query: trimmed });

    if (trimmed.length === 0) {
      const episodes = await this.getRecentUploads(1, SEARCH_LIMIT, "sub");
      const results = episodes.map((episode) => ({
        id: episode.id,
        providerId: episode.providerId,
        title: {
          english: episode.title.english ?? episode.providerId,
          romanji: episode.title.romanji,
          native: episode.title.native,
        },
        thumbnail: episode.thumbnail,
        availableEpisodes: {
          sub: episode.index > 0 ? episode.index : undefined,
        },
      }));
      this.log("search:done", {
        query: trimmed,
        source: "recent-uploads",
        results: results.length,
        ms: Date.now() - startedAt,
      });
      return results;
    }

    const json = await this.apiGet<AnimeParadiseApiResponse<AnimeParadiseSearchItem[]>>(
      "/search",
      {
        q: trimmed,
        limit: String(SEARCH_LIMIT),
      }
    );
    const rows = Array.isArray(json.data) ? json.data : [];
    const results = rows
      .map((item) => mapSearchItemToShowSearchResult(item))
      .filter((item): item is ShowSearchResult => item !== null);
    this.log("search:done", {
      query: trimmed,
      source: "api",
      rows: rows.length,
      results: results.length,
      ms: Date.now() - startedAt,
    });
    return results;
  }

  async getEpisodesList(providerId: string): Promise<string[]> {
    const startedAt = Date.now();
    this.log("episodes-list:start", { providerId });

    const episodes = await this.fetchEpisodes(providerId);
    const numbers = episodes
      .map((item) => asNumber(item.number))
      .filter((value): value is number => value !== null);

    const list = [...new Set(numbers)]
      .sort((a, b) => a - b)
      .map(String);
    this.log("episodes-list:done", {
      providerId,
      count: list.length,
      ms: Date.now() - startedAt,
    });
    return list;
  }

  async getShowDetails(providerId: string): Promise<{
    id: string;
    providerId: string;
    name: string;
    thumbnail: string | null;
    type: string;
    description: string | null;
  }> {
    const startedAt = Date.now();
    this.log("details:start", { providerId });

    const episodes = await this.fetchEpisodes(providerId);
    const firstUid = asString(episodes[0]?.uid);
    if (!firstUid) {
      throw new Error(`AnimeParadise show not found: ${providerId}`);
    }

    const episodeDetails = await this.fetchEpisodeDetails(providerId, firstUid);
    const animeData = episodeDetails.animeData;
    const link = asString(animeData?.link);
    const fallbackTitle = animeData?.title?.trim() || providerId;

    let details: AnimeParadiseAnimeDetails | null = null;
    if (link) {
      try {
        details = await this.fetchAnimeDetailsByLink(link);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown error";
        this.log("details:link-fetch-failed", { providerId, link, error: message });
      }
    }

    const merged = details ?? animeData ?? {};
    const name = details?.title?.trim() || fallbackTitle;
    const result = {
      id: extractAnilistId(merged) ?? providerId,
      providerId,
      name,
      thumbnail: pickThumbnail(details?.posterImage, episodes[0]?.image),
      type: details?.type?.trim() || "TV",
      description: details?.synopsys?.trim() || null,
    };
    this.log("details:done", {
      providerId,
      name: result.name,
      anilistId: result.id,
      ms: Date.now() - startedAt,
    });
    return result;
  }
}
