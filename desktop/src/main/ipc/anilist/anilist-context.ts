import { contextBridge, ipcRenderer } from "electron";

import type {
  AniListFavouritesPageResult,
  AniListIntegrationStatus,
  AniListListEntry,
  AniListListPageResult,
  AniListMediaListStatus,
  AniListMediaPageResult,
  AniListMediaPageVariables,
  AniListSaveListEntryInput,
  AniListShowDetails,
  AniListSyncWatchProgressInput,
} from "@/shared/types";

import {
  ANILIST_CONNECT_CHANNEL,
  ANILIST_DELETE_LIST_ENTRY_CHANNEL,
  ANILIST_DISCONNECT_CHANNEL,
  ANILIST_GET_FAVOURITES_CHANNEL,
  ANILIST_GET_MEDIA_LIST_CHANNEL,
  ANILIST_GET_STATUS_CHANNEL,
  ANILIST_OPEN_PIN_AUTH_CHANNEL,
  ANILIST_POPULAR_SEASON_CHANNEL,
  ANILIST_SAVE_LIST_ENTRY_CHANNEL,
  ANILIST_SEARCH_CHANNEL,
  ANILIST_SHOW_DETAILS_CHANNEL,
  ANILIST_SUBMIT_MANUAL_TOKEN_CHANNEL,
  ANILIST_SYNC_WATCH_PROGRESS_CHANNEL,
  ANILIST_TOGGLE_FAVOURITE_CHANNEL,
} from "./anilist-channels";

export function exposeAniListContext() {
  contextBridge.exposeInMainWorld("anilist", {
    getShowDetails: (mediaId: number) =>
      ipcRenderer.invoke(ANILIST_SHOW_DETAILS_CHANNEL, mediaId) as Promise<AniListShowDetails>,
    search: (variables: AniListMediaPageVariables) =>
      ipcRenderer.invoke(ANILIST_SEARCH_CHANNEL, variables) as Promise<AniListMediaPageResult>,
    getPopularSeason: () =>
      ipcRenderer.invoke(ANILIST_POPULAR_SEASON_CHANNEL) as Promise<AniListShowDetails[]>,

    connect: () =>
      ipcRenderer.invoke(ANILIST_CONNECT_CHANNEL) as Promise<{ ok: true } | { ok: false; error: string }>,
    disconnect: () => ipcRenderer.invoke(ANILIST_DISCONNECT_CHANNEL) as Promise<void>,
    getStatus: () =>
      ipcRenderer.invoke(ANILIST_GET_STATUS_CHANNEL) as Promise<AniListIntegrationStatus>,
    openPinAuthPage: () => ipcRenderer.invoke(ANILIST_OPEN_PIN_AUTH_CHANNEL) as Promise<void>,
    submitManualToken: (token: string) =>
      ipcRenderer.invoke(ANILIST_SUBMIT_MANUAL_TOKEN_CHANNEL, token) as Promise<
        { ok: true } | { ok: false; error: string }
      >,

    getMediaList: (status: AniListMediaListStatus, page?: number) =>
      ipcRenderer.invoke(ANILIST_GET_MEDIA_LIST_CHANNEL, status, page) as Promise<AniListListPageResult>,
    getFavourites: (page?: number) =>
      ipcRenderer.invoke(ANILIST_GET_FAVOURITES_CHANNEL, page) as Promise<AniListFavouritesPageResult>,
    saveListEntry: (input: AniListSaveListEntryInput) =>
      ipcRenderer.invoke(ANILIST_SAVE_LIST_ENTRY_CHANNEL, input) as Promise<AniListListEntry>,
    deleteListEntry: (listEntryId: number) =>
      ipcRenderer.invoke(ANILIST_DELETE_LIST_ENTRY_CHANNEL, listEntryId) as Promise<void>,
    toggleFavourite: (mediaId: number) =>
      ipcRenderer.invoke(ANILIST_TOGGLE_FAVOURITE_CHANNEL, mediaId) as Promise<boolean>,
    syncWatchProgress: (input: AniListSyncWatchProgressInput) =>
      ipcRenderer.invoke(ANILIST_SYNC_WATCH_PROGRESS_CHANNEL, input) as Promise<AniListListEntry | null>,
  });
}
