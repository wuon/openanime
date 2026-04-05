import type { AniListShowDetails } from "@/shared/types";

import { fetchAniListMediaPage } from "./anilist-media-page";

const POPULAR_SEASON_CACHE_TTL_MS = 60 * 60 * 1000;

type PopularSeasonCacheEntry = {
  seasonKey: string;
  fetchedAt: number;
  data: AniListShowDetails[];
};

let popularSeasonCache: PopularSeasonCacheEntry | null = null;

/** AniList season year for winter is the calendar year that contains January of that cour. */
export function getCurrentAnimeSeason(date = new Date()): { season: string; seasonYear: number } {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month === 12 || month === 1 || month === 2) {
    return { season: "WINTER", seasonYear: month === 12 ? year + 1 : year };
  }
  if (month >= 3 && month <= 5) {
    return { season: "SPRING", seasonYear: year };
  }
  if (month >= 6 && month <= 8) {
    return { season: "SUMMER", seasonYear: year };
  }
  return { season: "FALL", seasonYear: year };
}

export async function getAniListPopularSeasonAnime(): Promise<AniListShowDetails[]> {
  const { season, seasonYear } = getCurrentAnimeSeason();
  const seasonKey = `${season}-${seasonYear}`;
  const now = Date.now();

  if (
    popularSeasonCache &&
    popularSeasonCache.seasonKey === seasonKey &&
    now - popularSeasonCache.fetchedAt < POPULAR_SEASON_CACHE_TTL_MS
  ) {
    return popularSeasonCache.data;
  }

  const { media } = await fetchAniListMediaPage({
    page: 1,
    type: "ANIME",
    status: "RELEASING",
    seasonYear,
    season,
    sort: ["POPULARITY_DESC"],
  });

  popularSeasonCache = { seasonKey, fetchedAt: now, data: media };
  return media;
}
