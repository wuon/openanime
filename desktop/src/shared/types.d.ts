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

export interface AniListShowDetails {
  id?: number;
  streamingEpisodes?: Array<{
    thumbnail?: string | null;
    title?: string | null;
  }> | null;
  bannerImage?: string | null;
  coverImage?: {
    extraLarge?: string | null;
    large?: string | null;
    medium?: string | null;
    color?: string | null;
  } | null;
  description?: string | null;
  title?: {
    english?: string | null;
    romaji?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  } | null;
  duration?: number | null;
  episodes?: number | null;
  averageScore?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  status?: string | null;
  type?: string | null;
  format?: string | null;
  genres?: string[] | null;
  isAdult?: boolean | null;
  popularity?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  startDate?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
  } | null;
  endDate?: {
    year?: number | null;
    month?: number | null;
    day?: number | null;
  } | null;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
  mediaListEntry?: {
    id: number;
    status: string;
  } | null;
  studios?: Array<{
    isMain?: boolean | null;
    node: { id: number; name: string };
  }>;
}

export interface AniListMediaPageVariables {
  page?: number;
  id?: number;
  type?: string;
  isAdult?: boolean;
  search?: string;
  format?: string[];
  status?: string;
  countryOfOrigin?: string;
  source?: string;
  season?: string;
  seasonYear?: number;
  year?: string;
  onList?: boolean;
  yearLesser?: number;
  yearGreater?: number;
  episodeLesser?: number;
  episodeGreater?: number;
  durationLesser?: number;
  durationGreater?: number;
  chapterLesser?: number;
  chapterGreater?: number;
  volumeLesser?: number;
  volumeGreater?: number;
  licensedBy?: number[];
  isLicensed?: boolean;
  genres?: string[];
  excludedGenres?: string[];
  tags?: string[];
  excludedTags?: string[];
  minimumTagRank?: number;
  /** GraphQL expects `[MediaSort]`; a single string is normalized to a one-element array. */
  sort?: string[] | string;
}

export interface AniListMediaPageResult {
  pageInfo: {
    total?: number | null;
    perPage?: number | null;
    currentPage?: number | null;
    lastPage?: number | null;
    hasNextPage?: boolean | null;
  };
  media: AniListShowDetails[];
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
  remove: (id: string) => Promise<void>;
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
  search: (variables: AniListMediaPageVariables) => Promise<AniListMediaPageResult>;
  getPopularSeason: () => Promise<AniListShowDetails[]>;
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
