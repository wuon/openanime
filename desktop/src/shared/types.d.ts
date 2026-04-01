import { AppUpdateCheckResult } from "./app-update-types";

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
  hasSub?: boolean;
  hasDub?: boolean;
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
  description?: string | null;
}

interface RecentlyWatchedEntry {
  animeId: string;
  episode: string;
  mode: "sub" | "dub";
  timestamp?: number;
}

interface RecentlyWatchedContext {
  record: (animeId: string, episode: string, mode?: "sub" | "dub") => Promise<void>;
  read: () => Promise<RecentlyWatchedEntry[]>;
  clear: () => Promise<void>;
}

interface AppContext {
  version: () => Promise<string>;
  os: () => Promise<string>;
  /** True when required system dependencies are missing (e.g. Git Bash on Windows). */
  dependenciesRequired: () => Promise<boolean>;
  checkForUpdate: () => Promise<AppUpdateCheckResult>;
}

interface WindowControlsContext {
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  toggleMaximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
}

export interface UrlOpenerContext {
  openUrl: (url: string) => Promise<void>;
}

interface StreamProviderContext {
  search: (query: string) => Promise<AnimeSearchResult[]>;
  getEpisodes: (showId: string, mode?: "sub" | "dub") => Promise<string[]>;
  getStreamUrl: (showId: string, episode: string, mode?: "sub" | "dub") => Promise<StreamUrlResult>;
  getStreamProxyBaseUrl: () => Promise<string>;
  getShowDetails: (showId: string) => Promise<ShowDetails>;
  getRecent: (
    page: number,
    limit?: number
  ) => Promise<{
    items: AnimeSearchResult[];
    hasMore: boolean;
  }>;
}

declare global {
  interface Window {
    app: AppContext;
    theme: ThemeContext;
    streamProvider: StreamProviderContext;
    recentlyWatched: RecentlyWatchedContext;
    windowControls: WindowControlsContext;
    urlOpener: UrlOpenerContext;
  }
}
