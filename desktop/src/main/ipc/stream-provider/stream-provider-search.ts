/**
 * Anime search using the same allanime GraphQL API as pystardust/ani-cli.
 * See https://github.com/pystardust/ani-cli (search_anime function).
 */

import { allAnimeGql } from "./allanime-gql";
import { streamProviders, StreamProviderName } from "./stream-providers/stream-provider";

interface AnimePaheProviderBridge {
  getEpisodesList(providerId: string): Promise<string[]>;
  getShowDetails(providerId: string): Promise<ShowDetails>;
}

/**
 * Fetch episode list for a show (same API as provider episode listing).
 */
const EPISODES_LIST_GQL = `query ($showId: String!) { show( _id: $showId ) { _id availableEpisodesDetail } }`;

interface GqlShowDetailResponse {
  data?: {
    show?: {
      _id: string;
      availableEpisodesDetail?: {
        sub?: string[];
        dub?: string[];
      };
    };
  };
}

export async function getEpisodesList(
  providerId: string,
  provider: StreamProviderName,
  mode: "sub" | "dub" = "sub"
): Promise<string[]> {
  if (provider === "animepahe") {
    if (mode === "dub") {
      return [];
    }
    const animepaheProvider = streamProviders.animepahe as unknown as AnimePaheProviderBridge;
    return animepaheProvider.getEpisodesList(providerId);
  }

  const variables = { showId: providerId };
  const json = await allAnimeGql<GqlShowDetailResponse>(variables, EPISODES_LIST_GQL);
  const detail = json.data?.show?.availableEpisodesDetail?.[mode];
  if (!Array.isArray(detail)) return [];
  return [...detail].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b));
  });
}

/**
 * Fetch show details (name, thumbnail, synopsis, etc.) for the details/watch page.
 */
const SHOW_DETAILS_GQL = `query ($showId: String!) { show( _id: $showId ) { _id aniListId name thumbnail type description } }`;

interface GqlShowDetailsPayload {
  data?: {
    show?: {
      _id: string;
      aniListId?: string;
      name?: string;
      thumbnail?: string;
      type?: string;
      description?: string | null;
    };
  };
}

export interface ShowDetails {
  id: string;
  providerId: string;
  name: string;
  thumbnail: string | null;
  type: string;
  description?: string | null;
}

export async function getShowDetails(
  providerId: string,
  provider: StreamProviderName
): Promise<ShowDetails> {
  if (provider === "animepahe") {
    const animepaheProvider = streamProviders.animepahe as unknown as AnimePaheProviderBridge;
    return animepaheProvider.getShowDetails(providerId);
  }

  const variables = { showId: providerId };
  const json = await allAnimeGql<GqlShowDetailsPayload>(variables, SHOW_DETAILS_GQL);
  const show = json.data?.show;
  if (!show) {
    throw new Error("Show not found");
  }
  return {
    id: show.aniListId ?? "",
    providerId: show._id,
    name: (show.name ?? "").replace(/\\"/g, '"'),
    thumbnail: show.thumbnail ?? null,
    type: show.type ?? "TV",
    description: show.description ?? null,
  };
}
