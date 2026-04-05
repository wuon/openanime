import { AppUpdateCheckResult } from "./app-update-types";

interface ThemeContext {
  toggle: () => Promise<boolean>;
  dark: () => Promise<void>;
  light: () => Promise<void>;
  system: () => Promise<boolean>;
  current: () => Promise<"dark" | "light" | "system">;
}

type StreamMode = "sub" | "dub";

type StreamProvider = "allanime";

interface Show {
  id: string;
  providerId: string;
  name: string;
  episodeCount: number;
  mode: StreamMode;
  hasSub?: boolean;
  hasDub?: boolean;
}

interface ShowSearchResult {
  id: string;
  providerId: string;
  title: {
    english?: string;
    romanji?: string;
    native?: string;
  };
  thumbnail: string | null;
  availableEpisodes?: {
    sub?: number;
    dub?: number;
    raw?: number;
  };
  score?: number;
  status?: string;
  type?: string;
  episodeDuration?: number;
  season?: {
    quarter?: string;
    year?: number;
  };
}

interface Episode {
  id: string;
  providerId: string;
  title: {
    english?: string;
    romanji?: string;
    native?: string;
  };
  thumbnail: string | null;
  index: number;
  mode: StreamMode;
}

interface StreamUrlResult {
  url: string;
  referer: string;
}

interface ShowDetails {
  id: string;
  providerId: string;
  name: string;
  thumbnail: string | null;
  type: string;
  description?: string | null;
}

interface AniListShowDetails {
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

interface HistoryEntry {
  id: string;
  provider: StreamProvider;
  episode: Episode;
  currentDurationMs: number;
  totalDurationMs: number;
  timestamp: number;
}

interface RecentlyWatchedContext {
  upsert: (entry: HistoryEntry) => Promise<void>;
  read: () => Promise<HistoryEntry[]>;
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
  search: (query: string) => Promise<ShowSearchResult[]>;
  getEpisodes: (providerId: string, mode?: "sub" | "dub") => Promise<string[]>;
  getStreamUrl: (
    id: string | null,
    providerId: string | null,
    episode: string,
    mode?: "sub" | "dub"
  ) => Promise<StreamUrlResult>;
  getStreamProxyBaseUrl: () => Promise<string>;
  getShowDetails: (providerId: string) => Promise<ShowDetails>;
  getRecentUploads: (page: number, limit?: number) => Promise<Episode[]>;
}

interface AniListContext {
  getShowDetails: (mediaId: number) => Promise<AniListShowDetails>;
}

declare global {
  interface Window {
    app: AppContext;
    theme: ThemeContext;
    streamProvider: StreamProviderContext;
    anilist: AniListContext;
    recentlyWatched: RecentlyWatchedContext;
    windowControls: WindowControlsContext;
    urlOpener: UrlOpenerContext;
  }
}
