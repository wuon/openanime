import { contextBridge, ipcRenderer } from "electron";

import type { HistoryEntry } from "@/shared/types";

import {
  RECENTLY_WATCHED_CLEAR_CHANNEL,
  RECENTLY_WATCHED_READ_CHANNEL,
  RECENTLY_WATCHED_REMOVE_CHANNEL,
  RECENTLY_WATCHED_UPSERT_CHANNEL,
} from "./recently-watched-channels";

export function exposeRecentlyWatchedContext() {
  contextBridge.exposeInMainWorld("recentlyWatched", {
    upsert: (entry: HistoryEntry) =>
      ipcRenderer.invoke(RECENTLY_WATCHED_UPSERT_CHANNEL, entry) as Promise<void>,
    read: () =>
      ipcRenderer.invoke(RECENTLY_WATCHED_READ_CHANNEL) as Promise<HistoryEntry[]>,
    clear: () =>
      ipcRenderer.invoke(RECENTLY_WATCHED_CLEAR_CHANNEL) as Promise<void>,
    remove: (id: string) =>
      ipcRenderer.invoke(RECENTLY_WATCHED_REMOVE_CHANNEL, id) as Promise<void>,
  });
}
