import { BrowserWindow } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";
import { Episode, ShowSearchResult } from "@/shared/types";

import { StreamMode, StreamProvider, StreamUrlResult } from "./stream-provider";

type JsonRecord = Record<string, unknown>;
interface AnimePaheRelease {
  episode: number;
  session: string;
}

interface AnimePaheSource {
  url: string;
  fansub: string | null;
  audio: string | null;
  resolution: number | null;
  originalIndex: number;
}

const BASE = process.env.ANIMEPAHE_BASE || "https://animepahe.pw";
const PARTITION = "persist:openanime-animepahe";
const IS_DEV = process.env.NODE_ENV !== "production";

function currentUserAgent(): string {
  return getElectronUserAgent();
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractM3u8(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'`<>]+\.m3u8[^\s"'`<>]*/i);
  return m?.[0] ? m[0].replace(/\\\//g, "/") : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchTextOptions {
  contextUrl?: string;
  referer?: string;
}

export class AnimePaheStreamProvider implements StreamProvider {
  private readonly sourceCursorByEpisode = new Map<string, number>();
  private readonly releasesCache = new Map<
    string,
    { expiresAt: number; value: AnimePaheRelease[] }
  >();
  private readonly releasesInFlight = new Map<string, Promise<AnimePaheRelease[]>>();
  private readonly releasesCacheTtlMs = 5 * 60_000;

  private log(event: string, meta?: Record<string, unknown>): void {
    if (!IS_DEV) return;
    const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
    console.info(`[animepahe-provider] ${event}${suffix}`);
  }

  async search(query: string): Promise<ShowSearchResult[]> {
    const startedAt = Date.now();
    this.log("search:start", { query });
    if (query.trim().length === 0) {
      const pages = [1, 2, 3];
      const pageItems = await Promise.all(
        pages.map((page) => this.getRecentUploads(page, 12, "sub"))
      );
      const episodes = pageItems.flat().slice(0, 36);
      const results: ShowSearchResult[] = episodes.map((episode) => ({
        id: episode.id,
        providerId: episode.providerId,
        title: {
          english: episode.title.english ?? episode.providerId,
          romanji: episode.title.romanji ?? undefined,
          native: episode.title.native ?? undefined,
        },
        thumbnail: episode.thumbnail ?? null,
        availableEpisodes: {
          sub: episode.index,
        },
      }));
      this.log("search:done", {
        query,
        pages: pages.length,
        results: results.length,
        ms: Date.now() - startedAt,
      });
      return results;
    }
    const payload = await this.fetchJson(
      `${BASE}/api?m=search&q=${encodeURIComponent(query)}`,
      `${BASE}/`
    );
    const rows = this.extractArray(payload, ["data", "results", "items"]);
    const results: ShowSearchResult[] = [];
    for (const row of rows) {
      const r = row as JsonRecord;
      const providerId = asString(r.session) ?? asString(r.slug) ?? asString(r.anime_session);
      if (!providerId) continue;
      const year = asNumber(r.year);
      results.push({
        id: asString(r.anilist_id) ?? asString(r.anilist) ?? asString(r.id) ?? providerId,
        providerId,
        title: {
          english: asString(r.title) ?? asString(r.anime_title) ?? asString(r.name) ?? providerId,
          romanji: asString(r.title_romaji) ?? undefined,
          native: asString(r.title_native) ?? undefined,
        },
        thumbnail:
          asString(r.poster) ??
          asString(r.poster_url) ??
          asString(r.image) ??
          asString(r.cover) ??
          null,
        availableEpisodes: {
          sub: asNumber(r.episodes ?? r.episodes_sub) ?? undefined,
          dub: asNumber(r.episodes_dub) ?? undefined,
        },
        score: asNumber(r.score) ?? undefined,
        status: asString(r.status) ?? undefined,
        type: asString(r.type) ?? undefined,
        season: year ? { year } : undefined,
      });
    }
    this.log("search:done", {
      query,
      rows: rows.length,
      results: results.length,
      ms: Date.now() - startedAt,
    });
    return results;
  }

  async getRecentUploads(page: number, limit = 12, mode: StreamMode = "sub"): Promise<Episode[]> {
    const startedAt = Date.now();
    this.log("recent:start", { page, limit, mode });
    const payload = await this.fetchJson(
      `${BASE}/api?m=airing&page=${Math.max(1, page)}`,
      `${BASE}/`
    );
    const rows = this.extractArray(payload, ["data", "results", "items", "airing"]);
    const episodes: Episode[] = [];
    for (const row of rows) {
      const r = row as JsonRecord;
      const providerId =
        asString(r.anime_session) ??
        asString(r.session) ??
        asString(r.slug) ??
        asString(r.anime_slug);
      const index = asNumber(r.episode ?? r.episode_number ?? r.number ?? r.ep);
      if (!providerId || !index) continue;
      episodes.push({
        id: asString(r.anilist_id) ?? asString(r.anilist) ?? providerId,
        providerId,
        title: {
          english: asString(r.title) ?? asString(r.anime_title) ?? providerId,
          romanji: asString(r.title_romaji) ?? undefined,
          native: asString(r.title_native) ?? undefined,
        },
        thumbnail:
          asString(r.snapshot) ??
          asString(r.poster) ??
          asString(r.poster_url) ??
          asString(r.image) ??
          null,
        index,
        mode,
      });
    }
    const sliced = episodes.slice(0, Math.max(1, limit));
    this.log("recent:done", {
      fetched: episodes.length,
      returned: sliced.length,
      ms: Date.now() - startedAt,
    });
    return sliced;
  }

  async getStreamUrl(
    _id: string | null,
    providerId: string | null,
    episode: string,
    mode: StreamMode
  ): Promise<StreamUrlResult> {
    const startedAt = Date.now();
    this.log("stream:start", { providerId, episode, mode });
    if (!providerId) throw new Error("Missing providerId for AnimePahe stream lookup");
    const releases = await this.getReleases(providerId);
    const target = releases.find((r) => r.episode === Number(episode));
    if (!target)
      throw new Error(`Episode ${episode} (${mode}) not found for AnimePahe show ${providerId}`);

    const playHtml = await this.fetchText(`${BASE}/play/${providerId}/${target.session}`, {
      contextUrl: `${BASE}/anime/${providerId}`,
      referer: `${BASE}/anime/${providerId}`,
    });
    const extractedSources = this.extractKwikSources(playHtml);
    const sources = this.orderSourcesForMode(extractedSources, mode);
    this.log("stream:sources", {
      mode,
      extracted: extractedSources.length,
      ordered: sources.length,
      first: sources[0]
        ? {
            url: sources[0].url,
            audio: sources[0].audio,
            resolution: sources[0].resolution,
            fansub: sources[0].fansub,
          }
        : null,
    });
    if (sources.length === 0) throw new Error("No AnimePahe sources found");
    const sourceKey = `${providerId}:${target.session}`;
    const startCursor = this.sourceCursorByEpisode.get(sourceKey) ?? 0;
    const startIndex = ((startCursor % sources.length) + sources.length) % sources.length;
    const errors: string[] = [];

    for (let offset = 0; offset < sources.length; offset += 1) {
      const index = (startIndex + offset) % sources.length;
      const source = sources[index];
      this.log("stream:try-source", {
        sourceIndex: index,
        source: source.url,
        audio: source.audio,
        resolution: source.resolution,
        fansub: source.fansub,
      });
      try {
        const m3u8 = await this.resolveKwik(source.url);
        const unsupportedCodec = await this.isChromiumUnsupportedAudioCodec(m3u8, source.url);
        if (unsupportedCodec) {
          errors.push(`source[${index}] unsupported audio codec mp4a.40.1`);
          this.log("stream:skip-source-unsupported-codec", {
            sourceIndex: index,
            source: source.url,
            audio: source.audio,
            resolution: source.resolution,
          });
          continue;
        }

        this.sourceCursorByEpisode.set(sourceKey, (index + 1) % sources.length);
        this.log("stream:done", {
          ms: Date.now() - startedAt,
          sourceIndex: index,
          m3u8Preview: m3u8.slice(0, 96),
        });
        return { url: m3u8, referer: source.url };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`source[${index}] ${message}`);
        this.log("stream:source-failed", { sourceIndex: index, source: source.url, error: message });
      }
    }

    throw new Error(
      `All AnimePahe sources failed for episode ${episode}. Attempts: ${errors.slice(0, 4).join(" | ")}`
    );
  }

  async getEpisodesList(providerId: string): Promise<string[]> {
    const releases = await this.getReleases(providerId);
    return releases.map((r) => String(r.episode)).sort((a, b) => Number(a) - Number(b));
  }

  async getShowDetails(providerId: string): Promise<{
    id: string;
    providerId: string;
    name: string;
    thumbnail: string | null;
    type: string;
    description: string | null;
  }> {
    const html = await this.fetchText(`${BASE}/anime/${providerId}`, {
      contextUrl: `${BASE}/`,
      referer: `${BASE}/`,
    });
    const title = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    const image = html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    const description = html.match(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i
    )?.[1];
    const anilist = html.match(/<meta[^>]+name=["']anilist["'][^>]+content=["']([^"']+)["']/i)?.[1];
    return {
      id: anilist ?? providerId,
      providerId,
      name: title?.trim() ?? providerId,
      thumbnail: image?.trim() ?? null,
      type: "TV",
      description: description?.trim() ?? null,
    };
  }

  private async getReleases(animeSession: string): Promise<AnimePaheRelease[]> {
    const cached = this.releasesCache.get(animeSession);
    if (cached && cached.expiresAt > Date.now()) {
      this.log("releases:cache-hit", { animeSession, count: cached.value.length });
      return cached.value;
    }

    const existing = this.releasesInFlight.get(animeSession);
    if (existing !== undefined) {
      this.log("releases:inflight-hit", { animeSession });
      return existing;
    }

    const task = this.fetchAllReleases(animeSession).finally(() => {
      this.releasesInFlight.delete(animeSession);
    });
    this.releasesInFlight.set(animeSession, task);
    return task;
  }

  private async fetchAllReleases(animeSession: string): Promise<AnimePaheRelease[]> {
    const startedAt = Date.now();
    this.log("releases:start", { animeSession });
    const first = await this.fetchJson(
      `${BASE}/api?m=release&id=${encodeURIComponent(animeSession)}&sort=episode_asc&page=1`,
      `${BASE}/anime/${animeSession}`
    );
    const firstRecord = (first as JsonRecord) ?? {};
    const lastPage = asNumber(firstRecord.last_page) ?? 1;
    const rows = [...this.extractArray(first, ["data", "results", "items", "episodes"])];
    for (let page = 2; page <= Math.max(1, lastPage); page += 1) {
      this.log("releases:page", { animeSession, page, lastPage });
      const payload = await this.fetchJson(
        `${BASE}/api?m=release&id=${encodeURIComponent(animeSession)}&sort=episode_asc&page=${page}`,
        `${BASE}/anime/${animeSession}`
      );
      rows.push(...this.extractArray(payload, ["data", "results", "items", "episodes"]));
    }
    const map = new Map<string, AnimePaheRelease>();
    for (const row of rows) {
      const r = row as JsonRecord;
      const ep = asNumber(r.episode ?? r.number ?? r.ep ?? r.ep_num);
      const session = asString(r.session) ?? asString(r.release_session);
      if (!ep || !session) continue;
      map.set(session, { episode: ep, session });
    }
    const releases = [...map.values()].sort((a, b) => a.episode - b.episode);
    this.releasesCache.set(animeSession, {
      value: releases,
      expiresAt: Date.now() + this.releasesCacheTtlMs,
    });
    this.log("releases:done", {
      animeSession,
      pages: Math.max(1, lastPage),
      count: releases.length,
      ms: Date.now() - startedAt,
    });
    return releases;
  }

  private extractKwikSources(html: string): AnimePaheSource[] {
    const byUrl = new Map<string, AnimePaheSource>();
    let usedFallback = false;
    const mergeSource = (next: Omit<AnimePaheSource, "originalIndex">): void => {
      const existing = byUrl.get(next.url);
      if (existing) {
        if (existing.fansub == null && next.fansub != null) existing.fansub = next.fansub;
        if (existing.audio == null && next.audio != null) existing.audio = next.audio;
        if (existing.resolution == null && next.resolution != null) existing.resolution = next.resolution;
        return;
      }
      byUrl.set(next.url, { ...next, originalIndex: byUrl.size });
    };
    const tags = html.match(/<[^>]+data-src=["'][^"']+["'][^>]*>/gi) ?? [];
    for (const tag of tags) {
      const url = this.readTagAttribute(tag, "data-src");
      if (!url || !/^https?:\/\/kwik\./i.test(url)) continue;
      mergeSource({
        url,
        fansub: this.readTagAttribute(tag, "data-fansub"),
        audio: this.readTagAttribute(tag, "data-audio"),
        resolution: asNumber(this.readTagAttribute(tag, "data-resolution")),
      });
    }
    if (byUrl.size === 0) {
      usedFallback = true;
      const fallback = html.match(/https?:\/\/kwik\.[a-z]+\/(?:e|f|d)\/[A-Za-z0-9_-]+/gi) ?? [];
      for (const url of fallback) {
        mergeSource({
          url,
          fansub: null,
          audio: null,
          resolution: null,
        });
      }
    }
    const sources = [...byUrl.values()];
    this.log("sources:extract", {
      count: sources.length,
      usedTagParse: tags.length > 0,
      usedFallback,
    });
    return sources;
  }

  private readTagAttribute(tag: string, attribute: string): string | null {
    const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const value = tag.match(new RegExp(`${escaped}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1];
    return value?.trim() || null;
  }

  private orderSourcesForMode(sources: AnimePaheSource[], mode: StreamMode): AnimePaheSource[] {
    const preferredAudio = mode === "sub" ? "jpn" : "eng";
    const normalize = (value: string | null): string | null => value?.trim().toLowerCase() ?? null;
    const byPreference = (source: AnimePaheSource): number =>
      normalize(source.audio) === preferredAudio ? 0 : 1;
    const byResolution = (source: AnimePaheSource): number => source.resolution ?? -1;

    const ordered = [...sources].sort((a, b) => {
      const preferenceDiff = byPreference(a) - byPreference(b);
      if (preferenceDiff !== 0) return preferenceDiff;

      const resolutionDiff = byResolution(b) - byResolution(a);
      if (resolutionDiff !== 0) return resolutionDiff;

      return a.originalIndex - b.originalIndex;
    });

    const preferredCount = ordered.filter((source) => byPreference(source) === 0).length;
    this.log("sources:ordered", {
      mode,
      preferredAudio,
      total: ordered.length,
      preferredCount,
      bestResolution: ordered[0]?.resolution ?? null,
    });
    return ordered;
  }

  private async resolveKwik(kwikUrl: string): Promise<string> {
    const startedAt = Date.now();
    this.log("kwik:start", { kwikUrl });
    try {
      const html = await this.fetchText(kwikUrl, {
        contextUrl: kwikUrl,
        referer: `${BASE}/`,
      });
      const direct = extractM3u8(html);
      if (direct) {
        this.log("kwik:direct-hit", {
          ms: Date.now() - startedAt,
          m3u8Preview: direct.slice(0, 96),
        });
        return direct;
      }
    } catch {
      this.log("kwik:direct-failed");
    }
    this.log("kwik:browser-fallback");
    const resolved = await this.withWindow(async (win) => {
      await win.loadURL(kwikUrl, {
        userAgent: currentUserAgent(),
        httpReferrer: `${BASE}/`,
      });
      await sleep(1200);
      const result = (await win.webContents.executeJavaScript(
        `(() => {
          const urls = [];
          const push = (v) => { if (typeof v === "string" && v.includes(".m3u8")) urls.push(v); };
          document.querySelectorAll("source").forEach((n) => { push(n.getAttribute("src")); push(n.src); });
          const video = document.querySelector("video");
          if (video) { push(video.getAttribute("src")); push(video.src); }
          for (const e of performance.getEntriesByType("resource") || []) {
            if (e && typeof e.name === "string") push(e.name);
          }
          return { urls, html: document.documentElement?.outerHTML || "" };
        })()`,
        true
      )) as { urls?: string[]; html?: string };
      for (const url of result.urls ?? []) {
        const m = extractM3u8(url);
        if (m) return m;
      }
      return extractM3u8(result.html ?? "");
    });
    if (!resolved) throw new Error("Unable to resolve AnimePahe source to m3u8");
    this.log("kwik:resolved", { ms: Date.now() - startedAt, m3u8Preview: resolved.slice(0, 96) });
    return resolved;
  }

  private async isChromiumUnsupportedAudioCodec(
    m3u8Url: string,
    referer: string
  ): Promise<boolean> {
    try {
      const response = await fetch(m3u8Url, {
        headers: {
          "User-Agent": currentUserAgent(),
          Referer: referer,
          Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*",
        },
      });
      if (!response.ok) return false;
      const text = await response.text();
      return /mp4a\.40\.1/i.test(text);
    } catch {
      return false;
    }
  }

  private async fetchJson(url: string, contextUrl: string): Promise<unknown> {
    try {
      const startedAt = Date.now();
      const response = await fetch(url, {
        headers: {
          "User-Agent": currentUserAgent(),
          Referer: contextUrl,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "application/json, text/plain,*/*",
        },
      });
      if (!response.ok) throw new Error(`bad status ${response.status}`);
      const parsed = JSON.parse(await response.text()) as unknown;
      this.log("json:direct", { url, status: response.status, ms: Date.now() - startedAt });
      return parsed;
    } catch {
      const startedAt = Date.now();
      this.log("json:fallback:start", { url, contextUrl });
      const fallback = await this.withWindow(async (win) => {
        await win.loadURL(contextUrl, { userAgent: currentUserAgent() });
        await this.waitChallenge(win);
        const text = (await win.webContents.executeJavaScript(
          `fetch(${JSON.stringify(url)}, {
            credentials: "include",
            headers: {
              "Accept": "application/json, text/plain,*/*",
              "Accept-Language": "en-US,en;q=0.9"
            }
          }).then((r) => r.text())`,
          true
        )) as string;
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return null;
        }
      });
      if (fallback == null) throw new Error("AnimePahe returned invalid JSON");
      this.log("json:fallback:done", { url, ms: Date.now() - startedAt });
      return fallback;
    }
  }

  private async fetchText(url: string, options?: FetchTextOptions): Promise<string> {
    const referer = options?.referer ?? `${BASE}/`;
    const contextUrl = options?.contextUrl ?? referer;
    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": currentUserAgent(),
          Referer: referer,
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) throw new Error(`AnimePahe request failed: ${response.status}`);
      const html = await response.text();
      this.log("html:direct", {
        url,
        status: response.status,
        size: html.length,
        ms: Date.now() - startedAt,
      });
      return html;
    } catch (error) {
      this.log("html:fallback:start", {
        url,
        contextUrl,
        reason: error instanceof Error ? error.message : "unknown",
      });
      const fallbackStartedAt = Date.now();
      const fallback = await this.withWindow(async (win) => {
        await win.loadURL(contextUrl, {
          userAgent: currentUserAgent(),
          httpReferrer: referer,
        });
        await this.waitChallenge(win);
        if (contextUrl !== url) {
          await win.loadURL(url, {
            userAgent: currentUserAgent(),
            httpReferrer: referer,
          });
          await this.waitChallenge(win);
        }
        const html = (await win.webContents.executeJavaScript(
          "document.documentElement ? document.documentElement.outerHTML : ''",
          true
        )) as string;
        return html.trim() ? html : null;
      });
      if (!fallback) {
        throw new Error("AnimePahe request failed");
      }
      this.log("html:fallback:done", {
        url,
        size: fallback.length,
        ms: Date.now() - fallbackStartedAt,
      });
      return fallback;
    }
  }

  private extractArray(payload: unknown, keys: string[]): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    const record = payload as JsonRecord;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
    return [];
  }

  private async withWindow<T>(work: (win: BrowserWindow) => Promise<T>): Promise<T> {
    const startedAt = Date.now();
    this.log("window:create");
    const win = new BrowserWindow({
      show: false,
      webPreferences: { partition: PARTITION, sandbox: true },
    });
    try {
      const result = await work(win);
      this.log("window:done", { ms: Date.now() - startedAt });
      return result;
    } finally {
      if (!win.isDestroyed()) win.destroy();
      this.log("window:destroy");
    }
  }

  private async waitChallenge(win: BrowserWindow, timeoutMs = 70000): Promise<boolean> {
    const startedAt = Date.now();
    this.log("challenge:start", { timeoutMs });
    while (Date.now() - startedAt < timeoutMs) {
      const state = (await win.webContents.executeJavaScript(
        `(() => {
          const t = String(document.title || "").toLowerCase();
          const b = String(document.body?.innerText || "").toLowerCase();
          return {
            blocked:
              t.includes("just a moment") ||
              b.includes("checking your browser") ||
              b.includes("ddos-guard") ||
              b.includes("captcha")
          };
        })()`,
        true
      )) as { blocked: boolean };
      if (!state.blocked) {
        this.log("challenge:passed", { ms: Date.now() - startedAt });
        return true;
      }
      await sleep(2000);
    }
    this.log("challenge:timeout", { ms: Date.now() - startedAt });
    return false;
  }
}
