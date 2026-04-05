import type { AniListMediaPageVariables, AniListMediaPageResult, AniListShowDetails } from "@/shared/types";

import { postAniListGraphql } from "./anilist-api";

export const ANILIST_MEDIA_PAGE_QUERY = `
  query (
    $page: Int = 1
    $id: Int
    $type: MediaType
    $isAdult: Boolean = false
    $search: String
    $format: [MediaFormat]
    $status: MediaStatus
    $countryOfOrigin: CountryCode
    $source: MediaSource
    $season: MediaSeason
    $seasonYear: Int
    $year: String
    $onList: Boolean
    $yearLesser: FuzzyDateInt
    $yearGreater: FuzzyDateInt
    $episodeLesser: Int
    $episodeGreater: Int
    $durationLesser: Int
    $durationGreater: Int
    $chapterLesser: Int
    $chapterGreater: Int
    $volumeLesser: Int
    $volumeGreater: Int
    $licensedBy: [Int]
    $isLicensed: Boolean
    $genres: [String]
    $excludedGenres: [String]
    $tags: [String]
    $excludedTags: [String]
    $minimumTagRank: Int
    $sort: [MediaSort] = [POPULARITY_DESC, SCORE_DESC]
  ) {
    Page(page: $page, perPage: 6) {
      pageInfo {
        total
        perPage
        currentPage
        lastPage
        hasNextPage
      }
      media(
        id: $id
        type: $type
        season: $season
        format_in: $format
        status: $status
        countryOfOrigin: $countryOfOrigin
        source: $source
        search: $search
        onList: $onList
        seasonYear: $seasonYear
        startDate_like: $year
        startDate_lesser: $yearLesser
        startDate_greater: $yearGreater
        episodes_lesser: $episodeLesser
        episodes_greater: $episodeGreater
        duration_lesser: $durationLesser
        duration_greater: $durationGreater
        chapters_lesser: $chapterLesser
        chapters_greater: $chapterGreater
        volumes_lesser: $volumeLesser
        volumes_greater: $volumeGreater
        licensedById_in: $licensedBy
        isLicensed: $isLicensed
        genre_in: $genres
        genre_not_in: $excludedGenres
        tag_in: $tags
        tag_not_in: $excludedTags
        minimumTagRank: $minimumTagRank
        sort: $sort
        isAdult: $isAdult
      ) {
        id
        title {
          userPreferred
        }
        coverImage {
          extraLarge
          large
          color
        }
        startDate {
          year
          month
          day
        }
        endDate {
          year
          month
          day
        }
        bannerImage
        season
        seasonYear
        description
        type
        format
        status(version: 2)
        episodes
        duration
        chapters
        volumes
        genres
        isAdult
        averageScore
        popularity
        nextAiringEpisode {
          airingAt
          timeUntilAiring
          episode
        }
        mediaListEntry {
          id
          status
        }
        studios(isMain: true) {
          edges {
            isMain
            node {
              id
              name
            }
          }
        }
      }
    }
  }
`;

interface AniListPageMediaRaw {
  id: number;
  title?: { userPreferred?: string | null } | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    color?: string | null;
  } | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  endDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  bannerImage?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  description?: string | null;
  type?: string | null;
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  duration?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  genres?: string[] | null;
  isAdult?: boolean | null;
  averageScore?: number | null;
  popularity?: number | null;
  nextAiringEpisode?: {
    airingAt?: number | null;
    timeUntilAiring?: number | null;
    episode?: number | null;
  } | null;
  mediaListEntry?: { id?: number | null; status?: string | null } | null;
  studios?: {
    edges?: Array<{
      isMain?: boolean | null;
      node?: { id?: number | null; name?: string | null } | null;
    }> | null;
  } | null;
}

interface AniListMediaPageData {
  Page?: {
    pageInfo?: AniListMediaPageResult["pageInfo"];
    media?: (AniListPageMediaRaw | null)[] | null;
  } | null;
}

function mapPageMediaToShowDetails(raw: AniListPageMediaRaw): AniListShowDetails {
  const studioEdges = raw.studios?.edges ?? [];
  const studios = studioEdges
    .map((e) => {
      const node = e.node;
      if (!node?.id || node.name == null) return null;
      return {
        isMain: e.isMain ?? undefined,
        node: { id: node.id, name: node.name },
      };
    })
    .filter((s): s is NonNullable<typeof s> => s != null);

  const next = raw.nextAiringEpisode;
  const nextAiringEpisode =
    next &&
    next.airingAt != null &&
    next.timeUntilAiring != null &&
    next.episode != null
      ? {
          airingAt: next.airingAt,
          timeUntilAiring: next.timeUntilAiring,
          episode: next.episode,
        }
      : null;

  const mle = raw.mediaListEntry;
  const mediaListEntry =
    mle?.id != null && mle.status != null ? { id: mle.id, status: mle.status } : null;

  return {
    id: raw.id,
    title: raw.title?.userPreferred != null ? { userPreferred: raw.title.userPreferred } : null,
    coverImage: raw.coverImage
      ? {
          extraLarge: raw.coverImage.extraLarge ?? null,
          large: raw.coverImage.large ?? null,
          medium: null,
          color: raw.coverImage.color ?? null,
        }
      : null,
    startDate: raw.startDate ?? null,
    endDate: raw.endDate ?? null,
    bannerImage: raw.bannerImage ?? null,
    season: raw.season ?? null,
    seasonYear: raw.seasonYear ?? null,
    description: raw.description ?? null,
    type: raw.type ?? null,
    format: raw.format ?? null,
    status: raw.status ?? null,
    episodes: raw.episodes ?? null,
    duration: raw.duration ?? null,
    chapters: raw.chapters ?? null,
    volumes: raw.volumes ?? null,
    genres: raw.genres ?? null,
    isAdult: raw.isAdult ?? null,
    averageScore: raw.averageScore ?? null,
    popularity: raw.popularity ?? null,
    nextAiringEpisode,
    mediaListEntry,
    studios: studios.length > 0 ? studios : undefined,
  };
}

function graphqlVariablesFromInput(input: AniListMediaPageVariables): Record<string, unknown> {
  const { sort, ...rest } = input;
  const vars: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) {
      vars[key] = value;
    }
  }
  if (sort !== undefined) {
    vars.sort = typeof sort === "string" ? [sort] : sort;
  }
  return vars;
}

export async function fetchAniListMediaPage(variables: AniListMediaPageVariables): Promise<AniListMediaPageResult> {
  const data = await postAniListGraphql<AniListMediaPageData>(
    ANILIST_MEDIA_PAGE_QUERY,
    graphqlVariablesFromInput(variables)
  );

  const page = data.Page;
  if (!page?.pageInfo) {
    throw new Error("AniList page response incomplete");
  }

  const mediaList = (page.media ?? []).filter((m): m is AniListPageMediaRaw => m != null);
  const media = mediaList.map(mapPageMediaToShowDetails);

  return {
    pageInfo: page.pageInfo,
    media,
  };
}
