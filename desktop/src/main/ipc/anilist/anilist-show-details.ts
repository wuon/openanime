import type { AniListShowDetails } from "@/shared/types";

import { postAniListGraphql } from "./anilist-api";
import { getStoredAniListAccessToken } from "./anilist-oauth";

const MEDIA_QUERY = `
  query Media($mediaId: Int) {
    Media(id: $mediaId) {
      streamingEpisodes {
        thumbnail
        title
      }
      bannerImage
      coverImage {
        extraLarge
        large
        medium
      }
      description
      title {
        english
        romaji
        native
      }
      duration
      episodes
      averageScore
      season
      seasonYear
      status
      isFavourite
      mediaListEntry {
        id
        status
        progress
        startedAt { year month day }
        completedAt { year month day }
      }
    }
  }
`;

interface AniListMediaResponse {
  Media?: AniListShowDetails | null;
}

export type { AniListShowDetails };

export async function getAniListShowDetails(mediaId: number): Promise<AniListShowDetails> {
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new Error("Invalid AniList media id");
  }

  const token = getStoredAniListAccessToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const data = await postAniListGraphql<AniListMediaResponse>(MEDIA_QUERY, { mediaId }, headers);
  const media = data.Media;
  if (!media) {
    throw new Error("AniList media not found");
  }

  return media;
}
