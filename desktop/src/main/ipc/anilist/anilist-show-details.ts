const ANILIST_GRAPHQL_API = "https://graphql.anilist.co";

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
    }
  }
`;

interface AniListGraphQlError {
  message?: string;
}

interface AniListMediaResponse {
  data?: {
    Media?: AniListShowDetails | null;
  };
  errors?: AniListGraphQlError[];
}

export interface AniListShowDetails {
  streamingEpisodes?: Array<{
    thumbnail?: string | null;
    title?: string | null;
  }> | null;
  bannerImage?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
  } | null;
  description?: string | null;
  title?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
  } | null;
  duration?: number | null;
  episodes?: number | null;
  averageScore?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
}

export async function getAniListShowDetails(mediaId: number): Promise<AniListShowDetails> {
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw new Error("Invalid AniList media id");
  }

  const res = await fetch(ANILIST_GRAPHQL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: MEDIA_QUERY,
      variables: { mediaId },
    }),
  });

  if (!res.ok) {
    throw new Error(`AniList API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as AniListMediaResponse;
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const firstError = json.errors[0]?.message ?? "AniList query failed";
    throw new Error(firstError);
  }

  const media = json.data?.Media;
  if (!media) {
    throw new Error("AniList media not found");
  }

  return media;
}
