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
  anilistMediaId?: number | null;
  anilistListEntry?: {
    id: number;
    status: string;
    progress?: number | null;
  } | null;
  anilistIsFavourite?: boolean;
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

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve an AniList media id from stream details / route ids.
 * Never treat a provider-native id as AniList (e.g. anidb.app numeric ids collide).
 */
function resolveAniListMediaId(
  animeId: string | undefined,
  providerId: string | undefined,
  streamDetails: ShowDetails
): number | null {
  const streamId = asPositiveInt(streamDetails.id);
  if (streamId != null && streamDetails.id !== streamDetails.providerId) {
    return streamId;
  }

  const fromParam = asPositiveInt(animeId);
  if (fromParam != null && animeId !== providerId && animeId !== streamDetails.providerId) {
    return fromParam;
  }

  return null;
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
  aniListDetails: AniListShowDetails | null,
  mediaId: number | null
): RichShowDetails {
  const coverImage =
    aniListDetails?.coverImage?.extraLarge ??
    aniListDetails?.coverImage?.large ??
    aniListDetails?.coverImage?.medium ??
    streamDetails.thumbnail ??
    null;

  return {
    id: mediaId != null ? String(mediaId) : streamDetails.id,
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
    anilistMediaId: mediaId,
    anilistListEntry: aniListDetails?.mediaListEntry ?? null,
    anilistIsFavourite: aniListDetails?.isFavourite === true,
  };
}

export function useShowDetails(
  animeId?: string,
  providerId?: string,
  providerOverride?: "allanime" | "anidb" | "animepahe" | "animeparadise" | "reanime" | "senshi"
): UseShowDetailsResult {
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

    void (async () => {
      try {
        const [detailsResult, subResult, dubResult] = await Promise.allSettled([
          window.streamProvider.getShowDetails(providerId, providerOverride),
          window.streamProvider.getEpisodes(providerId, "sub", providerOverride),
          window.streamProvider.getEpisodes(providerId, "dub", providerOverride),
        ]);

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
        const mediaId = resolveAniListMediaId(animeId, providerId, streamDetails);

        let aniListDetails: AniListShowDetails | null = null;
        if (mediaId != null) {
          try {
            aniListDetails = await window.anilist.getShowDetails(mediaId);
          } catch {
            aniListDetails = null;
          }
        }

        if (cancelled) return;

        setDetails(
          canonicalizeRichShowDetails(
            streamDetails,
            subEpisodes,
            dubEpisodes,
            aniListDetails,
            mediaId
          )
        );
      } catch (err: unknown) {
        if (!cancelled) {
          setDetails(null);
          setError(err instanceof Error ? err.message : "Failed to load details");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [animeId, providerId, providerOverride]);

  return { details, episodesByMode, loading, error };
}
