import type { AniListShowDetails } from "@/shared/types";

import { fetchAniListMediaPage } from "./anilist-media-page";

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
  const { media } = await fetchAniListMediaPage({
    page: 1,
    type: "ANIME",
    status: "RELEASING",
    seasonYear,
    season,
    sort: ["POPULARITY_DESC"],
  });
  return media;
}
