/**
 * Anime search using the same allanime GraphQL API as pystardust/ani-cli.
 * See https://github.com/pystardust/ani-cli (search_anime function).
 */

const ALLANIME_REFERER = "https://allmanga.to";
const ALLANIME_API = "https://api.allanime.day";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";

const SEARCH_GQL = `query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }`;

export interface AnimeSearchResult {
  id: string;
  name: string;
  episodeCount: number;
  /** "sub" | "dub" - which mode was used for episode count */
  mode: "sub" | "dub";
  hasSub?: boolean;
  hasDub?: boolean;
}

interface GqlShowEdge {
  _id: string;
  name: string;
  availableEpisodes?: {
    sub?: string[] | number;
    dub?: string[] | number;
  };
}

interface GqlShowsResponse {
  data?: {
    shows?: {
      edges?: GqlShowEdge[];
    };
  };
}

function getEpisodeCount(edge: GqlShowEdge, mode: "sub" | "dub"): number {
  const ep = edge.availableEpisodes?.[mode];
  if (ep == null) return 0;
  if (Array.isArray(ep)) return ep.length;
  if (typeof ep === "number") return ep;
  return 0;
}

function hasEpisodes(edge: GqlShowEdge, mode: "sub" | "dub"): boolean {
  return getEpisodeCount(edge, mode) > 0;
}

export async function searchAnime(
  query: string,
  options: { mode?: "sub" | "dub"; limit?: number } = {}
): Promise<AnimeSearchResult[]> {
  const mode = options.mode ?? "sub";
  const limit = options.limit ?? 40;
  const searchQuery = query.trim().replace(/\s+/g, "+");

  const variables = {
    search: {
      allowAdult: false,
      allowUnknown: false,
      query: searchQuery,
    },
    limit,
    page: 1,
    translationType: mode,
    countryOrigin: "ALL",
  };

  const url = `${ALLANIME_API}/api?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(SEARCH_GQL)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`allanime API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GqlShowsResponse;
  const edges = json.data?.shows?.edges ?? [];

  return edges
    .map((edge) => ({
      id: edge._id,
      name: (edge.name ?? "").replace(/\\"/g, '"'),
      episodeCount: getEpisodeCount(edge, mode),
      mode,
      hasSub: hasEpisodes(edge, "sub"),
      hasDub: hasEpisodes(edge, "dub"),
    }))
    .filter((r) => r.episodeCount > 0);
}

export interface RecentAnimeResult {
  items: AnimeSearchResult[];
  hasMore: boolean;
}

/**
 * Fetch a page of recently updated/available shows.
 * Uses empty search object so the API returns a browse/list result.
 * Payload shape: {"search":{},"limit":N,"page":P,"translationType":"sub","countryOrigin":"ALL"}
 */
export async function getRecentAnime(
  page: number,
  limit = 12,
  mode: "sub" | "dub" = "sub"
): Promise<RecentAnimeResult> {
  const variables = {
    search: {},
    limit,
    page: Math.max(1, page),
    translationType: mode,
    countryOrigin: "ALL",
  };

  const url = `${ALLANIME_API}/api?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(SEARCH_GQL)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`allanime API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GqlShowsResponse;
  const edges = json.data?.shows?.edges ?? [];

  const items = edges
    .map((edge) => ({
      id: edge._id,
      name: (edge.name ?? "").replace(/\\"/g, '"'),
      episodeCount: getEpisodeCount(edge, mode),
      mode,
      hasSub: hasEpisodes(edge, "sub"),
      hasDub: hasEpisodes(edge, "dub"),
    }))
    .filter((r) => r.episodeCount > 0);

  return { items, hasMore: items.length >= limit };
}

/**
 * Fetch episode list for a show (same API as ani-cli episodes_list()).
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
  showId: string,
  mode: "sub" | "dub" = "sub"
): Promise<string[]> {
  const variables = { showId };
  const url = `${ALLANIME_API}/api?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(EPISODES_LIST_GQL)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`allanime API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GqlShowDetailResponse;
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
const SHOW_DETAILS_GQL = `query ($showId: String!) { show( _id: $showId ) { _id name thumbnail type description } }`;

interface GqlShowDetailsPayload {
  data?: {
    show?: {
      _id: string;
      name?: string;
      thumbnail?: string;
      type?: string;
      description?: string | null;
    };
  };
}

export interface ShowDetails {
  id: string;
  name: string;
  thumbnail: string | null;
  type: string;
  description?: string | null;
}

export async function getShowDetails(showId: string): Promise<ShowDetails> {
  const variables = { showId };
  const url = `${ALLANIME_API}/api?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(SHOW_DETAILS_GQL)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Referer: ALLANIME_REFERER,
      "User-Agent": USER_AGENT,
    },
  });

  if (!res.ok) {
    throw new Error(`allanime API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GqlShowDetailsPayload;
  const show = json.data?.show;
  if (!show) {
    throw new Error("Show not found");
  }
  return {
    id: show._id,
    name: (show.name ?? "").replace(/\\"/g, '"'),
    thumbnail: show.thumbnail ?? null,
    type: show.type ?? "TV",
    description: show.description ?? null,
  };
}
