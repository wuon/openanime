import { Search, Trash2 } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { HorizontalCarousel } from "@/renderer/components/horizontal-carousel";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { useDebouncedValue } from "@/renderer/hooks/use-debounced-value";
import { useWelcomeRecentUploads } from "@/renderer/hooks/use-welcome-recent-uploads";
import { useWelcomeRecentlyWatched } from "@/renderer/hooks/use-welcome-recently-watched";
import { useWelcomeSearch } from "@/renderer/hooks/use-welcome-search";
import { type AnimeSearchResult as AnimeSearchResultType } from "@/renderer/lib/ani-cli-bridge";
import { type RecentlyWatchedEntry } from "@/renderer/lib/recently-watched-bridge";

const SEARCH_DEBOUNCE_MS = 500;
const RECENT_PAGE_SIZE = 12;

function getAvailabilityLabel(anime: AnimeSearchResultType): string {
  const hasSub = anime.hasSub ?? anime.mode === "sub";
  const hasDub = anime.hasDub ?? anime.mode === "dub";

  if (hasSub && hasDub) return "sub / dub";
  if (hasDub) return "dub";
  return "sub";
}

export function WelcomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);

  const { results, loading, error, searchThumbnails } = useWelcomeSearch(debouncedQuery);
  const { recentAnime, recentLoading, recentThumbnails } =
    useWelcomeRecentUploads(RECENT_PAGE_SIZE);
  const { recentlyWatched, recentlyWatchedLoading, recentlyWatchedDetails, clearRecentlyWatched } =
    useWelcomeRecentlyWatched();

  const openAniCliRepo = useCallback(() => {
    const url = "https://github.com/pystardust/ani-cli";
    if (window.urlOpener) {
      void window.urlOpener.openUrl(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

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
              subtitle: `Episode ${anime.episodeCount} · ${getAvailabilityLabel(anime)}`,
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Recently watched</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  void clearRecentlyWatched();
                }}
                disabled={recentlyWatchedLoading || recentlyWatched.length === 0}
                className="text-muted-foreground hover:text-foreground"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
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
                  subtitle: `Episode ${anime.episodeCount} · ${getAvailabilityLabel(anime)}`,
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
