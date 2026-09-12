/**
 * Stream provider for hianime.at (ani-cli v5.1 HiAnime scrape).
 * @see https://github.com/pystardust/ani-cli (hianime_search / hianime_episodes / hianime_m3u8)
 */
import { resolveAniListIdFromMal } from "@/main/ipc/anilist/anilist-mal";
import type { SearchFilterDefinition } from "@/shared/search-filters";
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
import { fetchHianimeText } from "./hianime-browser-fetch";
import {
  decodeEmbedHash,
  deobfuscateEmbedBlob,
  embedOriginReferer,
  extractEmbedBlob,
  extractMalIdFromEmbed,
  parseEmbedConfig,
} from "./hianime-embed";
import { HIANIME_BASE, HIANIME_REFERER, hianimeAnimeId, hianimeSlug } from "./constants";

const SEARCH_LIMIT = 36;
const IS_DEV = process.env.NODE_ENV !== "production";

interface HianimeTicks {
  sub?: number;
  dub?: number;
}

interface HianimeSearchHit {
  providerId: string;
  title: string;
  thumbnail: string | null;
  ticks: HianimeTicks;
}

interface HianimeEpisodeRow {
  id: string;
  number: number;
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
  if (value.startsWith("//")) return `https:${value}`;
  const sep = value.startsWith("/") ? "" : "/";
  return `${HIANIME_BASE}${sep}${value}`;
}

function cutMainSidebar(html: string): string {
  const match = /id=["']main-sidebar["']/i.exec(html);
  return match?.index != null ? html.slice(0, match.index) : html;
}

function slugFromHref(href: string): string | null {
  const cleaned = href.trim().split(/[?#]/)[0] ?? "";
  const segment = cleaned.split("/").filter(Boolean).pop();
  if (!segment) return null;
  try {
    return hianimeSlug(decodeURIComponent(segment));
  } catch {
    return null;
  }
}

function parsePosterSrc(html: string): string | null {
  const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
  for (let i = imgs.length - 1; i >= 0; i--) {
    const img = imgs[i] ?? "";
    const src =
      /\bdata-src="([^"]+)"/i.exec(img)?.[1] ?? /\bsrc="([^"]+)"/i.exec(img)?.[1];
    if (!src || /logo|placeholder|\/theme\/images\//i.test(src)) continue;
    return src;
  }
  return null;
}

function parseTickNumber(innerHtml: string): number | undefined {
  const text = innerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const raw = /(?:Ep(?:isode)?\s*)?(\d+(?:\.\d+)?)/i.exec(text)?.[1];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Latest uploaded sub/dub counts from `.tick-item.tick-sub` / `.tick-item.tick-dub`.
 * Ignore `.tick-eps` — that is the series total, not the latest available episode.
 * Inner `<i class="... mr-1">` must be stripped so the icon's `1` is not parsed as the ep.
 */
function parseEpisodeTicks(html: string): HianimeTicks {
  const ticks: HianimeTicks = {};
  const re =
    /<div\b([^>]*\bclass=["'][^"']*\btick-item\b[^"']*["'][^>]*)>([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(re)) {
    const attrs = match[1] ?? "";
    const n = parseTickNumber(match[2] ?? "");
    if (n == null) continue;
    if (/\btick-sub\b/i.test(attrs)) ticks.sub ??= n;
    else if (/\btick-dub\b/i.test(attrs)) ticks.dub ??= n;
  }
  return ticks;
}

function mergeTicks(primary: HianimeTicks, fallback: HianimeTicks): HianimeTicks {
  return {
    sub: primary.sub ?? fallback.sub,
    dub: primary.dub ?? fallback.dub,
  };
}

function pickTickForMode(ticks: HianimeTicks, mode: StreamMode): number | undefined {
  return mode === "dub" ? ticks.dub ?? ticks.sub : ticks.sub ?? ticks.dub;
}

/**
 * ani-cli: drop #main-sidebar (Top 10 duplicates film-detail markup), then parse
 * `h3.film-name > a[href][title]`. Poster/episode ticks live in the preceding film-poster.
 */
function parseFilmCards(html: string): HianimeSearchHit[] {
  const main = cutMainSidebar(html);
  const parts = main.split(/<div\b[^>]*class="[^"]*film-detail[^"]*"/i);
  const hits: HianimeSearchHit[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < parts.length; i++) {
    const detail = parts[i] ?? "";
    const poster = parts[i - 1] ?? "";
    const nameMatch =
      /<h3\b[^>]*class="[^"]*film-name[^"]*"[^>]*>[\s\S]*?<a\b([^>]+)>/i.exec(detail);
    const attrs = nameMatch?.[1] ?? "";
    const href =
      /\bhref="([^"]+)"/i.exec(attrs)?.[1] ?? /\bhref='([^']+)'/i.exec(attrs)?.[1];
    const titleAttr =
      /\btitle="([^"]+)"/i.exec(attrs)?.[1] ?? /\btitle='([^']+)'/i.exec(attrs)?.[1];
    if (!href || !titleAttr) continue;

    const providerId = slugFromHref(href);
    const title = decodeHtmlEntities(titleAttr).trim();
    if (!providerId || !title || seen.has(providerId)) continue;

    seen.add(providerId);
    hits.push({
      providerId,
      title,
      thumbnail: absoluteUrl(parsePosterSrc(poster)),
      ticks: mergeTicks(parseEpisodeTicks(poster), parseEpisodeTicks(detail)),
    });
  }

  return hits;
}

function unwrapHtmlPayload(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    const json = JSON.parse(trimmed) as { html?: unknown };
    if (typeof json.html === "string") return json.html;
  } catch {
    // Response may already be HTML with a stray brace.
  }
  return text.replace(/\\"/g, '"');
}

function parseEpisodeRows(html: string, slug: string): HianimeEpisodeRow[] {
  const body = unwrapHtmlPayload(html).replace(/\\"/g, '"');
  const items = body.split(/ep-item/i);
  const rows: HianimeEpisodeRow[] = [];
  const seen = new Set<string>();
  const watchNeedle = `/watch/${slug}`;

  for (const item of items) {
    if (!item.includes(watchNeedle) || !/[?&]ep=/i.test(item)) continue;
    const numberRaw =
      /data-number="([^"]*)"/i.exec(item)?.[1] ?? /data-number='([^']*)'/i.exec(item)?.[1];
    const id =
      /data-id="([0-9]+)"/i.exec(item)?.[1] ?? /data-id='([0-9]+)'/i.exec(item)?.[1];
    if (!numberRaw || !id) continue;
    const number = Number(numberRaw);
    if (!Number.isFinite(number) || seen.has(id)) continue;
    seen.add(id);
    rows.push({ id, number });
  }

  return rows.sort((a, b) => a.number - b.number);
}

function parseZokoHash(serversHtml: string, mode: StreamMode): string | null {
  const body = unwrapHtmlPayload(serversHtml).replace(/\\"/g, '"');
  const items = body.split(/server-item/i);
  for (const item of items) {
    const type = (
      /data-type="([^"]*)"/i.exec(item)?.[1] ?? /data-type='([^']*)'/i.exec(item)?.[1] ?? ""
    ).toLowerCase();
    const name =
      /data-server-name="([^"]*)"/i.exec(item)?.[1] ??
      /data-server-name='([^']*)'/i.exec(item)?.[1];
    const hash =
      /data-hash="([^"]*)"/i.exec(item)?.[1] ?? /data-hash='([^']*)'/i.exec(item)?.[1];
    if (type === mode && name === "ZokoAnime" && hash) return hash;
  }
  return null;
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
  const heading =
    /<h2\b[^>]*class="[^"]*film-name[^"]*"[^>]*>([^<]+)<\/h2>/i.exec(html)?.[1] ??
    /<h1\b[^>]*>([^<]+)<\/h1>/i.exec(html)?.[1];
  if (heading) return decodeHtmlEntities(heading).trim();

  const og = extractMeta(html, "og:title");
  if (og) {
    return og.replace(/\s*[|\u2013\u2014-].*$/u, "").trim() || og;
  }
  const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  if (!titleMatch?.[1]) return null;
  return (
    decodeHtmlEntities(titleMatch[1]).replace(/\s*[|\u2013\u2014-].*$/u, "").trim() || null
  );
}

function extractDescriptionFromHtml(html: string): string | null {
  const syn =
    /class="[^"]*film-description[^"]*"[\s\S]*?class="[^"]*text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
      html
    )?.[1];
  if (syn) {
    const text = decodeHtmlEntities(syn.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
    if (text.length > 40) return text;
  }
  const og = extractMeta(html, "og:description") ?? extractMeta(html, "description");
  if (og && !/watch and download/i.test(og)) return og;
  return og;
}

function extractMalIdFromHtml(html: string): number | null {
  const match = /https?:\/\/(?:www\.)?myanimelist\.net\/anime\/(\d+)/i.exec(html);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function extractAniListIdFromHtml(html: string): string | null {
  const match = /https?:\/\/(?:www\.)?anilist\.co\/anime\/(\d+)/i.exec(html);
  return match?.[1] ?? null;
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
  const results: R[] = [];
  let next = 0;

  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      const item = items[index];
      if (item === undefined) continue;
      results[index] = await worker(item);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run());
  await Promise.all(runners);
  return results;
}

export class HianimeStreamProvider implements StreamProvider {
  private readonly episodesCache = new Map<
    string,
    { expiresAt: number; value: HianimeEpisodeRow[] }
  >();
  private readonly episodesInFlight = new Map<string, Promise<HianimeEpisodeRow[]>>();
  private readonly episodesCacheTtlMs = 5 * 60_000;

  private log(event: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.info(`[hianime-provider] ${event}${suffix}`);
  }

  private async fetchEpisodes(providerId: string): Promise<HianimeEpisodeRow[]> {
    const slug = hianimeSlug(providerId);
    const cached = this.episodesCache.get(slug);
    if (cached && cached.expiresAt > Date.now()) {
      this.log("episodes:cache-hit", { providerId: slug, count: cached.value.length });
      return cached.value;
    }

    const existing = this.episodesInFlight.get(slug);
    if (existing !== undefined) {
      this.log("episodes:inflight-hit", { providerId: slug });
      return existing;
    }

    const task = this.loadEpisodes(slug).finally(() => {
      this.episodesInFlight.delete(slug);
    });
    this.episodesInFlight.set(slug, task);
    return task;
  }

  private async loadEpisodes(slug: string): Promise<HianimeEpisodeRow[]> {
    const startedAt = Date.now();
    const animeId = hianimeAnimeId(slug);
    this.log("episodes:start", { providerId: slug, animeId });
    const text = await fetchHianimeText(
      `${HIANIME_BASE}/api/theme/episode/list/${encodeURIComponent(animeId)}`,
      { Accept: "application/json, text/html, */*" }
    );
    const episodes = parseEpisodeRows(text, slug);
    this.episodesCache.set(slug, {
      expiresAt: Date.now() + this.episodesCacheTtlMs,
      value: episodes,
    });
    this.log("episodes:done", {
      providerId: slug,
      count: episodes.length,
      ms: Date.now() - startedAt,
    });
    return episodes;
  }

  private async resolveEpisodeId(providerId: string, episodeNumber: number): Promise<string> {
    const episodes = await this.fetchEpisodes(providerId);
    const match = episodes.find((row) => episodeNumbersEqual(row.number, episodeNumber));
    if (!match) {
      throw new Error(`HiAnime episode ${episodeNumber} not found for ${providerId}`);
    }
    return match.id;
  }

  private async latestEpisodeNumber(providerId: string): Promise<number> {
    const episodes = await this.fetchEpisodes(providerId);
    let latest = 0;
    for (const row of episodes) {
      if (row.number > latest) latest = row.number;
    }
    return latest > 0 ? latest : 1;
  }

  private async fetchRecentlyUpdatedHits(
    page: number,
    limit: number
  ): Promise<HianimeSearchHit[]> {
    const url = new URL(`${HIANIME_BASE}/recently-updated`);
    if (page > 1) url.searchParams.set("page", String(page));
    const html = await fetchHianimeText(url.toString(), {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    });
    return parseFilmCards(html).slice(0, limit);
  }

  getSearchFilters(): SearchFilterDefinition[] {
    return [];
  }

  async search(query: string): Promise<ShowSearchResult[]> {
    const startedAt = Date.now();
    const trimmed = query.trim();
    this.log("search:start", { query: trimmed });

    if (!trimmed) {
      const hits = await this.fetchRecentlyUpdatedHits(1, SEARCH_LIMIT);
      const results = hits.map((hit) => ({
        id: hit.providerId,
        providerId: hit.providerId,
        title: { english: hit.title },
        thumbnail: hit.thumbnail,
        availableEpisodes: {
          sub: hit.ticks.sub,
          dub: hit.ticks.dub,
        },
      }));
      this.log("search:done", {
        query: trimmed,
        results: results.length,
        ms: Date.now() - startedAt,
      });
      return results;
    }

    const html = await fetchHianimeText(
      `${HIANIME_BASE}/search?keyword=${encodeURIComponent(trimmed)}`,
      { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" }
    );
    const hits = parseFilmCards(html);
    const results = hits.slice(0, SEARCH_LIMIT).map((hit) => ({
      id: hit.providerId,
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

    const hits = await this.fetchRecentlyUpdatedHits(safePage, safeLimit);

    const episodes = await mapWithConcurrency(hits, 4, async (hit) => {
      let index = pickTickForMode(hit.ticks, mode) ?? 0;
      if (!(index > 0)) {
        try {
          index = await this.latestEpisodeNumber(hit.providerId);
        } catch (error: unknown) {
          this.log("recent:latest-ep-failed", {
            providerId: hit.providerId,
            message: error instanceof Error ? error.message : String(error),
          });
          index = 1;
        }
      }
      return {
        id: hit.providerId,
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
          .filter((n) => Number.isFinite(n))
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
    const slug = hianimeSlug(providerId);
    this.log("details:start", { providerId, slug });

    let name = slug;
    let thumbnail: string | null = null;
    let description: string | null = null;
    let anilistId: string | null = null;
    let malId: number | null = null;

    try {
      const html = await fetchHianimeText(`${HIANIME_BASE}/${encodeURIComponent(slug)}`, {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
      name = extractTitleFromHtml(html) || name;
      thumbnail = absoluteUrl(extractMeta(html, "og:image"));
      description = extractDescriptionFromHtml(html);
      anilistId = extractAniListIdFromHtml(html);
      malId = extractMalIdFromHtml(html);
    } catch (error: unknown) {
      this.log("details:page-failed", {
        providerId: slug,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    if (!anilistId && malId != null) {
      const mapped = await resolveAniListIdFromMal(malId);
      if (mapped != null) anilistId = String(mapped);
    }

    const result = {
      id: anilistId ?? slug,
      providerId: slug,
      name,
      thumbnail,
      type: "TV",
      description,
    };
    this.log("details:done", {
      providerId: slug,
      anilistId,
      malId,
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
      throw new Error("Missing providerId for HiAnime stream lookup");
    }

    const slug = hianimeSlug(providerId);
    let episodeNumber = Number(episode);
    if (!Number.isFinite(episodeNumber) || episodeNumber < 0) {
      throw new Error(`Invalid episode number for HiAnime: ${episode}`);
    }
    if (episodeNumber === 0) {
      episodeNumber = await this.latestEpisodeNumber(slug);
      this.log("stream:episode-zero-fallback", {
        providerId: slug,
        resolved: episodeNumber,
      });
    }

    const episodeId = await this.resolveEpisodeId(slug, episodeNumber);
    const serversHtml = await fetchHianimeText(
      `${HIANIME_BASE}/api/theme/episode/servers?episodeId=${encodeURIComponent(episodeId)}`,
      { Accept: "application/json, text/html, */*" }
    );
    const hash = parseZokoHash(serversHtml, mode);
    if (!hash) {
      throw new Error(`No HiAnime ${mode} stream for ${slug} ep ${episodeNumber}`);
    }

    const embedUrl = decodeEmbedHash(hash);
    const refr = embedOriginReferer(embedUrl);
    const malId = extractMalIdFromEmbed(embedUrl);
    const embedHtml = await fetchHianimeText(embedUrl, {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: HIANIME_REFERER,
    });
    const blob = extractEmbedBlob(embedHtml);
    if (!blob) {
      throw new Error("HiAnime embed page missing window.__P blob");
    }
    const config = parseEmbedConfig(deobfuscateEmbedBlob(blob));

    let qualities: StreamQualityOption[] | undefined;
    let selectedQuality: string | undefined;
    try {
      const master = await fetchHianimeText(config.masterUrl, {
        Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*",
        Referer: refr,
      });
      const variants = parseHlsVideoVariants(master);
      if (variants.length > 0) {
        const preferred = pickPreferredHlsVariant(variants, 720);
        qualities = sortHlsVariantsDescending(variants).map((v) => ({
          id: resolvePlaylistUri(config.masterUrl, v.uri),
          label: v.label,
          height: v.height ?? undefined,
          bandwidth: v.bandwidth ?? undefined,
        }));
        selectedQuality = preferred
          ? resolvePlaylistUri(config.masterUrl, preferred.uri)
          : qualities[0]?.id;
      }
    } catch (error: unknown) {
      this.log("stream:qualities-failed", {
        providerId: slug,
        episode: episodeNumber,
        message: error instanceof Error ? error.message : String(error),
      });
    }

    this.log("stream:done", {
      providerId: slug,
      episode: episodeNumber,
      mode,
      episodeId,
      malId,
      urlPreview: config.masterUrl.slice(0, 96),
      subtitles: config.subtitles.map((t) => t.language),
      qualities: qualities?.map((q) => q.label) ?? null,
      ms: Date.now() - startedAt,
    });

    return {
      url: config.masterUrl,
      referer: refr,
      subtitles: config.subtitles.length > 0 ? config.subtitles : undefined,
      qualities,
      selectedQuality,
    };
  }
}
