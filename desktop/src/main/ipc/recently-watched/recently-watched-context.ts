import { contextBridge, ipcRenderer } from "electron";

import {
  RECENTLY_WATCHED_CLEAR_CHANNEL,
  RECENTLY_WATCHED_READ_CHANNEL,
  RECENTLY_WATCHED_RECORD_CHANNEL,
} from "./recently-watched-channels";

export interface RecentlyWatchedEntry {
  id: string;
  providerId: string;
  episode: string;
  mode: "sub" | "dub";
  timestamp?: number;
}

export function exposeRecentlyWatchedContext() {
  contextBridge.exposeInMainWorld("recentlyWatched", {
    record: (id: string, providerId: string, episode: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(
        RECENTLY_WATCHED_RECORD_CHANNEL,
        id,
        providerId,
        episode,
        mode ?? "sub"
      ) as Promise<void>,
    read: () =>
      ipcRenderer.invoke(RECENTLY_WATCHED_READ_CHANNEL) as Promise<
        RecentlyWatchedEntry[]
      >,
    clear: () =>
      ipcRenderer.invoke(RECENTLY_WATCHED_CLEAR_CHANNEL) as Promise<void>,
  });
}
