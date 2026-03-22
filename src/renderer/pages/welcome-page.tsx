import { Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { HorizontalCarousel } from "@/renderer/components/ui/horizontal-carousel";
import { Input } from "@/renderer/components/ui/input";
import { useDebouncedValue } from "@/renderer/hooks/use-debounced-value";
import {
  type AnimeSearchResult as AnimeSearchResultType,
  getAniCli,
} from "@/renderer/lib/ani-cli-bridge";
import {
  type RecentlyWatchedEntry,
  getRecentlyWatched,
} from "@/renderer/lib/recently-watched-bridge";

const SEARCH_DEBOUNCE_MS = 500;
const RECENT_PAGE_SIZE = 12;

export function WelcomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [results, setResults] = useState<AnimeSearchResultType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchThumbnails, setSearchThumbnails] = useState<Record<string, string | null>>({});

  const [recentAnime, setRecentAnime] = useState<AnimeSearchResultType[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentThumbnails, setRecentThumbnails] = useState<Record<string, string | null>>({});

  const [recentlyWatched, setRecentlyWatched] = useState<RecentlyWatchedEntry[]>([]);
  const [recentlyWatchedLoading, setRecentlyWatchedLoading] = useState(true);
  const [recentlyWatchedDetails, setRecentlyWatchedDetails] = useState<
    Record<string, { name: string; thumbnail: string | null }>
  >({});

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
    setSearchThumbnails({});
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

  // Fetch recently watched entries
  useEffect(() => {
    let cancelled = false;
    setRecentlyWatchedLoading(true);
    void getRecentlyWatched()
      .read()
      .then((entries) => {
        if (!cancelled) setRecentlyWatched(entries);
      })
      .finally(() => {
        if (!cancelled) setRecentlyWatchedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch details (name + thumbnail) for recently watched (by animeId)
  useEffect(() => {
    let cancelled = false;
    if (recentlyWatched.length === 0) return;
    const aniCli = getAniCli();
    const seen = new Set<string>();
    for (const entry of recentlyWatched) {
      if (seen.has(entry.animeId)) continue;
      seen.add(entry.animeId);
      if (recentlyWatchedDetails[entry.animeId] !== undefined) continue;
      void (async () => {
        try {
          const details = await aniCli.getShowDetails(entry.animeId);
          if (cancelled) return;
          setRecentlyWatchedDetails((prev) =>
            prev[entry.animeId] !== undefined
              ? prev
              : {
                  ...prev,
                  [entry.animeId]: { name: details.name, thumbnail: details.thumbnail ?? null },
                }
          );
        } catch {
          if (cancelled) return;
          setRecentlyWatchedDetails((prev) =>
            prev[entry.animeId] !== undefined
              ? prev
              : { ...prev, [entry.animeId]: { name: entry.animeId, thumbnail: null } }
          );
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [recentlyWatched]);

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

  // Fetch thumbnails for search results (used in the carousel)
  useEffect(() => {
    let cancelled = false;
    if (results.length === 0) return;
    const aniCli = getAniCli();
    for (const anime of results) {
      if (searchThumbnails[anime.id] !== undefined) continue;
      void (async () => {
        try {
          const details = await aniCli.getShowDetails(anime.id);
          if (cancelled) return;
          setSearchThumbnails((prev) =>
            prev[anime.id] !== undefined ? prev : { ...prev, [anime.id]: details.thumbnail ?? null }
          );
        } catch {
          if (cancelled) return;
          setSearchThumbnails((prev) =>
            prev[anime.id] !== undefined ? prev : { ...prev, [anime.id]: null }
          );
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [results]);

  const openSearchResult = useCallback(
    (anime: AnimeSearchResultType) => {
      navigate(`/anime/${anime.id}`, {
        state: { anime },
      });
    },
    [navigate]
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

  const openRecentlyWatched = useCallback(
    (entry: RecentlyWatchedEntry) => {
      const name = recentlyWatchedDetails[entry.animeId]?.name ?? "Anime";
      navigate("/watch", {
        state: {
          anime: { id: entry.animeId, name, mode: entry.mode },
          episodes: [],
          currentEpisode: entry.episode,
        },
      });
    },
    [navigate, recentlyWatchedDetails]
  );

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
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Search results</h2>
          <HorizontalCarousel
            items={results.map((anime) => ({
              id: anime.id,
              coverUrl: searchThumbnails[anime.id] ?? null,
              title: anime.name,
              subtitle: `Episode ${anime.episodeCount} · ${anime.mode}`,
              onClick: () => openSearchResult(anime),
            }))}
          />
        </section>
      )}

      {!loading && results.length === 0 && debouncedQuery.trim() && !error && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}

      {!debouncedQuery.trim() && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Recently watched</h2>
            {recentlyWatchedLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : recentlyWatched.length > 0 ? (
              <HorizontalCarousel
                items={recentlyWatched.map((entry, index) => ({
                  id: `${entry.animeId}-${entry.episode}-${index}`,
                  coverUrl: recentlyWatchedDetails[entry.animeId]?.thumbnail ?? null,
                  title: recentlyWatchedDetails[entry.animeId]?.name ?? entry.animeId,
                  subtitle: `Episode ${entry.episode} · ${entry.mode}`,
                  onClick: () => openRecentlyWatched(entry),
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-sm">No recently watched anime.</p>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Recently uploaded</h2>
            {recentLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : recentAnime.length > 0 ? (
              <HorizontalCarousel
                items={recentAnime.map((anime) => ({
                  id: anime.id,
                  coverUrl: recentThumbnails[anime.id] ?? null,
                  title: anime.name,
                  subtitle: `Episode ${anime.episodeCount} · ${anime.mode}`,
                  onClick: () => openRecentAnime(anime),
                }))}
              />
            ) : (
              <p className="text-muted-foreground text-sm">No recent anime found.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
