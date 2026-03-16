/**
 * Typed bridge to window.aniCli (exposed via preload).
 * Use this in renderer code so TypeScript and ESLint see the correct types.
 */
export function getAniCli(): AniCliContext {
  return (window as Window & { aniCli: AniCliContext }).aniCli;
}

interface AnimeSearchResult {
  id: string;
  name: string;
  episodeCount: number;
  mode: "sub" | "dub";
}

interface StreamUrlResult {
  url: string;
  referer: string;
}

interface ShowDetails {
  id: string;
  name: string;
  thumbnail: string | null;
  type: string;
}

interface AniCliContext {
  search: (query: string) => Promise<AnimeSearchResult[]>;
  getEpisodes: (showId: string, mode?: "sub" | "dub") => Promise<string[]>;
  getStreamUrl: (
    animeName: string,
    episode: string,
    mode?: "sub" | "dub",
    selectIndex?: number
  ) => Promise<StreamUrlResult>;
  getStreamProxyBaseUrl: () => Promise<string>;
  getShowDetails: (showId: string) => Promise<ShowDetails>;
  getRecent: (page: number, limit?: number) => Promise<{
    items: AnimeSearchResult[];
    hasMore: boolean;
  }>;
}

export type { AnimeSearchResult, AniCliContext, ShowDetails, StreamUrlResult };
