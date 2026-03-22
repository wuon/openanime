import { contextBridge, ipcRenderer } from "electron";

import {
  RECENTLY_WATCHED_READ_CHANNEL,
  RECENTLY_WATCHED_RECORD_CHANNEL,
} from "./recently-watched-channels";

export interface RecentlyWatchedEntry {
  animeId: string;
  episode: string;
  mode: "sub" | "dub";
}

export function exposeRecentlyWatchedContext() {
  contextBridge.exposeInMainWorld("recentlyWatched", {
    record: (animeId: string, episode: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(
        RECENTLY_WATCHED_RECORD_CHANNEL,
        animeId,
        episode,
        mode ?? "sub"
      ) as Promise<void>,
    read: () =>
      ipcRenderer.invoke(RECENTLY_WATCHED_READ_CHANNEL) as Promise<
        RecentlyWatchedEntry[]
      >,
  });
}
