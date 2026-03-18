import { ChevronDown, ChevronRight, ImageOff, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { Input } from "@/renderer/components/ui/input";
import { useDebouncedValue } from "@/renderer/hooks/use-debounced-value";
import {
  type AnimeSearchResult as AnimeSearchResultType,
  getAniCli,
} from "@/renderer/lib/ani-cli-bridge";

type EpisodesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: string[] }
  | { status: "error"; message: string };

const SEARCH_DEBOUNCE_MS = 500;
const RECENT_PAGE_SIZE = 12;

export function WelcomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<AnimeSearchResultType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [episodesByShowId, setEpisodesByShowId] = useState<Record<string, EpisodesState>>({});
  const [playingEpisode, setPlayingEpisode] = useState<string | null>(null);

  const [recentAnime, setRecentAnime] = useState<AnimeSearchResultType[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentThumbnails, setRecentThumbnails] = useState<Record<string, string | null>>({});

  const openAniCliRepo = useCallback(() => {
    const w = window as Window & { urlOpener?: { openGithub?: (url: string) => Promise<void> } };
    if (typeof w.urlOpener?.openGithub === "function") {
      void w.urlOpener.openGithub("https://github.com/pystardust/ani-cli");
    } else {
      // Fallback for environments where the preload context isn't available
      window.open("https://github.com/pystardust/ani-cli", "_blank", "noopener,noreferrer");
    }
  }, []);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedId(null);
    setEpisodesByShowId({});
    const aniCli = getAniCli();
    void aniCli
      .search(q)
      .then((list) => {
        if (!cancelled) setResults(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    void getAniCli()
      .getRecent(1, RECENT_PAGE_SIZE)
      .then(
        (res: { items: AnimeSearchResultType[]; hasMore: boolean }) => {
          if (!cancelled) setRecentAnime(res.items);
        },
        () => {
          if (!cancelled) setRecentAnime([]);
        }
      )
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch thumbnails for recently uploaded shows (used in the carousel)
  /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
  useEffect(() => {
    let cancelled = false;
    if (recentAnime.length === 0) return;
    const aniCli = getAniCli();
    for (const anime of recentAnime) {
      if (recentThumbnails[anime.id] !== undefined) continue;
      void (async () => {
        try {
          const details = await aniCli.getShowDetails(anime.id);
          if (cancelled) return;
          setRecentThumbnails((prev) =>
            prev[anime.id] !== undefined ? prev : { ...prev, [anime.id]: details.thumbnail ?? null }
          );
        } catch {
          if (cancelled) return;
          setRecentThumbnails((prev) =>
            prev[anime.id] !== undefined ? prev : { ...prev, [anime.id]: null }
          );
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [recentAnime]);
  /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

  const loadEpisodes = useCallback(async (anime: AnimeSearchResultType) => {
    setEpisodesByShowId((prev) => ({ ...prev, [anime.id]: { status: "loading" } }));
    try {
      const episodes = await getAniCli().getEpisodes(anime.id, anime.mode);
      setEpisodesByShowId((prev) => ({
        ...prev,
        [anime.id]: { status: "loaded", episodes },
      }));
    } catch (err) {
      setEpisodesByShowId((prev) => ({
        ...prev,
        [anime.id]: {
          status: "error",
          message: err instanceof Error ? err.message : "Failed to load episodes",
        },
      }));
    }
  }, []);

  const toggleExpand = useCallback(
    (anime: AnimeSearchResultType) => {
      const isExpanded = expandedId === anime.id;
      if (isExpanded) {
        setExpandedId(null);
      } else {
        setExpandedId(anime.id);
        const state = episodesByShowId[anime.id];
        if (state?.status !== "loaded") void loadEpisodes(anime);
      }
    },
    [expandedId, episodesByShowId, loadEpisodes]
  );

  const playEpisode = useCallback(
    (anime: AnimeSearchResultType, episode: string, episodes: string[]) => {
      setPlayingEpisode(`${anime.id}-${episode}`);
      const indexInResults = results.findIndex((r) => r.id === anime.id);
      const searchIndex = indexInResults >= 0 ? indexInResults + 1 : 1;
      navigate("/watch", {
        state: {
          anime: { id: anime.id, name: anime.name, mode: anime.mode },
          episodes,
          currentEpisode: episode,
          searchIndex,
        },
      });
      setPlayingEpisode(null);
    },
    [navigate, results]
  );

  const openRecentAnime = useCallback(
    (anime: AnimeSearchResultType) => {
      navigate("/watch", {
        state: {
          anime: { id: anime.id, name: anime.name, mode: anime.mode },
          episodes: [],
          currentEpisode: "1",
          preferLatest: true,
        },
      });
    },
    [navigate]
  );

  const handleThumbnailError = useCallback((animeId: string) => {
    setRecentThumbnails((prev) => (prev[animeId] === null ? prev : { ...prev, [animeId]: null }));
  }, []);

  return (
    <div className="container flex flex-col gap-6 p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col items-center gap-4">
        <img
          className="h-20 w-20 shrink-0 dark:hidden select-none pointer-events-none"
          src={LogoRoundedSquare}
          alt=""
          draggable={false}
        />
        <img
          className="h-20 w-20 shrink-0 hidden dark:block select-none pointer-events-none"
          src={LogoRoundedSquareLight}
          alt=""
          draggable={false}
        />
        <h1 className="text-2xl font-semibold tracking-tight">Openanime</h1>
        <p className="text-muted-foreground text-sm text-center">
          A desktop wrapper on top of{" "}
          <button
            type="button"
            onClick={openAniCliRepo}
            className="underline underline-offset-2 text-foreground"
          >
            pystardust/ani-cli
          </button>
          . <br />
          Watch your favourite anime directly from your desktop.
        </p>
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search anime…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 h-11"
          autoFocus
        />
      </div>

      {loading && <p className="text-muted-foreground text-sm">Searching…</p>}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      {results.length > 0 && (
        <ul className="border border-border rounded-md divide-y divide-border">
          {results.map((anime) => {
            const isExpanded = expandedId === anime.id;
            const episodesState = episodesByShowId[anime.id] ?? { status: "idle" as const };
            return (
              <li key={anime.id} className="flex flex-col">
                <button
                  type="button"
                  onClick={() => toggleExpand(anime)}
                  className={`px-4 py-3 flex justify-between items-center gap-4 text-left transition-colors rounded-none ${
                    isExpanded ? "bg-muted/60" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium truncate">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    {anime.name}
                  </span>
                  <span className="text-muted-foreground text-sm shrink-0">
                    {anime.episodeCount} episodes ({anime.mode})
                  </span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 pt-0 border-t border-border/50 bg-muted/20">
                    {episodesState.status === "loading" && (
                      <p className="text-sm text-muted-foreground py-2">Loading episodes…</p>
                    )}
                    {episodesState.status === "error" && (
                      <p className="text-sm text-destructive py-2">{episodesState.message}</p>
                    )}
                    {episodesState.status === "loaded" && (
                      <ul className="flex flex-wrap gap-2 py-2">
                        {episodesState.episodes.map((ep) => {
                          const isPlaying = playingEpisode === `${anime.id}-${ep}`;
                          return (
                            <li key={ep}>
                              <button
                                type="button"
                                onClick={() => playEpisode(anime, ep, episodesState.episodes)}
                                disabled={isPlaying}
                                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/80 transition-colors disabled:opacity-50"
                              >
                                {isPlaying ? "Resolving…" : ep}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && results.length === 0 && debouncedQuery.trim() && !error && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}

      {!debouncedQuery.trim() && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Recently uploaded</h2>
          {recentLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : recentAnime.length > 0 ? (
            <div className="relative">
              <div className="flex gap-3 overflow-x-auto pb-2 scroll-smooth">
                {recentAnime.map((anime) => {
                  const thumb = recentThumbnails[anime.id] ?? null;
                  return (
                    <button
                      key={anime.id}
                      type="button"
                      className="group flex-shrink-0 w-36 sm:w-40 text-left focus-visible:outline-none"
                      onClick={() => openRecentAnime(anime)}
                    >
                      <div className="relative w-full aspect-[2/3] rounded-2xl border-2 border-border transition-all p-[3px] box-border group-hover:border-primary/80 group-hover:shadow-[0_0_0_1px_rgba(129,140,248,0.7)] group-focus-visible:border-primary/80 group-focus-visible:shadow-[0_0_0_1px_rgba(129,140,248,0.7)]">
                        <div className="h-full w-full rounded-xl overflow-hidden bg-muted">
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="h-full w-full object-cover"
                              onError={() => handleThumbnailError(anime.id)}
                            />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center bg-muted-foreground/5 text-muted-foreground/70">
                              <ImageOff className="h-6 w-6" aria-hidden="true" />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 h-16 flex flex-col items-start justify-start">
                        <p className="text-xs font-medium line-clamp-2 break-words">{anime.name}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Episode {anime.episodeCount} · {anime.mode}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No recent anime found.</p>
          )}
        </section>
      )}
    </div>
  );
}
