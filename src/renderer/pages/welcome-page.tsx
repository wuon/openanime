import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { Button } from "@/renderer/components/ui/button";
import { Card, CardContent } from "@/renderer/components/ui/card";
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
const RECENT_PAGE_SIZE = 12; // 3x4 grid

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
  const [recentPage, setRecentPage] = useState(1);
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [recentLoading, setRecentLoading] = useState(true);

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
      .getRecent(recentPage, RECENT_PAGE_SIZE)
      .then(
        (res: { items: AnimeSearchResultType[]; hasMore: boolean }) => {
          if (!cancelled) {
            setRecentAnime(res.items);
            setRecentHasMore(res.hasMore);
          }
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
  }, [recentPage]);

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

  return (
    <div className="container flex flex-col gap-6 p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col items-center gap-4">
        <img className="h-20 w-20 shrink-0 dark:hidden" src={LogoRoundedSquare} alt="" />
        <img className="h-20 w-20 shrink-0 hidden dark:block" src={LogoRoundedSquareLight} alt="" />
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
                  className="px-4 py-3 flex justify-between items-center gap-4 text-left hover:bg-muted/50 transition-colors rounded-none"
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
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Recently uploaded</h2>
          {recentLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : recentAnime.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {recentAnime.map((anime) => (
                  <Card
                    key={anime.id}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                    onClick={() => openRecentAnime(anime)}
                  >
                    <CardContent className="p-4">
                      <p className="font-medium line-clamp-2">{anime.name}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {anime.episodeCount} episodes · {anime.mode}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRecentPage((p) => Math.max(1, p - 1))}
                  disabled={recentPage <= 1 || recentLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground px-2">Page {recentPage}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRecentPage((p) => p + 1)}
                  disabled={!recentHasMore || recentLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">No recent anime found.</p>
          )}
        </section>
      )}

      <p className="text-center text-xs text-muted-foreground">made with ❤️ from Openanime</p>
    </div>
  );
}
