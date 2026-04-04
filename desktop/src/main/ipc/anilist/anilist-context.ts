import { contextBridge, ipcRenderer } from "electron";

import { ANILIST_SHOW_DETAILS_CHANNEL } from "./anilist-channels";
import type { AniListShowDetails } from "./anilist-show-details";

export function exposeAniListContext() {
  contextBridge.exposeInMainWorld("anilist", {
    getShowDetails: (mediaId: number) =>
      ipcRenderer.invoke(ANILIST_SHOW_DETAILS_CHANNEL, mediaId) as Promise<AniListShowDetails>,
  });
}
