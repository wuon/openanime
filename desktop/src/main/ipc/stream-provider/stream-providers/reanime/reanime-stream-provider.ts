import { getElectronUserAgent } from "@/main/electron-user-agent";
import { Episode, ShowSearchResult } from "@/shared/types";

import { StreamMode, StreamProvider, StreamSubtitleTrack, StreamUrlResult } from "../stream-provider";
import { decryptFlixcloudLink, FLIXCLOUD_REFERER } from "./flixcloud-decrypt";
import { registerFlixcloudPlaylistKey } from "./flixcloud-playlist-crypto";
import { prefetchReanimePlayback } from "./reanime-stream-upstream";

const BASE = process.env.REANIME_BASE || "https://reanime.to";
/** Reanime moved public REST routes under /api/v1 (old /api/* returns 404). */
const API_BASE = process.env.REANIME_API_BASE || `${BASE}/api/v1`;
const SEARCH_LIMIT = 36;
const SERVER_ORDER: Record<string, number> = { "HD-2": 0, "HD-1": 1 };
const IS_DEV = process.env.NODE_ENV !== "production";

function normalizeFlixcloudSubtitles(raw: unknown[]): StreamSubtitleTrack[] {
  const tracks: StreamSubtitleTrack[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url) continue;
    const language =
      typeof record.language === "string" && record.language.trim()
        ? record.language.trim()
        : "Unknown";
    const format =
      typeof record.format === "string" && record.format.trim()
        ? record.format.trim().toLowerCase()
        : guessSubtitleFormat(url);
    tracks.push({
      url,
      language,
      format,
      default: record.default === true,
    });
  }
  return tracks;
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
  return "unknown";
}

interface ReanimeTitle {
  english?: string;
  native?: string;
  romaji?: string;
  user_preferred?: string;
}

interface ReanimeCoverImage {
  large?: string;
  extra_large?: string;
  medium?: string;
}

interface ReanimeAnime {
  anime_id: string;
  title?: ReanimeTitle;
  cover_image?: ReanimeCoverImage;
  description?: string | null;
  format?: string;
  status?: string;
  season?: string;
  season_year?: number;
  episodes?: number;
  duration?: string;
  subbed?: number;
  dubbed?: number;
  average_score?: number;
  anilist?: number | string;
  anilist_id?: number | string;
}

interface ReanimeLatestEpisode {
  episode_number?: number;
  thumbnail?: string;
}

interface ReanimeLatestAiredItem extends ReanimeAnime {
  episode?: ReanimeLatestEpisode;
}

interface ReanimeLatestAiredResponse {
  data?: ReanimeLatestAiredItem[];
  next_cursor?: string | null;
}

interface ReanimeSearchResponse {
  results?: ReanimeAnime[];
  data?: ReanimeAnime[];
}

interface ReanimeEpisodeItem {
  episode_number?: number;
}

interface ReanimeStreamServer {
  $id?: string;
  serverName?: string;
  dataLink?: string;
  dataType?: string;
}

interface ReanimeWatchResponse {
  anime?: ReanimeAnime;
  episode_links?: ReanimeStreamServer[];
}

interface ReanimeFlixResponse {
  success?: boolean;
  servers?: ReanimeStreamServer[];
}

function sortStreamServers(servers: ReanimeStreamServer[]): ReanimeStreamServer[] {
  return [...servers].sort(
    (a, b) =>
      (SERVER_ORDER[a.serverName ?? ""] ?? 9) - (SERVER_ORDER[b.serverName ?? ""] ?? 9)
  );
}

function filterServersByMode(servers: ReanimeStreamServer[], mode: StreamMode): ReanimeStreamServer[] {
  const types = mode === "dub" ? new Set(["dub", "s-dub"]) : new Set(["sub", "s-sub"]);
  return sortStreamServers(
    servers.filter((server) => types.has(server.dataType ?? "") && Boolean(server.dataLink?.trim()))
  );
}

function extractAnilistId(anime: ReanimeAnime): string | null {
  if (anime.anilist != null) {
    return String(anime.anilist);
  }
  if (anime.anilist_id != null) {
    return String(anime.anilist_id);
  }
  const cover = anime.cover_image;
  const coverUrl = cover?.large ?? cover?.extra_large ?? cover?.medium;
  if (!coverUrl) return null;
  const match = coverUrl.match(/\/b(?:x)?(\d+)-/i);
  return match?.[1] ?? null;
}

function pickCoverThumbnail(cover?: ReanimeCoverImage): string | null {
  return cover?.large?.trim() || cover?.extra_large?.trim() || cover?.medium?.trim() || null;
}

function pickThumbnail(cover?: ReanimeCoverImage, episodeThumb?: string): string | null {
  const episode = episodeThumb?.trim();
  if (episode) return episode;
  return pickCoverThumbnail(cover);
}

function parseEpisodeDurationMinutes(duration: string | undefined): number | undefined {
  if (!duration) return undefined;
  const match = duration.match(/(\d+)\s*m/i);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  return Number.isFinite(minutes) ? minutes : undefined;
}

function mapTitle(title: ReanimeTitle | undefined, fallback: string) {
  return {
    english: title?.english?.trim() || title?.user_preferred?.trim() || fallback,
    romanji: title?.romaji?.trim() || undefined,
    native: title?.native?.trim() || undefined,
  };
}

function mapSeason(anime: ReanimeAnime) {
  const quarter = anime.season?.trim();
  const year = anime.season_year;
  if (!quarter && !year) return undefined;
  return {
    quarter: quarter || undefined,
    year: year && year > 0 ? year : undefined,
  };
}

function mapAnimeToShowSearchResult(anime: ReanimeAnime): ShowSearchResult {
  const providerId = anime.anime_id;
  const anilistId = extractAnilistId(anime);

  return {
    id: anilistId ?? providerId,
    providerId,
    title: mapTitle(anime.title, providerId),
    thumbnail: pickCoverThumbnail(anime.cover_image),
    availableEpisodes: {
      sub: anime.subbed ?? undefined,
      dub: anime.dubbed ?? undefined,
    },
    score: anime.average_score ?? undefined,
    status: anime.status ?? undefined,
    type: anime.format ?? undefined,
    episodeDuration: parseEpisodeDurationMinutes(anime.duration),
    season: mapSeason(anime),
  };
}

function mapLatestAiredToEpisode(item: ReanimeLatestAiredItem, mode: StreamMode): Episode {
  const index = item.episode?.episode_number ?? 0;

  return {
    id: extractAnilistId(item) ?? item.anime_id,
    providerId: item.anime_id,
    title: mapTitle(item.title, item.anime_id),
    thumbnail: pickThumbnail(item.cover_image, item.episode?.thumbnail),
    index,
    mode,
  };
}

export class ReanimeStreamProvider implements StreamProvider {
  private log(event: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.info(`[reanime-provider] ${event}${suffix}`);
  }

  private async reanimeGet<T>(
    path: string,
    params?: Record<string, string>,
    options?: { apiRoot?: "v1" | "legacy" }
  ): Promise<T> {
    const startedAt = Date.now();
    const apiRoot = options?.apiRoot ?? "v1";
    // Most catalog routes moved under /api/v1. Stream server lookup still uses legacy /api/flix.
    const normalized = path.replace(/^\/api(?:\/v1)?/, "") || "/";
    const root = apiRoot === "legacy" ? `${BASE}/api` : API_BASE;
    const url = new URL(`${root}${normalized.startsWith("/") ? normalized : `/${normalized}`}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    this.log("api:start", { path: url.pathname, params: params ?? null });

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json, */*",
        Referer: `${BASE}/`,
        Origin: BASE,
        "User-Agent": getElectronUserAgent(),
      },
    });
    if (!response.ok) {
      this.log("api:failed", { path: url.pathname, status: response.status, ms: Date.now() - startedAt });
      throw new Error(`Reanime request failed (${response.status}): ${url.pathname}`);
    }

    const json = (await response.json()) as T;
    this.log("api:done", { path: url.pathname, status: response.status, ms: Date.now() - startedAt });
    return json;
  }

  private async resolveAnilistId(
    providerId: string,
    anilistIdHint?: string | null
  ): Promise<string | null> {
    if (anilistIdHint && /^\d+$/.test(anilistIdHint)) {
      return anilistIdHint;
    }

    try {
      const watch = await this.reanimeGet<ReanimeWatchResponse>(
        `/watch/${encodeURIComponent(providerId)}`,
        { ep: "1" }
      );
      return watch.anime ? extractAnilistId(watch.anime) : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "unknown error";
      this.log("anilist:resolve-failed", { providerId, error: message });
      return null;
    }
  }

  private async fetchLatestAired(
    limit: number,
    mode: StreamMode,
    cursor?: string
  ): Promise<{ items: ReanimeLatestAiredItem[]; nextCursor: string | null }> {
    const params: Record<string, string> = {
      limit: String(Math.max(1, limit)),
      lang: mode === "dub" ? "dub" : "sub",
    };
    if (cursor) {
      params.cursor = cursor;
    }

    const json = await this.reanimeGet<ReanimeLatestAiredResponse>("/home/latest-aired", params);
    const nextCursor = typeof json.next_cursor === "string" ? json.next_cursor : null;
    return {
      items: Array.isArray(json.data) ? json.data : [],
      nextCursor,
    };
  }

  private async getEpisodeServers(
    providerId: string,
    episode: number,
    anilistIdHint?: string | null
  ): Promise<{ sub: ReanimeStreamServer[]; dub: ReanimeStreamServer[] }> {
    const startedAt = Date.now();
    this.log("servers:start", { providerId, episode, anilistIdHint: anilistIdHint ?? null });

    const anilistId = await this.resolveAnilistId(providerId, anilistIdHint);
    if (!anilistId) {
      this.log("servers:no-anilist-id", { providerId, episode });
      throw new Error(`Missing AniList id for Reanime stream lookup: ${providerId}`);
    }

    // Legacy /api/flix still serves embed links; /api/v1/flix returns 401.
    const flix = await this.reanimeGet<ReanimeFlixResponse>(
      `/flix/${encodeURIComponent(anilistId)}/${episode}`,
      undefined,
      { apiRoot: "legacy" }
    );

    const links =
      flix.success && Array.isArray(flix.servers) ? flix.servers : [];
    this.log("servers:flix", {
      anilistId,
      flixServers: links.length,
    });

    const sub = filterServersByMode(links, "sub");
    const dub = filterServersByMode(links, "dub");
    this.log("servers:done", {
      providerId,
      episode,
      sub: sub.length,
      dub: dub.length,
      ms: Date.now() - startedAt,
    });
    return { sub, dub };
  }

  async getStreamUrl(
    id: string | null,
    providerId: string | null,
    episode: string,
    mode: StreamMode = "sub"
  ): Promise<StreamUrlResult> {
    const startedAt = Date.now();
    this.log("stream:start", { id, providerId, episode, mode });

    if (!providerId) {
      throw new Error("Missing providerId for Reanime stream lookup");
    }

    const episodeNumber = Number(episode);
    if (!Number.isFinite(episodeNumber) || episodeNumber < 1) {
      throw new Error(`Invalid episode number for Reanime: ${episode}`);
    }

    const anilistIdHint = id && /^\d+$/.test(id) ? id : null;
    const servers = await this.getEpisodeServers(providerId, episodeNumber, anilistIdHint);
    const candidates = mode === "dub" ? servers.dub : servers.sub;
    if (candidates.length === 0) {
      throw new Error(`No playable Reanime ${mode} sources found for episode ${episode}`);
    }

    this.log("stream:candidates", {
      providerId,
      episode,
      mode,
      count: candidates.length,
      servers: candidates.map((server) => server.serverName ?? server.$id ?? "unknown"),
    });

    const errors: string[] = [];
    for (const server of candidates) {
      const dataLink = server.dataLink?.trim();
      if (!dataLink) continue;

      const attemptStartedAt = Date.now();
      this.log("stream:try-server", {
        serverName: server.serverName,
        dataType: server.dataType,
        dataLink: dataLink.slice(0, 96),
      });

      try {
        const decrypted = await decryptFlixcloudLink(dataLink, { referer: `${BASE}/` });
        registerFlixcloudPlaylistKey(decrypted.url, decrypted.playlistKey);
        // Warm playlists + segment CDN while the UI prepares transcode.
        void prefetchReanimePlayback(decrypted.url, FLIXCLOUD_REFERER);
        this.log("stream:done", {
          providerId,
          episode,
          mode,
          serverName: server.serverName,
          urlPreview: decrypted.url.slice(0, 96),
          ms: Date.now() - startedAt,
          attemptMs: Date.now() - attemptStartedAt,
        });
        return {
          url: decrypted.url,
          // fetch1.flixcloud.cc rejects embed-page referers (cross-subdomain); use site root.
          referer: FLIXCLOUD_REFERER,
          subtitles: normalizeFlixcloudSubtitles(decrypted.subtitles),
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "unknown error";
        this.log("stream:server-failed", {
          serverName: server.serverName,
          error: message,
          attemptMs: Date.now() - attemptStartedAt,
        });
        errors.push(`${server.serverName ?? "server"}: ${message}`);
      }
    }

    this.log("stream:failed", {
      providerId,
      episode,
      mode,
      errors,
      ms: Date.now() - startedAt,
    });
    throw new Error(
      `Reanime stream resolution failed for episode ${episode}: ${errors.join("; ")}`
    );
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

    let cursor: string | undefined;
    for (let p = 1; p < safePage; p++) {
      const prior = await this.fetchLatestAired(safeLimit, mode, cursor);
      if (!prior.nextCursor) {
        this.log("recent:done", {
          page: safePage,
          returned: 0,
          reason: "no-cursor",
          ms: Date.now() - startedAt,
        });
        return [];
      }
      cursor = prior.nextCursor;
    }

    const batch = await this.fetchLatestAired(safeLimit, mode, cursor);
    const episodes = batch.items.map((item) => mapLatestAiredToEpisode(item, mode));
    this.log("recent:done", {
      page: safePage,
      fetched: batch.items.length,
      returned: episodes.length,
      hasMore: Boolean(batch.nextCursor),
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

    const json = await this.reanimeGet<ReanimeSearchResponse | ReanimeAnime[]>("/search", {
      q: trimmed,
      limit: String(SEARCH_LIMIT),
      offset: "0",
    });

    const rows = Array.isArray(json)
      ? json
      : Array.isArray(json.results)
        ? json.results
        : Array.isArray(json.data)
          ? json.data
          : [];
    const results = rows
      .filter((item) => typeof item.anime_id === "string" && item.anime_id.length > 0)
      .map((item) => mapAnimeToShowSearchResult(item));
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
    this.log("episodes:start", { providerId });

    const data = await this.reanimeGet<{ data?: ReanimeEpisodeItem[] }>(
      `/anime/${encodeURIComponent(providerId)}/episodes`,
      { limit: "2000" }
    );

    const items = Array.isArray(data.data) ? data.data : [];
    const numbers = items
      .map((item) => item.episode_number)
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n));

    const episodes = [...new Set(numbers)]
      .sort((a, b) => a - b)
      .map(String);
    this.log("episodes:done", {
      providerId,
      count: episodes.length,
      ms: Date.now() - startedAt,
    });
    return episodes;
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

    const json = await this.reanimeGet<ReanimeWatchResponse>(
      `/watch/${encodeURIComponent(providerId)}`,
      { ep: "1" }
    );
    const anime = json.anime;
    if (!anime?.anime_id) {
      throw new Error(`Reanime show not found: ${providerId}`);
    }

    const slug = anime.anime_id;
    const title = anime.title ?? {};
    const name =
      title.user_preferred?.trim() ||
      title.english?.trim() ||
      title.romaji?.trim() ||
      title.native?.trim() ||
      slug;

    const details = {
      id: extractAnilistId(anime) ?? slug,
      providerId: slug,
      name,
      thumbnail: pickCoverThumbnail(anime.cover_image),
      type: anime.format?.trim() || "TV",
      description: anime.description?.trim() || null,
    };
    this.log("details:done", {
      providerId,
      name: details.name,
      anilistId: details.id,
      ms: Date.now() - startedAt,
    });
    return details;
  }
}
