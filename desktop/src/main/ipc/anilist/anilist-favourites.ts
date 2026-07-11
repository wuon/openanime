import type { AniListFavouriteMedia } from "@/shared/types";

import { postAniListAuthedGraphql } from "./anilist-authed-api";

const FAVOURITES_QUERY = `
  query ($page: Int, $perPage: Int) {
    Viewer {
      favourites {
        anime(page: $page, perPage: $perPage) {
          pageInfo {
            total
            perPage
            currentPage
            lastPage
            hasNextPage
          }
          nodes {
            id
            title { english romaji native userPreferred }
            coverImage { extraLarge large }
            bannerImage
            episodes
            averageScore
            season
            seasonYear
            status
            isFavourite
          }
        }
      }
    }
  }
`;

const TOGGLE_FAVOURITE_MUTATION = `
  mutation ($animeId: Int) {
    ToggleFavourite(animeId: $animeId) {
      anime {
        nodes {
          id
        }
      }
    }
  }
`;

interface AniListPageInfo {
  total?: number | null;
  perPage?: number | null;
  currentPage?: number | null;
  lastPage?: number | null;
  hasNextPage?: boolean | null;
}

interface AniListFavouriteRaw {
  id?: number | null;
  title?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  } | null;
  coverImage?: { extraLarge?: string | null; large?: string | null } | null;
  bannerImage?: string | null;
  episodes?: number | null;
  averageScore?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
  isFavourite?: boolean | null;
}

function mapFavourite(raw: AniListFavouriteRaw): AniListFavouriteMedia | null {
  if (!Number.isInteger(raw.id) || raw.id <= 0) return null;
  return {
    id: raw.id,
    title: raw.title ?? null,
    coverImage: raw.coverImage ?? null,
    bannerImage: raw.bannerImage ?? null,
    episodes: raw.episodes ?? null,
    averageScore: raw.averageScore ?? null,
    season: raw.season ?? null,
    seasonYear: raw.seasonYear ?? null,
    status: raw.status ?? null,
    isFavourite: raw.isFavourite ?? true,
  };
}

export async function fetchAniListFavourites(
  page = 1,
  perPage = 50
): Promise<{ media: AniListFavouriteMedia[]; pageInfo: AniListPageInfo }> {
  const data = await postAniListAuthedGraphql<{
    Viewer?: {
      favourites?: {
        anime?: {
          pageInfo?: AniListPageInfo;
          nodes?: (AniListFavouriteRaw | null)[] | null;
        } | null;
      } | null;
    } | null;
  }>(FAVOURITES_QUERY, { page, perPage });

  const animeConnection = data.Viewer?.favourites?.anime;
  const pageInfo = animeConnection?.pageInfo ?? {};
  const media = (animeConnection?.nodes ?? [])
    .filter((m): m is AniListFavouriteRaw => m != null)
    .map(mapFavourite)
    .filter((m): m is AniListFavouriteMedia => m != null);

  return { media, pageInfo };
}

export async function toggleAniListFavourite(mediaId: number): Promise<boolean> {
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new Error("Invalid AniList media id.");
  }
  const data = await postAniListAuthedGraphql<{
    ToggleFavourite?: {
      anime?: { nodes?: Array<{ id?: number | null } | null> | null } | null;
    } | null;
  }>(TOGGLE_FAVOURITE_MUTATION, { animeId: mediaId });

  const nodes = data.ToggleFavourite?.anime?.nodes ?? [];
  return nodes.some((node) => node?.id === mediaId);
}
