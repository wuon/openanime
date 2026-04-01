import { contextBridge, ipcRenderer } from "electron";

import {
  STREAM_PROVIDER_EPISODES_CHANNEL,
  STREAM_PROVIDER_RECENT_CHANNEL,
  STREAM_PROVIDER_SEARCH_CHANNEL,
  STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
  STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL,
  STREAM_PROVIDER_STREAM_URL_CHANNEL,
} from "./stream-provider-channels";

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

export function exposeStreamProviderContext() {
  contextBridge.exposeInMainWorld("streamProvider", {
    search: (query: string) =>
      ipcRenderer.invoke(STREAM_PROVIDER_SEARCH_CHANNEL, query) as Promise<AnimeSearchResult[]>,
    getEpisodes: (showId: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(STREAM_PROVIDER_EPISODES_CHANNEL, showId, mode ?? "sub") as Promise<
        string[]
      >,
    getStreamUrl: (showId: string, episode: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_STREAM_URL_CHANNEL,
        showId,
        episode,
        mode ?? "sub"
      ) as Promise<StreamUrlResult>,
    getStreamProxyBaseUrl: () =>
      ipcRenderer.invoke(STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL) as Promise<string>,
    getShowDetails: (showId: string) =>
      ipcRenderer.invoke(STREAM_PROVIDER_SHOW_DETAILS_CHANNEL, showId) as Promise<{
        id: string;
        name: string;
        thumbnail: string | null;
        type: string;
        description?: string | null;
      }>,
    getRecent: (page: number, limit?: number) =>
      ipcRenderer.invoke(STREAM_PROVIDER_RECENT_CHANNEL, page, limit) as Promise<{
        items: AnimeSearchResult[];
        hasMore: boolean;
      }>,
  });
}
