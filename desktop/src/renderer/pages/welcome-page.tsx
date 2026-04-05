import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { EpisodeCard } from "@/renderer/components/episode-card";
import { HomeHeroCarousel } from "@/renderer/components/home-hero-carousel";
import { HorizontalCarousel } from "@/renderer/components/horizontal-carousel";
import { Badge } from "@/renderer/components/ui/badge";
import { useWelcomeRecentlyUploaded } from "@/renderer/hooks/use-welcome-recent-uploads";
import { useWelcomeRecentlyWatched } from "@/renderer/hooks/use-welcome-recently-watched";
import type { Episode, HistoryEntry } from "@/shared/types";

const RECENT_PAGE_SIZE = 12;

export function WelcomePage() {
  const navigate = useNavigate();
  const { recentUploads, recentUploadsLoading } = useWelcomeRecentlyUploaded(RECENT_PAGE_SIZE);
  const { recentlyWatched, recentlyWatchedLoading, recentlyWatchedDetails } =
    useWelcomeRecentlyWatched();

  const openRecentAnime = useCallback(
    (episode: Episode) => {
      navigate("/watch", { state: { episode } });
    },
    [navigate]
  );

  const openRecentlyWatched = useCallback(
    (entry: HistoryEntry) => {
      navigate("/watch", {
        state: {
          episode: entry.episode,
          ...(entry.currentDurationMs > 0 ? { resumeFromMs: entry.currentDurationMs } : {}),
        },
      });
    },
    [navigate]
  );

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
      <>
        <div className="-mt-8 -mx-8">
          <HomeHeroCarousel />
        </div>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Continue watching</h2>
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
