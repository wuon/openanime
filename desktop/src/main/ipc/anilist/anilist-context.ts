import { contextBridge, ipcRenderer } from "electron";

import type { AniListMediaPageResult, AniListMediaPageVariables, AniListShowDetails } from "@/shared/types";

import {
  ANILIST_POPULAR_SEASON_CHANNEL,
  ANILIST_SEARCH_CHANNEL,
  ANILIST_SHOW_DETAILS_CHANNEL,
} from "./anilist-channels";

export function exposeAniListContext() {
  contextBridge.exposeInMainWorld("anilist", {
    getShowDetails: (mediaId: number) =>
      ipcRenderer.invoke(ANILIST_SHOW_DETAILS_CHANNEL, mediaId) as Promise<AniListShowDetails>,
    search: (variables: AniListMediaPageVariables) =>
      ipcRenderer.invoke(ANILIST_SEARCH_CHANNEL, variables) as Promise<AniListMediaPageResult>,
    getPopularSeason: () =>
      ipcRenderer.invoke(ANILIST_POPULAR_SEASON_CHANNEL) as Promise<AniListShowDetails[]>,
  });
}
