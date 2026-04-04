import { useEffect, useState } from "react";

import type { AniListShowDetails, ShowDetails } from "@/shared/types";

type AnimeMode = "sub" | "dub";

export type EpisodesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; episodes: string[] }
  | { status: "error"; message: string };

export type RichEpisode = {
  index: number;
  thumbnail?: string | null;
  title?: string | null;
};

export type RichShowDetails = {
  id: string;
  providerId: string;
  title: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  };
  description: string | null;
  coverImage: string | null;
  bannerImage: string | null;
  episodes: {
    sub?: RichEpisode[];
    dub?: RichEpisode[];
    raw?: RichEpisode[];
  };
  duration?: number | null;
  averageScore?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
};

interface UseShowDetailsResult {
  details: RichShowDetails | null;
  episodesByMode: Record<AnimeMode, EpisodesState>;
  loading: boolean;
  error: string | null;
}

function parseEpisodeIndex(episode: string, fallbackIndex: number): number {
  const parsed = Number(episode);
  return Number.isFinite(parsed) ? parsed : fallbackIndex + 1;
}

function normalizeEpisodeTitle(title?: string | null): string | null {
  if (!title) return null;
  return title.replace(/^episode\s*\d+\s*-\s*/i, "").trim();
}

function mapRichEpisodes(
  providerEpisodes: string[],
  streamingEpisodes?: AniListShowDetails["streamingEpisodes"] | null
): RichEpisode[] {
  return providerEpisodes.map((episode, position) => {
    const aniListEpisode = streamingEpisodes?.[position];
    return {
      index: parseEpisodeIndex(episode, position),
      thumbnail: aniListEpisode?.thumbnail ?? null,
      title: normalizeEpisodeTitle(aniListEpisode?.title),
    };
  });
}

function canonicalizeRichShowDetails(
  streamDetails: ShowDetails,
  subEpisodes: string[],
  dubEpisodes: string[],
  aniListDetails: AniListShowDetails | null
): RichShowDetails {
  const coverImage =
    aniListDetails?.coverImage?.extraLarge ??
    aniListDetails?.coverImage?.large ??
    aniListDetails?.coverImage?.medium ??
    streamDetails.thumbnail ??
    null;

  return {
    id: streamDetails.id,
    providerId: streamDetails.providerId,
    title: {
      english: aniListDetails?.title?.english ?? streamDetails.name ?? null,
      romaji: aniListDetails?.title?.romaji ?? null,
      native: aniListDetails?.title?.native ?? null,
    },
    description: aniListDetails?.description ?? streamDetails.description ?? null,
    coverImage,
    bannerImage: aniListDetails?.bannerImage ?? null,
    episodes: {
      sub:
        subEpisodes.length > 0
          ? mapRichEpisodes(subEpisodes, aniListDetails?.streamingEpisodes)
          : [],
      dub:
        dubEpisodes.length > 0
          ? mapRichEpisodes(dubEpisodes, aniListDetails?.streamingEpisodes)
          : [],
    },
    duration: aniListDetails?.duration ?? null,
    averageScore: aniListDetails?.averageScore ?? null,
    season: aniListDetails?.season ?? null,
    seasonYear: aniListDetails?.seasonYear ?? null,
    status: aniListDetails?.status ?? null,
  };
}

export function useShowDetails(animeId?: string, providerId?: string): UseShowDetailsResult {
  const [details, setDetails] = useState<RichShowDetails | null>(null);
  const [episodesByMode, setEpisodesByMode] = useState<Record<AnimeMode, EpisodesState>>({
    sub: { status: "idle" },
    dub: { status: "idle" },
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!animeId || !providerId) {
      setDetails(null);
      setEpisodesByMode({ sub: { status: "idle" }, dub: { status: "idle" } });
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setEpisodesByMode({ sub: { status: "loading" }, dub: { status: "loading" } });

    const mediaId = Number(animeId);
    const shouldFetchAniList = Number.isInteger(mediaId) && mediaId > 0;

    void Promise.allSettled([
      window.streamProvider.getShowDetails(providerId),
      window.streamProvider.getEpisodes(providerId, "sub"),
      window.streamProvider.getEpisodes(providerId, "dub"),
      shouldFetchAniList ? window.anilist.getShowDetails(mediaId) : Promise.resolve(null),
    ])
      .then(([detailsResult, subResult, dubResult, aniListResult]) => {
        if (cancelled) return;

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

        if (detailsResult.status !== "fulfilled") {
          setDetails(null);
          setError(
            detailsResult.reason instanceof Error
              ? detailsResult.reason.message
              : "Failed to load details"
          );
          return;
        }

        const streamDetails = detailsResult.value;
        const subEpisodes = nextSubState.status === "loaded" ? nextSubState.episodes : [];
        const dubEpisodes = nextDubState.status === "loaded" ? nextDubState.episodes : [];
        const aniListDetails =
          aniListResult.status === "fulfilled" ? (aniListResult.value as AniListShowDetails) : null;

        setDetails(
          canonicalizeRichShowDetails(streamDetails, subEpisodes, dubEpisodes, aniListDetails)
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setDetails(null);
          setError(err instanceof Error ? err.message : "Failed to load details");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [animeId, providerId]);

  return { details, episodesByMode, loading, error };
}
