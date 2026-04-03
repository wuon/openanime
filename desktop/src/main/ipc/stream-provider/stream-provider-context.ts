import { contextBridge, ipcRenderer } from "electron";

import {
  STREAM_PROVIDER_EPISODES_CHANNEL,
  STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL,
  STREAM_PROVIDER_SEARCH_CHANNEL,
  STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
  STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL,
  STREAM_PROVIDER_STREAM_URL_CHANNEL,
} from "./stream-provider-channels";
import { Episode, ShowSearchResult } from "@/shared/types";

export interface StreamUrlResult {
  url: string;
  referer: string;
}

export function exposeStreamProviderContext() {
  contextBridge.exposeInMainWorld("streamProvider", {
    search: (query: string) =>
      ipcRenderer.invoke(STREAM_PROVIDER_SEARCH_CHANNEL, query) as Promise<ShowSearchResult[]>,
    getEpisodes: (providerId: string, mode?: "sub" | "dub") =>
      ipcRenderer.invoke(STREAM_PROVIDER_EPISODES_CHANNEL, providerId, mode ?? "sub") as Promise<
        string[]
      >,
    getStreamUrl: (
      id: string | null,
      providerId: string | null,
      episode: string,
      mode?: "sub" | "dub"
    ) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_STREAM_URL_CHANNEL,
        id,
        providerId,
        episode,
        mode ?? "sub"
      ) as Promise<StreamUrlResult>,
    getStreamProxyBaseUrl: () =>
      ipcRenderer.invoke(STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL) as Promise<string>,
    getShowDetails: (providerId: string) =>
      ipcRenderer.invoke(STREAM_PROVIDER_SHOW_DETAILS_CHANNEL, providerId) as Promise<{
        id: string;
        providerId: string;
        name: string;
        thumbnail: string | null;
        type: string;
        description?: string | null;
      }>,
    getRecentUploads: (page: number, limit?: number) =>
      ipcRenderer.invoke(STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL, page, limit) as Promise<Episode[]>,
  });
}
