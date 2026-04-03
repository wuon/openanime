/**
 * Anime search using the same allanime GraphQL API as pystardust/ani-cli.
 * See https://github.com/pystardust/ani-cli (search_anime function).
 */

const ALLANIME_REFERER = "https://allmanga.to";
const ALLANIME_API = "https://api.allanime.day";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";

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
  mode: "sub" | "dub" = "sub"
): Promise<string[]> {
  const variables = { showId: providerId };
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

export async function getShowDetails(providerId: string): Promise<ShowDetails> {
  const variables = { showId: providerId };
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
    id: show.aniListId ?? "",
    providerId: show._id,
    name: (show.name ?? "").replace(/\\"/g, '"'),
    thumbnail: show.thumbnail ?? null,
    type: show.type ?? "TV",
    description: show.description ?? null,
  };
}
