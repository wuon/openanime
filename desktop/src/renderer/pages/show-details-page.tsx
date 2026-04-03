import { ArrowLeft, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/renderer/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import { Show, ShowDetails } from "@/shared/types";

type EpisodesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: string[] }
  | { status: "error"; message: string };

interface LocationState {
  anime?: Show;
}

type AnimeMode = "sub" | "dub";

const MODES: AnimeMode[] = ["sub", "dub"];

export function ShowDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [episodesByMode, setEpisodesByMode] = useState<Record<AnimeMode, EpisodesState>>({
    sub: { status: "idle" },
    dub: { status: "idle" },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingEpisode, setPlayingEpisode] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AnimeMode>(state?.anime?.mode ?? "sub");
  const providerIdFromQuery = new URLSearchParams(location.search).get("providerId") ?? undefined;

  const anime =
    state?.anime ??
    (id && providerIdFromQuery
      ? {
          id,
          providerId: providerIdFromQuery,
          name: "",
          episodeCount: 0,
          mode: "sub" as const,
        }
      : null);

  useEffect(() => {
    setActiveMode(anime?.mode ?? "sub");
  }, [anime?.id, anime?.mode]);

  useEffect(() => {
    if (!id || !anime?.providerId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEpisodesByMode({ sub: { status: "loading" }, dub: { status: "loading" } });

    void Promise.allSettled([
      window.streamProvider.getShowDetails(anime.providerId),
      window.streamProvider.getEpisodes(anime.providerId, "sub"),
      window.streamProvider.getEpisodes(anime.providerId, "dub"),
    ])
      .then(([detailsResult, subResult, dubResult]) => {
        if (cancelled) return;

        if (detailsResult.status === "fulfilled") {
          setDetails(detailsResult.value);
        } else {
          setError(
            detailsResult.reason instanceof Error
              ? detailsResult.reason.message
              : "Failed to load details"
          );
        }

        const nextSubState: EpisodesState =
          subResult.status === "fulfilled"
            ? { status: "loaded", episodes: subResult.value }
            : {
                status: "error",
                message:
                  subResult.reason instanceof Error
                    ? subResult.reason.message
                    : "Failed to load sub episodes",
              };

        const nextDubState: EpisodesState =
          dubResult.status === "fulfilled"
            ? { status: "loaded", episodes: dubResult.value }
            : {
                status: "error",
                message:
                  dubResult.reason instanceof Error
                    ? dubResult.reason.message
                    : "Failed to load dub episodes",
              };

        setEpisodesByMode({ sub: nextSubState, dub: nextDubState });

        const preferredMode = anime.mode;
        const preferredEpisodes =
          preferredMode === "sub"
            ? nextSubState.status === "loaded"
              ? nextSubState.episodes
              : []
            : nextDubState.status === "loaded"
              ? nextDubState.episodes
              : [];
        const fallbackEpisodes =
          preferredMode === "sub"
            ? nextDubState.status === "loaded"
              ? nextDubState.episodes
              : []
            : nextSubState.status === "loaded"
              ? nextSubState.episodes
              : [];

        if (preferredEpisodes.length === 0 && fallbackEpisodes.length > 0) {
          setActiveMode(preferredMode === "sub" ? "dub" : "sub");
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, anime?.providerId, anime?.mode]);

  const playEpisode = useCallback(
    (episode: string, episodes: string[], mode: AnimeMode) => {
      if (!anime?.id) return;
      setPlayingEpisode(episode);
      navigate("/watch", {
        state: {
          anime: {
            id: anime.id,
            providerId: anime.providerId,
            name: details?.name ?? anime.name,
            mode,
          },
          episodes,
          currentEpisode: episode,
        },
      });
      setPlayingEpisode(null);
    },
    [navigate, anime, details?.name]
  );

  if (!id) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">No anime selected.</p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (loading && !details) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading…</p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (error && !details) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
        <Button asChild variant="outline">
          <Link to="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  const displayName = details?.name ?? anime?.name ?? "Unknown";
  const subEpisodes = episodesByMode.sub.status === "loaded" ? episodesByMode.sub.episodes : [];
  const dubEpisodes = episodesByMode.dub.status === "loaded" ? episodesByMode.dub.episodes : [];
  const hasSub = subEpisodes.length > 0;
  const hasDub = dubEpisodes.length > 0;
  const tabs = MODES.filter((mode) => (mode === "sub" ? hasSub : hasDub));
  const episodes = activeMode === "sub" ? subEpisodes : dubEpisodes;
  const activeState = episodesByMode[activeMode];
  const isAnyEpisodesLoading =
    episodesByMode.sub.status === "loading" || episodesByMode.dub.status === "loading";
  const allModesFailed =
    episodesByMode.sub.status === "error" && episodesByMode.dub.status === "error";

  return (
    <>
      <div className="flex flex-col h-full min-h-0">
        <div className="sticky top-12 z-10 flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-background">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="text-sm font-medium truncate flex-1 min-w-0">{displayName}</span>
        </div>

        <div className="container flex flex-col gap-6 p-6 md:p-8 max-w-3xl mx-auto">
          <div className="flex gap-6">
            {details?.thumbnail ? (
              <img
                src={details.thumbnail}
                draggable={false}
                alt=""
                className="w-32 sm:w-40 aspect-[2/3] object-cover rounded-xl border-2 border-border shrink-0"
              />
            ) : (
              <div className="w-32 sm:w-40 aspect-[2/3] rounded-xl border-2 border-border bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-xs">
                No image
              </div>
            )}
            <div className="flex flex-col gap-2 min-w-0 flex-1">
              <p className="text-sm text-muted-foreground">
                {details?.type ?? "TV"} · {episodes.length || anime?.episodeCount || 0} episodes
              </p>
              {details?.description && (
                <p className="text-sm text-foreground/90 line-clamp-6">{details.description}</p>
              )}
            </div>
          </div>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Episodes</h2>
            {tabs.length > 0 && (
              <Tabs
                value={activeMode}
                onValueChange={(value) => {
                  if (value === "sub" || value === "dub") setActiveMode(value);
                }}
              >
                <TabsList>
                  {tabs.map((mode) => (
                    <TabsTrigger key={mode} value={mode} className="capitalize">
                      {mode}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
            {isAnyEpisodesLoading && (
              <p className="text-sm text-muted-foreground">Loading episodes…</p>
            )}
            {!isAnyEpisodesLoading && activeState.status === "error" && (
              <p className="text-sm text-destructive">{activeState.message}</p>
            )}
            {!isAnyEpisodesLoading && tabs.length === 0 && !allModesFailed && (
              <p className="text-sm text-muted-foreground">No episodes available.</p>
            )}
            {!isAnyEpisodesLoading && allModesFailed && (
              <p className="text-sm text-destructive">
                Failed to load episodes for both sub and dub.
              </p>
            )}
            {episodes.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {episodes.map((ep) => {
                  const isPlaying = playingEpisode === ep;
                  return (
                    <li key={ep}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => playEpisode(ep, episodes, activeMode)}
                        disabled={isPlaying}
                      >
                        {ep}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
