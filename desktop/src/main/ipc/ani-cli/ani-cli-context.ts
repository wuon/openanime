import { contextBridge, ipcRenderer } from "electron";

import {
  ANI_CLI_EPISODES_CHANNEL,
  ANI_CLI_RECENT_CHANNEL,
  ANI_CLI_SEARCH_CHANNEL,
  ANI_CLI_SHOW_DETAILS_CHANNEL,
  ANI_CLI_STREAM_PROXY_BASE_CHANNEL,
  ANI_CLI_STREAM_URL_CHANNEL,
} from "./ani-cli-channels";

export interface AnimeSearchResult {
  id: string;
  name: string;
  episodeCount: number;
  mode: "sub" | "dub";
  hasSub?: boolean;
  hasDub?: boolean;
}

export interface StreamUrlResult {
  url: string;
  referer: string;
}

export function exposeAniCliContext() {
  contextBridge.exposeInMainWorld("aniCli", {
    search: (query: string) =>
      ipcRenderer.invoke(ANI_CLI_SEARCH_CHANNEL, query) as Promise<AnimeSearchResult[]>,
    getEpisodes: (showId: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(ANI_CLI_EPISODES_CHANNEL, showId, mode ?? "sub") as Promise<string[]>,
    getStreamUrl: (showId: string, episode: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(
        ANI_CLI_STREAM_URL_CHANNEL,
        showId,
        episode,
        mode ?? "sub"
      ) as Promise<StreamUrlResult>,
    getStreamProxyBaseUrl: () =>
      ipcRenderer.invoke(ANI_CLI_STREAM_PROXY_BASE_CHANNEL) as Promise<string>,
    getShowDetails: (showId: string) =>
      ipcRenderer.invoke(ANI_CLI_SHOW_DETAILS_CHANNEL, showId) as Promise<{
        id: string;
        name: string;
        thumbnail: string | null;
        type: string;
        description?: string | null;
      }>,
    getRecent: (page: number, limit?: number) =>
      ipcRenderer.invoke(ANI_CLI_RECENT_CHANNEL, page, limit) as Promise<{
        items: AnimeSearchResult[];
        hasMore: boolean;
      }>,
  });
}
