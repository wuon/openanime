import { Search, Trash2 } from "lucide-react";
import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import LogoRoundedSquareLight from "@/renderer/assets/logo-rounded-square-light.svg";
import LogoRoundedSquare from "@/renderer/assets/logo-rounded-square.svg";
import { EpisodeCard } from "@/renderer/components/episode-card";
import { HorizontalCarousel } from "@/renderer/components/horizontal-carousel";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { useWelcomeRecentlyUploaded } from "@/renderer/hooks/use-welcome-recent-uploads";
import { useWelcomeRecentlyWatched } from "@/renderer/hooks/use-welcome-recently-watched";
import type { Episode, HistoryEntry } from "@/shared/types";

const RECENT_PAGE_SIZE = 12;

export function WelcomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const { recentUploads, recentUploadsLoading } = useWelcomeRecentlyUploaded(RECENT_PAGE_SIZE);
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

  const openRecentAnime = useCallback(
    (episode: Episode) => {
      navigate("/watch", { state: { episode } });
    },
    [navigate]
  );

  const openRecentlyWatched = useCallback(
    (entry: HistoryEntry) => {
      navigate("/watch", { state: { episode: entry.episode } });
    },
    [navigate]
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
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

      <form
        className="relative w-full flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = query.trim();
          navigate({
            pathname: "/search",
            ...(trimmed ? { search: `?q=${encodeURIComponent(trimmed)}` } : {}),
          });
        }}
      >
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
          <Input
            type="text"
            placeholder="Search anime…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 h-11"
            autoFocus
          />
        </div>
        <Button type="submit" className="">
          Search
        </Button>
      </form>

      <>
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Continue watching</h2>
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
            <HorizontalCarousel>
              {recentlyWatched.map((entry: HistoryEntry) => (
                <EpisodeCard
                  key={entry.id}
                  layout="carousel"
                  thumbnailUrl={entry.episode.thumbnail}
                  badge={`Episode ${String(entry.episode.index)}`}
                  subtitle={
                    recentlyWatchedDetails[entry.episode.id]?.name ??
                    entry.episode.title.english ??
                    entry.episode.title.romanji ??
                    entry.episode.title.native ??
                    entry.episode.id
                  }
                  onClick={() => openRecentlyWatched(entry)}
                  totalDurationMs={entry.totalDurationMs}
                  currentDurationMs={entry.currentDurationMs}
                />
              ))}
            </HorizontalCarousel>
          ) : (
            <p className="text-muted-foreground text-sm">No recently watched anime.</p>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Recently uploaded</h2>
          {recentUploadsLoading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : recentUploads.length > 0 ? (
            <HorizontalCarousel
              items={recentUploads.map((episode) => ({
                id: `${episode.id}-${episode.index}-${episode.mode}`,
                coverUrl: episode.thumbnail,
                title:
                  episode.title.english ??
                  episode.title.romanji ??
                  episode.title.native ??
                  episode.providerId,
                badges: (
                  <Badge
                    variant="glass"
                    className="text-white flex items-center gap-1 align-middle"
                  >
                    {`Episode ${episode.index}`}
                  </Badge>
                ),
                onClick: () => openRecentAnime(episode),
              }))}
            />
          ) : (
            <p className="text-muted-foreground text-sm">No recent anime found.</p>
          )}
        </section>
      </>
    </div>
  );
}
