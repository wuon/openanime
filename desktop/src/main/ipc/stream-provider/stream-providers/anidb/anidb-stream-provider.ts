/**
 * Stream provider for anidb.app (ani-cli v5 / anipy-cli AniDBAppProvider).
 * @see https://github.com/pystardust/ani-cli
 * @see https://github.com/sdaqo/anipy-cli (anidbapp_provider.py)
 */
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
import {
  fetchAnidbCdnText,
  fetchAnidbJson,
  fetchAnidbText,
} from "./anidb-browser-fetch";
import { ANIDB_BASE, ANIDB_REFERER, anidbNumericId } from "./constants";

const SEARCH_LIMIT = 36;
const IS_DEV = process.env.NODE_ENV !== "production";

/** Same pattern as anipy-cli AniDBAppProvider.HLS_RE */
const HLS_RE =
  /(?:file\s*:\s*|source\s*=\s*)["']([^"']+\.m3u8(?:\?[^"']*)?)["']/gi;

interface AnidbEpisodeRow {
  id?: number;
  number?: number;
}

interface AnidbEpisodesResponse {
  episodes?: AnidbEpisodeRow[];
}

interface AnidbLanguageRow {
  code?: string;
  embed_url?: string;
}

interface AnidbLanguagesResponse {
  languages?: AnidbLanguageRow[];
}

interface AnidbSearchHit {
  /** Numeric anime id (anipy-cli identifier). */
  providerId: string;
  title: string;
  thumbnail: string | null;
  /** Full slug path segment when known (e.g. naruto-3686). */
  slug: string | null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

function absoluteUrl(ref: string | null | undefined): string | null {
  const value = ref?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const sep = value.startsWith("/") ? "" : "/";
  return `${ANIDB_BASE}${sep}${value}`;
}

/**
 * Parse browse cards like anipy-cli: `a.anime-card` inside `.anime-grid`.
 * Cards use absolute hrefs + title attr + poster img.
 */
function parseSearchHits(html: string): AnidbSearchHit[] {
  const hits: AnidbSearchHit[] = [];
  const seen = new Set<string>();

  const cardRe =
    /<a\b[^>]*class="[^"]*anime-card[^"]*"[^>]*>[\s\S]*?<\/a>/gi;
  for (const cardMatch of html.matchAll(cardRe)) {
    const card = cardMatch[0] ?? "";
    const href =
      /href="([^"]*\/anime\/[^"]+)"/i.exec(card)?.[1] ??
      /href='([^']*\/anime\/[^']+)'/i.exec(card)?.[1];
    if (!href) continue;

    const slugMatch = /\/anime\/([a-z0-9-]+-(\d+))\/?$/i.exec(href);
    if (!slugMatch?.[1] || !slugMatch[2]) continue;
    const slug = slugMatch[1];
    const providerId = slugMatch[2];
    if (seen.has(providerId)) continue;

    const titleAttr =
      /\btitle="([^"]+)"/i.exec(card)?.[1] ??
      /\btitle='([^']+)'/i.exec(card)?.[1];
    const imgAlt =
      /<img\b[^>]*\balt="([^"]+)"/i.exec(card)?.[1] ??
      /<img\b[^>]*\balt='([^']+)'/i.exec(card)?.[1];
    const pText = /<p\b[^>]*>([^<]+)<\/p>/i.exec(card)?.[1];
    const title = decodeHtmlEntities(
      (titleAttr ?? imgAlt ?? pText ?? providerId).trim()
    );
    if (!title) continue;

    const imgSrc =
      /<img\b[^>]*\bsrc="([^"]+)"/i.exec(card)?.[1] ??
      /<img\b[^>]*\bsrc='([^']+)'/i.exec(card)?.[1];

    seen.add(providerId);
    hits.push({
      providerId,
      title,
      thumbnail: absoluteUrl(imgSrc),
      slug,
    });
  }

  // Fallback: looser title/href scrape (ani-cli style) if cards weren't found.
  if (hits.length === 0) {
    const looseRe =
      /\/anime\/([a-z0-9-]+-(\d+))"[^>]*title="([^"]+)"/gi;
    for (const match of html.matchAll(looseRe)) {
      const slug = match[1];
      const providerId = match[2];
      const title = decodeHtmlEntities(match[3] ?? "").trim();
      if (!slug || !providerId || !title || seen.has(providerId)) continue;
      seen.add(providerId);
      hits.push({ providerId, title, thumbnail: null, slug });
    }
  }

  return hits;
}

function extractMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const match = re.exec(html);
  if (match?.[1]) return decodeHtmlEntities(match[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i"
  );
  const match2 = re2.exec(html);
  return match2?.[1] ? decodeHtmlEntities(match2[1].trim()) : null;
}

function extractTitleFromHtml(html: string): string | null {
  const h1 = /<h1\b[^>]*class="[^"]*leading-tight[^"]*"[^>]*>([^<]+)<\/h1>/i.exec(
    html
  );
  if (h1?.[1]) return decodeHtmlEntities(h1[1].trim());

  const og = extractMeta(html, "og:title");
  if (og) {
    return og.replace(/\s*[|\u2013\u2014\-].*$/u, "").trim() || og;
  }
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (!titleMatch?.[1]) return null;
  return (
    decodeHtmlEntities(titleMatch[1]).replace(/\s*[|\u2013\u2014\-].*$/u, "").trim() ||
    null
  );
}

function extractDescriptionFromHtml(html: string): string | null {
  const synopsis = /<p\b[^>]*class="[^"]*text-sm text-faint leading-relaxed[^"]*"[^>]*>([^<]+)<\/p>/i.exec(
    html
  );
  if (synopsis?.[1]) return decodeHtmlEntities(synopsis[1].trim());
  return extractMeta(html, "og:description") ?? extractMeta(html, "description");
}

function extractThumbnailFromHtml(html: string): string | null {
  return absoluteUrl(extractMeta(html, "og:image"));
}

/** anidb.app pages link out to AniList — use that for enrichment, never the anidb numeric id. */
function extractAniListIdFromHtml(html: string): string | null {
  const match =
    /https?:\/\/(?:www\.)?anilist\.co\/anime\/(\d+)/i.exec(html) ??
    /href=["'][^"']*anilist\.co\/anime\/(\d+)/i.exec(html);
  return match?.[1] ?? null;
}

function animePagePath(providerId: string): string {
  // anipy-cli uses /anime/anime-{id}; site redirects to the canonical slug.
  const numeric = anidbNumericId(providerId);
  if (providerId.includes("-") && providerId !== numeric) {
    return `/anime/${encodeURIComponent(providerId)}`;
  }
  return `/anime/anime-${encodeURIComponent(numeric)}`;
}

function pickEmbedUrl(languages: AnidbLanguageRow[], mode: StreamMode): string | null {
  const code = mode === "dub" ? "eng" : "jpn";
  const preferred = languages.find((row) => row.code?.toLowerCase() === code);
  const embed = preferred?.embed_url?.trim();
  if (!embed) return null;
  return embed.replace(/\\\//g, "/");
}

function extractMasterFromEmbed(html: string): string | null {
  HLS_RE.lastIndex = 0;
  const match = HLS_RE.exec(html);
  return match?.[1]?.trim() || null;
}

function resolvePlaylistUri(masterUrl: string, uri: string): string {
  try {
    return new URL(uri, masterUrl).toString();
  } catch {
    return uri;
  }
}

function episodeNumbersEqual(a: number, b: number): boolean {
  return a === b || Math.abs(a - b) < 1e-9;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]!);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    run()
  );
  await Promise.all(runners);
  return results;
}

export class AnidbStreamProvider implements StreamProvider {
  private readonly episodesCache = new Map<
    string,
    { expiresAt: number; value: AnidbEpisodeRow[] }
  >();
  private readonly episodesInFlight = new Map<string, Promise<AnidbEpisodeRow[]>>();
  private readonly episodesCacheTtlMs = 5 * 60_000;

  private log(event: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.info(`[anidb-provider] ${event}${suffix}`);
  }

  private cacheKey(providerId: string): string {
    return anidbNumericId(providerId);
  }

  private async fetchEpisodes(providerId: string): Promise<AnidbEpisodeRow[]> {
    const key = this.cacheKey(providerId);
    const cached = this.episodesCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.log("episodes:cache-hit", { providerId: key, count: cached.value.length });
      return cached.value;
    }

    const existing = this.episodesInFlight.get(key);
    if (existing !== undefined) {
      this.log("episodes:inflight-hit", { providerId: key });
      return existing;
    }

    const task = this.loadEpisodes(key).finally(() => {
      this.episodesInFlight.delete(key);
    });
    this.episodesInFlight.set(key, task);
    return task;
  }

  private async loadEpisodes(numericId: string): Promise<AnidbEpisodeRow[]> {
    const startedAt = Date.now();
    this.log("episodes:start", { providerId: numericId, numericId });

    const json = await fetchAnidbJson<AnidbEpisodesResponse | AnidbEpisodeRow[]>(
      `${ANIDB_BASE}/api/frontend/anime/${encodeURIComponent(numericId)}/episodes`
    );

    const rows = Array.isArray(json)
      ? json
      : Array.isArray(json.episodes)
        ? json.episodes
        : [];

    const episodes = rows.filter(
      (row) => typeof row.id === "number" && typeof row.number === "number"
    );

    this.episodesCache.set(numericId, {
      expiresAt: Date.now() + this.episodesCacheTtlMs,
      value: episodes,
    });
    this.log("episodes:done", {
      providerId: numericId,
      count: episodes.length,
      ms: Date.now() - startedAt,
    });
    return episodes;
  }

  private async resolveEpisodeId(
    providerId: string,
    episodeNumber: number
  ): Promise<number> {
    const episodes = await this.fetchEpisodes(providerId);
    const match = episodes.find(
      (row) =>
        typeof row.number === "number" &&
        episodeNumbersEqual(row.number, episodeNumber)
    );
    if (match?.id == null) {
      throw new Error(`AniDB episode ${episodeNumber} not found for ${providerId}`);
    }
    return match.id;
  }

  private async latestEpisodeNumber(providerId: string): Promise<number> {
    const episodes = await this.fetchEpisodes(providerId);
    let latest = 0;
    for (const row of episodes) {
      if (typeof row.number === "number" && row.number > latest) {
        latest = row.number;
      }
    }
    return latest > 0 ? latest : 1;
  }

  private async searchBrowse(query: string, page = 1): Promise<AnidbSearchHit[]> {
    const url = new URL(`${ANIDB_BASE}/browse`);
    if (query) url.searchParams.set("q", query);
    if (page > 1) url.searchParams.set("page", String(page));
    const html = await fetchAnidbText(url.toString(), {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });
    return parseSearchHits(html);
  }

  async search(query: string): Promise<ShowSearchResult[]> {
    const startedAt = Date.now();
    const trimmed = query.trim();
    this.log("search:start", { query: trimmed });

    const hits = await this.searchBrowse(trimmed);
    // `id` must not be the anidb numeric id — that collides with AniList media ids.
    // Prefer slug until getShowDetails resolves the real AniList id from the page.
    const results = hits.slice(0, SEARCH_LIMIT).map((hit) => ({
      id: hit.slug ?? hit.providerId,
      providerId: hit.providerId,
      title: { english: hit.title },
      thumbnail: hit.thumbnail,
    }));

    this.log("search:done", {
      query: trimmed,
      results: results.length,
      ms: Date.now() - startedAt,
    });
    return results;
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

    const hits = await this.searchBrowse("", safePage);
    const sliced = hits.slice(0, safeLimit);

    // Welcome page opens /watch with episode.index — must be a real ep number
    // (anipy-cli never surfaces index 0 from browse alone).
    const episodes = await mapWithConcurrency(sliced, 4, async (hit) => {
      let index = 1;
      try {
        index = await this.latestEpisodeNumber(hit.providerId);
      } catch (error: unknown) {
        this.log("recent:latest-ep-failed", {
          providerId: hit.providerId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return {
        id: hit.slug ?? hit.providerId,
        providerId: hit.providerId,
        title: { english: hit.title },
        thumbnail: hit.thumbnail,
        index,
        mode,
      };
    });

    this.log("recent:done", {
      page: safePage,
      returned: episodes.length,
      ms: Date.now() - startedAt,
    });
    return episodes;
  }

  async getEpisodesList(providerId: string): Promise<string[]> {
    const startedAt = Date.now();
    this.log("episodes-list:start", { providerId });

    const episodes = await this.fetchEpisodes(providerId);
    const list = [
      ...new Set(
        episodes
          .map((row) => row.number)
          .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
      ),
    ]
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
    const numericId = anidbNumericId(providerId);
    this.log("details:start", { providerId, numericId });

    let name = providerId;
    let thumbnail: string | null = null;
    let description: string | null = null;
    let anilistId: string | null = null;

    try {
      const html = await fetchAnidbText(`${ANIDB_BASE}${animePagePath(providerId)}`, {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
      name = extractTitleFromHtml(html) || name;
      thumbnail = extractThumbnailFromHtml(html);
      description = extractDescriptionFromHtml(html);
      anilistId = extractAniListIdFromHtml(html);
    } catch (error: unknown) {
      this.log("details:page-failed", {
        providerId,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    await this.fetchEpisodes(numericId);

    const result = {
      // Prefer AniList media id for enrichment/history; never invent one from anidb ids.
      id: anilistId ?? numericId,
      providerId: numericId,
      name,
      thumbnail,
      type: "TV",
      description,
    };
    this.log("details:done", {
      providerId: numericId,
      anilistId,
      name: result.name,
      ms: Date.now() - startedAt,
    });
    return result;
  }

  async getStreamUrl(
    _id: string | null,
    providerId: string | null,
    episode: string,
    mode: StreamMode = "sub"
  ): Promise<StreamUrlResult> {
    const startedAt = Date.now();
    this.log("stream:start", { providerId, episode, mode });

    if (!providerId) {
      throw new Error("Missing providerId for AniDB stream lookup");
    }

    let episodeNumber = Number(episode);
    if (!Number.isFinite(episodeNumber) || episodeNumber < 0) {
      throw new Error(`Invalid episode number for AniDB: ${episode}`);
    }

    // Defensive: welcome cards previously used index 0.
    if (episodeNumber === 0) {
      episodeNumber = await this.latestEpisodeNumber(providerId);
      this.log("stream:episode-zero-fallback", {
        providerId,
        resolved: episodeNumber,
      });
    }

    const episodeId = await this.resolveEpisodeId(providerId, episodeNumber);
    const langJson = await fetchAnidbJson<AnidbLanguagesResponse | AnidbLanguageRow[]>(
      `${ANIDB_BASE}/api/frontend/episode/${encodeURIComponent(String(episodeId))}/languages`
    );
    const languages = Array.isArray(langJson)
      ? langJson
      : Array.isArray(langJson.languages)
        ? langJson.languages
        : [];

    // anipy-cli: require the requested lang (jpn/eng), do not silently fall back.
    const embedUrl = pickEmbedUrl(languages, mode);
    if (!embedUrl) {
      throw new Error(`No AniDB ${mode} stream for ${providerId} ep ${episodeNumber}`);
    }

    const embedHtml = await fetchAnidbText(embedUrl, {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: ANIDB_REFERER,
    });
    const masterUrl = extractMasterFromEmbed(embedHtml);
    if (!masterUrl) {
      throw new Error("AniDB embed page missing m3u8 master URL");
    }

    let qualities: StreamQualityOption[] | undefined;
    let selectedQuality: string | undefined;

    try {
      const master = await fetchAnidbCdnText(masterUrl);
      const variants = parseHlsVideoVariants(master);
      if (variants.length > 0) {
        const preferred = pickPreferredHlsVariant(variants, 720);
        qualities = sortHlsVariantsDescending(variants).map((v) => ({
          id: resolvePlaylistUri(masterUrl, v.uri),
          label: v.label,
          height: v.height ?? undefined,
          bandwidth: v.bandwidth ?? undefined,
        }));
        selectedQuality = preferred
          ? resolvePlaylistUri(masterUrl, preferred.uri)
          : qualities[0]?.id;
      }
    } catch (error: unknown) {
      this.log("stream:qualities-failed", {
        providerId,
        episode: episodeNumber,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.log("stream:done", {
      providerId,
      episode: episodeNumber,
      mode,
      episodeId,
      urlPreview: masterUrl.slice(0, 96),
      qualities: qualities?.map((q) => q.label) ?? null,
      ms: Date.now() - startedAt,
    });

    return {
      url: masterUrl,
      referer: ANIDB_REFERER,
      qualities,
      selectedQuality,
    };
  }
}
