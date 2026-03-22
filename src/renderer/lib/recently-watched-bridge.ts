/**
 * Typed bridge to window.recentlyWatched (exposed via preload).
 */

export interface RecentlyWatchedEntry {
  animeId: string;
  episode: string;
  mode: "sub" | "dub";
}

export interface RecentlyWatchedContext {
  record: (animeId: string, episode: string, mode?: "sub" | "dub") => Promise<void>;
  read: () => Promise<RecentlyWatchedEntry[]>;
}

export function getRecentlyWatched(): RecentlyWatchedContext {
  return (window as Window & { recentlyWatched: RecentlyWatchedContext })
    .recentlyWatched;
}
