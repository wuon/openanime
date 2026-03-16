interface ThemeContext {
  toggle: () => Promise<boolean>;
  dark: () => Promise<void>;
  light: () => Promise<void>;
  system: () => Promise<boolean>;
  current: () => Promise<"dark" | "light" | "system">;
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

export interface UrlOpenerContext {
  openGithub: (url: string) => Promise<void>;
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
}

declare global {
  interface Window {
    theme: ThemeContext;
    aniCli: AniCliContext;
    urlOpener: UrlOpenerContext;
  }
}
