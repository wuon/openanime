import { ArrowLeft, Loader2, Play, Search } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import { useGoBack } from "@/renderer/hooks/use-go-back";
import { useShowDetails } from "@/renderer/hooks/use-show-details";
import { Show } from "@/shared/types";

import { Badge } from "../components/ui/badge";

interface LocationState {
  anime?: Show;
}

type AnimeMode = "sub" | "dub";
type EpisodeSort = "newest" | "oldest";

const MODES: AnimeMode[] = ["sub", "dub"];

export function ShowDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const state = location.state as LocationState | null;

  const [playingEpisode, setPlayingEpisode] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<AnimeMode>(state?.anime?.mode ?? "sub");
  const [episodeQuery, setEpisodeQuery] = useState("");
  const [episodeSort, setEpisodeSort] = useState<EpisodeSort>("newest");
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

  const { details, episodesByMode, loading, error } = useShowDetails(id, anime?.providerId);

  useEffect(() => {
    const nextSubEpisodes =
      episodesByMode.sub.status === "loaded" ? episodesByMode.sub.episodes : [];
    const nextDubEpisodes =
      episodesByMode.dub.status === "loaded" ? episodesByMode.dub.episodes : [];
    const preferredMode = anime?.mode ?? "sub";
    const preferredEpisodes = preferredMode === "sub" ? nextSubEpisodes : nextDubEpisodes;
    const fallbackEpisodes = preferredMode === "sub" ? nextDubEpisodes : nextSubEpisodes;

    if (preferredEpisodes.length === 0 && fallbackEpisodes.length > 0) {
      setActiveMode(preferredMode === "sub" ? "dub" : "sub");
    }
  }, [anime?.mode, episodesByMode.dub, episodesByMode.sub]);

  const playEpisode = useCallback(
    (episode: string, episodes: string[], mode: AnimeMode) => {
      if (!anime?.id) return;
      setPlayingEpisode(episode);
      const detailsName =
        details?.title.english ?? details?.title.romaji ?? details?.title.native ?? anime.name;
      navigate("/watch", {
        state: {
          anime: {
            id: anime.id,
            providerId: anime.providerId,
            name: detailsName,
            mode,
          },
          episodes,
          currentEpisode: episode,
        },
      });
      setPlayingEpisode(null);
    },
    [navigate, anime, details?.title.english, details?.title.native, details?.title.romaji]
  );

  if (!id) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">No anime selected.</p>
        <Button type="button" variant="outline" onClick={goBack}>
          Back
        </Button>
      </div>
    );
  }

  if (loading && !details) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Loading…</p>
        <Button type="button" variant="outline" onClick={goBack}>
          Back
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
        <Button type="button" variant="outline" onClick={goBack}>
          Back
        </Button>
      </div>
    );
  }

  const displayName =
    details?.title.english ??
    details?.title.romaji ??
    details?.title.native ??
    anime?.name ??
    "Unknown";
  const subEpisodes = episodesByMode.sub.status === "loaded" ? episodesByMode.sub.episodes : [];
  const dubEpisodes = episodesByMode.dub.status === "loaded" ? episodesByMode.dub.episodes : [];
  const hasSub = subEpisodes.length > 0;
  const hasDub = dubEpisodes.length > 0;
  const tabs = MODES.filter((mode) => (mode === "sub" ? hasSub : hasDub));
  const episodes = activeMode === "sub" ? subEpisodes : dubEpisodes;
  const richEpisodes =
    activeMode === "sub" ? (details?.episodes.sub ?? []) : (details?.episodes.dub ?? []);
  const episodeCards = episodes.map((episode, position) => {
    const richEpisode = richEpisodes[position];
    const parsedIndex = Number(episode);
    const index = Number.isFinite(parsedIndex) ? parsedIndex : position + 1;
    return {
      episode,
      index,
      title: richEpisode?.title ?? null,
      thumbnail: richEpisode?.thumbnail ?? details.bannerImage ?? details?.coverImage ?? null,
    };
  });
  const normalizedEpisodeQuery = episodeQuery.trim().toLowerCase();
  const visibleEpisodeCards = [...episodeCards]
    .filter((item) => {
      if (!normalizedEpisodeQuery) return true;
      return (
        `episode ${item.index}`.toLowerCase().includes(normalizedEpisodeQuery) ||
        (item.title ?? "").toLowerCase().includes(normalizedEpisodeQuery)
      );
    })
    .sort((a, b) => (episodeSort === "newest" ? b.index - a.index : a.index - b.index));
  const activeState = episodesByMode[activeMode];
  const isAnyEpisodesLoading =
    episodesByMode.sub.status === "loading" || episodesByMode.dub.status === "loading";
  const allModesFailed =
    episodesByMode.sub.status === "error" && episodesByMode.dub.status === "error";
  const score = details?.averageScore ? (details.averageScore / 10).toFixed(1) : null;
  const detailMeta = [
    details?.season && details?.seasonYear ? `${details.season} ${details.seasonYear}` : null,
    details?.duration ? `${details.duration}m` : null,
    score ? score : null,
    details?.status ?? null,
  ].filter(Boolean);

  const heroImage = details?.bannerImage ?? details?.coverImage ?? null;

  const heroBottomBlendGradient =
    "linear-gradient(to bottom, transparent 36%, hsl(var(--background) / 0.35) 58%, hsl(var(--background) / 0.82) 78%, hsl(var(--background)) 100%)";

  const heroLeftBlendGradient =
    "linear-gradient(to left, transparent 36%, hsl(var(--background) / 0.35) 58%, hsl(var(--background) / 0.82) 70%, hsl(var(--background)) 100%)";

  return (
    <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-0 p-6 md:p-8">
      <div className="relative -mx-8 overflow-hidden -mt-8">
        {heroImage ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
              aria-hidden
            />
            <div className="absolute inset-0 bg-black/60" aria-hidden />
            <div
              className="pointer-events-none absolute inset-0 z-[1]"
              style={{ background: heroBottomBlendGradient }}
              aria-hidden
            />
            <div
              className="pointer-events-none absolute inset-0 z-[1]"
              style={{ background: heroLeftBlendGradient }}
              aria-hidden
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-muted" aria-hidden />
        )}
        <div className="relative z-10 flex flex-col gap-6 p-6 text-white md:p-8">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={goBack}
              className="text-white hover:bg-white/15"
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">Back</span>
          </div>

          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="max-w-3xl space-y-4">
              <h1 className="text-3xl font-bold leading-tight text-foreground md:text-5xl">
                {displayName}
              </h1>
              {details?.description && (
                <p className="line-clamp-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                  {details.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {detailMeta.map((entry) => (
                  <Badge key={entry} variant="secondary">
                    {entry}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center pt-1">
                <Button
                  type="button"
                  onClick={() => {
                    if (episodes[0]) {
                      playEpisode(episodes[0], episodes, activeMode);
                    }
                  }}
                  disabled={!episodes[0]}
                  className="cursor-pointer font-semibold"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Play - Episode {episodes[0]}
                </Button>
              </div>
            </div>

            {details?.coverImage && (
              <img
                src={details.coverImage}
                draggable={false}
                alt=""
                className="h-64 w-auto rounded-xl border-2 object-cover border-transparent/20"
              />
            )}
          </div>
        </div>
      </div>

      <section className="text-foreground pt-6 md:pt-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={episodeQuery}
              onChange={(event) => setEpisodeQuery(event.target.value)}
              placeholder="Search episodes..."
              className="h-10 bg-background/90 pl-9"
            />
          </div>

          <div className="flex w-full gap-2 md:w-auto">
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
            <Select
              value={episodeSort}
              onValueChange={(value) => setEpisodeSort(value as EpisodeSort)}
            >
              <SelectTrigger className="h-10 w-[130px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-4">
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
          {visibleEpisodeCards.length > 0 && (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visibleEpisodeCards.map((item) => {
                const { episode, index, thumbnail, title } = item;
                const isPlaying = playingEpisode === episode;
                return (
                  <li key={`${activeMode}-${episode}`} className="w-full">
                    <button
                      type="button"
                      onClick={() => playEpisode(episode, episodes, activeMode)}
                      disabled={isPlaying}
                      className="group w-full text-left focus-visible:outline-none disabled:opacity-60"
                    >
                      <div className="relative h-40 w-full rounded-2xl border-2 border-border p-[3px] box-border transition-all group-hover:border-primary/80 group-hover:shadow-[0_0_0_1px_rgba(129,140,248,0.7)] group-focus-visible:border-primary/80 group-focus-visible:shadow-[0_0_0_1px_rgba(129,140,248,0.7)]">
                        <div className="relative h-full w-full overflow-hidden rounded-lg bg-muted">
                          {thumbnail ? (
                            <img
                              src={thumbnail}
                              alt=""
                              draggable={false}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full bg-muted" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                            <Badge
                              variant="glass"
                              className="cursor-default hover:bg-transparent/20"
                            >
                              Episode {index}
                            </Badge>
                            {title && (
                              <p className="line-clamp-2 text-sm font-semibold mt-1">{title}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!isAnyEpisodesLoading && visibleEpisodeCards.length === 0 && episodes.length > 0 && (
            <p className="text-sm text-muted-foreground">No matching episodes.</p>
          )}
        </div>
      </section>
    </div>
  );
}
