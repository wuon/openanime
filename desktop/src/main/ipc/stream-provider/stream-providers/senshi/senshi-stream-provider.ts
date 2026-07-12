import { getElectronUserAgent } from "@/main/electron-user-agent";
import { resolveAniListIdsFromMal } from "@/main/ipc/anilist/anilist-mal";
import { Episode, ShowSearchResult } from "@/shared/types";
import {
  parseHlsVideoVariants,
  pickPreferredHlsVariant,
  sortHlsVariantsDescending,
} from "@/shared/utils/hls-master";

import {
  StreamMode,
  StreamProvider,
  StreamQualityOption,
  StreamUrlResult,
} from "../stream-provider";
import { fetchSenshiPlaylistText } from "./senshi-stream-upstream";

const API = process.env.SENSHI_BASE || "https://senshi.live";
const STREAM_REFERER = `${API.replace(/\/$/, "")}/`;
const SEARCH_LIMIT = 36;
const IS_DEV = process.env.NODE_ENV !== "production";

interface SenshiAnime {
  id: number;
  title?: string | null;
  title_english?: string | null;
  anime_picture?: string | null;
  type?: string | null;
  ani_episodes?: string | null;
  ani_status?: string | null;
  duration?: string | null;
  score?: number | null;
  ani_description?: string | null;
  ani_season?: string | null;
  ani_year?: number | null;
}

interface SenshiFilterResponse {
  data?: SenshiAnime[];
}

interface SenshiEpisodeRow {
  ep_id?: number;
}

interface SenshiEmbed {
  url?: string | null;
  status?: string | null;
}

interface SenshiLatestEmbed {
  mal_id?: number;
  ep_id?: number;
  status?: string | null;
  created_at?: string | null;
  anime?: SenshiAnime | null;
  episode?: {
    ep_id?: number;
    ep_title?: string | null;
  } | null;
}

function embedMatchesMode(status: string | null | undefined, mode: StreamMode): boolean {
  if (!status) return mode === "sub";
  if (mode === "dub") return containsIgnoreCase(status, "dub");
  // SoftSub / HardSub / Sub — anything non-dub counts as sub fodder.
  return !containsIgnoreCase(status, "dub");
}

function parseLeadingUint(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d+)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function mapStatus(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.toLowerCase();
  if (v.includes("finished")) return "FINISHED";
  if (v.includes("cancel")) return "CANCELLED";
  if (v.includes("not yet")) return "NOT_YET_RELEASED";
  if (v.includes("airing") || v.includes("current")) return "RELEASING";
  return raw;
}

function mapSeason(anime: SenshiAnime): ShowSearchResult["season"] | undefined {
  const quarter = anime.ani_season?.trim();
  const year = anime.ani_year;
  if (!quarter && !year) return undefined;
  return {
    quarter: quarter || undefined,
    year: year && year > 0 ? year : undefined,
  };
}

function absolutePosterUrl(ref: string | null | undefined): string | null {
  const value = ref?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const sep = value.startsWith("/") ? "" : "/";
  return `${API}${sep}${value}`;
}

function guardShowId(showId: string): void {
  if (!/^\d+$/.test(showId)) {
    throw new Error(`Invalid Senshi show id: ${showId}`);
  }
}

function guardEpisode(episode: string): void {
  if (!/^\d+(\.\d+)?$/.test(episode)) {
    throw new Error(`Invalid Senshi episode: ${episode}`);
  }
}

function epLabel(n: number): string | null {
  if (!Number.isFinite(n) || n === 0) return null;
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/** Rank an embed status for the requested track (0 = not this track). */
function matchScore(status: string | null | undefined, mode: StreamMode): number {
  if (!status) return 0;
  if (mode === "dub") {
    return containsIgnoreCase(status, "dub") ? 1 : 0;
  }
  if (containsIgnoreCase(status, "dub")) return 0;
  if (containsIgnoreCase(status, "soft")) return 3;
  if (containsIgnoreCase(status, "hard")) return 2;
  if (containsIgnoreCase(status, "sub")) return 1;
  return 0;
}

function pickEmbed(embeds: SenshiEmbed[], mode: StreamMode): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const embed of embeds) {
    const url = embed.url?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const score = matchScore(embed.status, mode);
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

function mapAnimeToSearchResult(
  anime: SenshiAnime,
  anilistByMal: Map<number, number>
): ShowSearchResult {
  const malId = anime.id;
  const providerId = String(malId);
  const anilistId = anilistByMal.get(malId);
  const totalEps = parseLeadingUint(anime.ani_episodes ?? undefined);

  return {
    id: anilistId != null ? String(anilistId) : providerId,
    providerId,
    title: {
      english: anime.title_english?.trim() || anime.title?.trim() || providerId,
      romanji: anime.title?.trim() || undefined,
    },
    thumbnail: absolutePosterUrl(anime.anime_picture),
    availableEpisodes: {
      sub: totalEps,
      // Track availability is only known at embed time.
      dub: undefined,
    },
    score:
      anime.score != null && Number.isFinite(anime.score)
        ? Math.min(Math.round(anime.score * 10), 100)
        : undefined,
    status: mapStatus(anime.ani_status),
    type: anime.type?.trim() || undefined,
    episodeDuration: parseLeadingUint(anime.duration ?? undefined),
    season: mapSeason(anime),
  };
}

export class SenshiStreamProvider implements StreamProvider {
  private log(event: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.info(`[senshi-provider] ${event}${suffix}`);
  }

  private async requestJson<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    const startedAt = Date.now();
    const url = `${API}${path.startsWith("/") ? path : `/${path}`}`;
    this.log("api:start", { method, path });

    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": getElectronUserAgent(),
        Referer: STREAM_REFERER,
        ...(body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: body != null ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      this.log("api:failed", { method, path, status: response.status, ms: Date.now() - startedAt });
      throw new Error(`Senshi request failed (${response.status}): ${path}`);
    }

    const json = (await response.json()) as T;
    this.log("api:done", { method, path, status: response.status, ms: Date.now() - startedAt });
    return json;
  }

  private async mapAnimeList(rows: SenshiAnime[]): Promise<ShowSearchResult[]> {
    const anilistByMal = await resolveAniListIdsFromMal(rows.map((row) => row.id));
    return rows.map((row) => mapAnimeToSearchResult(row, anilistByMal));
  }

  private async searchFilter(
    query: string,
    page: number,
    mode: StreamMode
  ): Promise<SenshiAnime[]> {
    const json = await this.requestJson<SenshiFilterResponse>("POST", "/anime/filter", {
      searchTerm: query,
      types: [],
      genres: [],
      status: [],
      seasons: [],
      year: "",
      studios: [],
      producers: [],
      languages: [],
      page,
      limit: SEARCH_LIMIT,
      sortBy: "score_desc",
      languagePreference: mode === "dub" ? "EN" : "JP",
    });
    return Array.isArray(json.data) ? json.data : [];
  }

  private async fetchLatestEmbeds(mode: StreamMode): Promise<SenshiLatestEmbed[]> {
    const json = await this.requestJson<SenshiLatestEmbed[]>("GET", "/episode-embeds/latest");
    if (!Array.isArray(json)) return [];
    return json.filter((row) => embedMatchesMode(row.status, mode));
  }

  async search(query: string): Promise<ShowSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      const episodes = await this.getRecentUploads(1, SEARCH_LIMIT, "sub");
      return episodes.map((episode) => ({
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
    }
    return this.mapAnimeList(await this.searchFilter(trimmed, 1, "sub"));
  }

  async getRecentUploads(page: number, limit = 24, mode: StreamMode = "sub"): Promise<Episode[]> {
    // `/episode-embeds/latest` is a single newest-first feed (no pagination).
    if (page > 1) return [];

    const embeds = await this.fetchLatestEmbeds(mode);
    const usable = embeds.filter(
      (row) =>
        typeof row.mal_id === "number" &&
        row.mal_id > 0 &&
        typeof row.ep_id === "number" &&
        Number.isFinite(row.ep_id) &&
        row.ep_id > 0
    );
    const sliced = usable.slice(0, Math.max(1, limit));
    const anilistByMal = await resolveAniListIdsFromMal(sliced.map((row) => row.mal_id!));

    return sliced.map((row) => {
      const malId = row.mal_id!;
      const providerId = String(malId);
      const anilistId = anilistByMal.get(malId);
      const anime = row.anime;
      const titleEnglish =
        anime?.title_english?.trim() || anime?.title?.trim() || providerId;
      const titleRomanji = anime?.title?.trim() || undefined;

      return {
        id: anilistId != null ? String(anilistId) : providerId,
        providerId,
        title: {
          english: titleEnglish,
          romanji: titleRomanji,
        },
        thumbnail: absolutePosterUrl(anime?.anime_picture),
        index: row.ep_id!,
        mode,
      };
    });
  }

  async getEpisodesList(providerId: string): Promise<string[]> {
    guardShowId(providerId);
    const rows = await this.requestJson<SenshiEpisodeRow[]>("GET", `/episodes/${providerId}`);
    if (!Array.isArray(rows)) return [];

    const labels = new Set<string>();
    for (const row of rows) {
      const label = typeof row.ep_id === "number" ? epLabel(row.ep_id) : null;
      if (label) labels.add(label);
    }

    return [...labels].sort((a, b) => Number(a) - Number(b));
  }

  async getShowDetails(providerId: string): Promise<{
    id: string;
    providerId: string;
    name: string;
    thumbnail: string | null;
    type: string;
    description: string | null;
  }> {
    guardShowId(providerId);
    const anime = await this.requestJson<SenshiAnime>("GET", `/anime/${providerId}`);
    const [mapped] = await this.mapAnimeList([anime]);
    return {
      id: mapped.id,
      providerId,
      name: mapped.title.english || mapped.title.romanji || providerId,
      thumbnail: mapped.thumbnail,
      type: mapped.type || "TV",
      description: anime.ani_description?.trim() || null,
    };
  }

  async getStreamUrl(
    _id: string | null,
    providerId: string | null,
    episode: string,
    mode: StreamMode
  ): Promise<StreamUrlResult> {
    if (!providerId) {
      throw new Error("Senshi requires a providerId (MAL id)");
    }
    guardShowId(providerId);
    guardEpisode(episode);

    const embeds = await this.requestJson<SenshiEmbed[]>(
      "GET",
      `/episode-embeds/${providerId}/${episode}`
    );
    if (!Array.isArray(embeds) || embeds.length === 0) {
      throw new Error(`No Senshi embeds for show=${providerId} ep=${episode}`);
    }

    const url = pickEmbed(embeds, mode);
    if (!url) {
      throw new Error(`No Senshi ${mode} stream for show=${providerId} ep=${episode}`);
    }

    let qualities: StreamQualityOption[] | undefined;
    let selectedQuality: string | undefined;
    try {
      const master = await fetchSenshiPlaylistText(url);
      const variants = parseHlsVideoVariants(master);
      if (variants.length > 0) {
        const preferred = pickPreferredHlsVariant(variants, 720);
        qualities = sortHlsVariantsDescending(variants).map((v) => ({
          id: v.uri,
          label: v.label,
          height: v.height ?? undefined,
          bandwidth: v.bandwidth ?? undefined,
        }));
        selectedQuality = preferred?.uri;
      }
    } catch (error: unknown) {
      this.log("stream:qualities-failed", {
        providerId,
        episode,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.log("stream:resolved", {
      providerId,
      episode,
      mode,
      urlPreview: url.slice(0, 96),
      qualities: qualities?.map((q) => q.label) ?? null,
      selectedQuality: selectedQuality ?? null,
    });

    return { url, referer: STREAM_REFERER, qualities, selectedQuality };
  }
}
