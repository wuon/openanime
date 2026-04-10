import { contextBridge, ipcRenderer } from "electron";

import type {
  AniListIntegrationStatus,
  AniListMediaPageResult,
  AniListMediaPageVariables,
  AniListShowDetails,
} from "@/shared/types";

import {
  ANILIST_CONNECT_CHANNEL,
  ANILIST_DISCONNECT_CHANNEL,
  ANILIST_GET_STATUS_CHANNEL,
  ANILIST_OPEN_PIN_AUTH_CHANNEL,
  ANILIST_POPULAR_SEASON_CHANNEL,
  ANILIST_SEARCH_CHANNEL,
  ANILIST_SHOW_DETAILS_CHANNEL,
  ANILIST_SUBMIT_MANUAL_TOKEN_CHANNEL,
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
  });
}
