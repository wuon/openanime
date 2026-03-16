import { ChevronDown, ChevronRight, Play, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Input } from "@/renderer/components/ui/input";
import { useDebouncedValue } from "@/renderer/hooks/use-debounced-value";

type EpisodesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: string[] }
  | { status: "error"; message: string };

const SEARCH_DEBOUNCE_MS = 500;

export function AnimeSearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<AnimeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [episodesByShowId, setEpisodesByShowId] = useState<
    Record<string, EpisodesState>
  >({});
  const [playingEpisode, setPlayingEpisode] = useState<string | null>(null);

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
    window.aniCli
      .search(q)
      .then((list) => {
        if (!cancelled) setResults(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const loadEpisodes = useCallback(async (anime: AnimeSearchResult) => {
    setEpisodesByShowId((prev) => ({ ...prev, [anime.id]: { status: "loading" } }));
    try {
      const episodes = await window.aniCli.getEpisodes(anime.id, anime.mode);
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
    (anime: AnimeSearchResult) => {
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
    (anime: AnimeSearchResult, episode: string, episodes: string[]) => {
      setPlayingEpisode(`${anime.id}-${episode}`);
      navigate("/watch", {
        state: {
          anime: { id: anime.id, name: anime.name, mode: anime.mode },
          episodes,
          currentEpisode: episode,
        },
      });
      setPlayingEpisode(null);
    },
    [navigate]
  );

  return (
    <div className="container flex flex-col gap-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Anime search</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Search using the same source as ani-cli (allanime). Click an anime to see episodes.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="e.g. one piece, spy x family"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
          disabled={loading}
        />
      </div>

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
                  <div className="px-4 pb-4 pt-0 pl-12 border-t border-border/50 bg-muted/20">
                    {episodesState.status === "loading" && (
                      <p className="text-sm text-muted-foreground py-2">Loading episodes…</p>
                    )}
                    {episodesState.status === "error" && (
                      <p className="text-sm text-destructive py-2">
                        {episodesState.message}
                      </p>
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
                                <Play className="h-3 w-3 shrink-0" />
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
    </div>
  );
}
