import { contextBridge, ipcRenderer } from "electron";

import { Episode, ShowSearchResult } from "@/shared/types";

import {
  STREAM_PROVIDER_ACTIVE_GET_CHANNEL,
  STREAM_PROVIDER_ACTIVE_SET_CHANNEL,
  STREAM_PROVIDER_EPISODES_CHANNEL,
  STREAM_PROVIDER_PREPARE_TRANSCODE_CHANNEL,
  STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL,
  STREAM_PROVIDER_SEARCH_CHANNEL,
  STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
  STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL,
  STREAM_PROVIDER_TRANSCODE_PROGRESS_CHANNEL,
  STREAM_PROVIDER_STREAM_URL_CHANNEL,
} from "./stream-provider-channels";

export interface StreamUrlResult {
  url: string;
  referer: string;
}

export interface TranscodeProgressResult {
  state: "idle" | "running" | "done" | "error";
  progressPercent: number | null;
  message: string;
}

export type StreamProviderName = "allanime" | "animepahe";

export function exposeStreamProviderContext() {
  contextBridge.exposeInMainWorld("streamProvider", {
    getActiveProvider: () =>
      ipcRenderer.invoke(STREAM_PROVIDER_ACTIVE_GET_CHANNEL) as Promise<StreamProviderName>,
    setActiveProvider: (provider: StreamProviderName) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_ACTIVE_SET_CHANNEL,
        provider
      ) as Promise<StreamProviderName>,
    search: (query: string) =>
      ipcRenderer.invoke(STREAM_PROVIDER_SEARCH_CHANNEL, query) as Promise<ShowSearchResult[]>,
    getEpisodes: (providerId: string, mode?: "sub" | "dub", providerName?: StreamProviderName) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_EPISODES_CHANNEL,
        providerId,
        mode ?? "sub",
        providerName
      ) as Promise<string[]>,
    getStreamUrl: (
      id: string | null,
      providerId: string | null,
      episode: string,
      mode?: "sub" | "dub",
      providerName?: StreamProviderName
    ) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_STREAM_URL_CHANNEL,
        id,
        providerId,
        episode,
        mode ?? "sub",
        providerName
      ) as Promise<StreamUrlResult>,
    getStreamProxyBaseUrl: () =>
      ipcRenderer.invoke(STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL) as Promise<string>,
    prepareTranscodedStream: (targetUrl: string, referer: string | null) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_PREPARE_TRANSCODE_CHANNEL as string,
        targetUrl,
        referer
      ) as Promise<boolean>,
    getTranscodeProgress: (targetUrl: string) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_TRANSCODE_PROGRESS_CHANNEL as string,
        targetUrl
      ) as Promise<TranscodeProgressResult>,
    getShowDetails: (providerId: string, providerName?: StreamProviderName) =>
      ipcRenderer.invoke(
        STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
        providerId,
        providerName
      ) as Promise<{
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
