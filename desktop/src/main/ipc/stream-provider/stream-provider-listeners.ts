import {
  getEpisodesList,
  getShowDetails,
} from "@/main/ipc/stream-provider/stream-provider-search";
import { appStore } from "@/main/store";
import {
  getTranscodeProgress,
  getStreamProxyBaseUrl,
  prepareTranscodedStream,
} from "@/main/stream-proxy";
import { ipcMain } from "electron";

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
import { streamProviders, StreamProviderName } from "./stream-providers/stream-provider";

const DEFAULT_STREAM_PROVIDER: StreamProviderName = "allanime";

function normalizeProvider(value: unknown): StreamProviderName {
  return value === "animepahe" ? "animepahe" : "allanime";
}

function getActiveStreamProviderName(): StreamProviderName {
  return normalizeProvider(appStore.get("stream.provider"));
}

function setActiveStreamProviderName(provider: StreamProviderName): StreamProviderName {
  appStore.set("stream.provider", provider);
  return provider;
}

export function addStreamProviderListeners() {
  ipcMain.handle(STREAM_PROVIDER_ACTIVE_GET_CHANNEL, () => getActiveStreamProviderName());
  ipcMain.handle(STREAM_PROVIDER_ACTIVE_SET_CHANNEL, (_event, provider: StreamProviderName) => {
    const normalized = normalizeProvider(provider);
    return setActiveStreamProviderName(normalized);
  });
  ipcMain.handle(STREAM_PROVIDER_SEARCH_CHANNEL, (_event, query: string) => {
    const providerName = getActiveStreamProviderName();
    return streamProviders[providerName].search(query);
  });
  ipcMain.handle(
    STREAM_PROVIDER_EPISODES_CHANNEL,
    (_event, providerId: string, mode: "sub" | "dub") => {
      const providerName = getActiveStreamProviderName();
      return getEpisodesList(providerId, providerName, mode);
    }
  );
  ipcMain.handle(
    STREAM_PROVIDER_STREAM_URL_CHANNEL,
    (_event, id: string | null, providerId: string | null, episode: string, mode: "sub" | "dub") => {
      const providerName = getActiveStreamProviderName();
      return streamProviders[providerName].getStreamUrl(id, providerId, episode, mode);
    }
  );
  ipcMain.handle(STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL, () => getStreamProxyBaseUrl());
  ipcMain.handle(
    STREAM_PROVIDER_PREPARE_TRANSCODE_CHANNEL,
    async (_event, targetUrl: string, referer: string | null) => {
      const localProxyInputUrl = `${getStreamProxyBaseUrl()}/stream?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer ?? "")}`;
      await prepareTranscodedStream(localProxyInputUrl, targetUrl, referer);
      return true;
    }
  );
  ipcMain.handle(STREAM_PROVIDER_TRANSCODE_PROGRESS_CHANNEL, (_event, targetUrl: string) => {
    return getTranscodeProgress(targetUrl);
  });
  ipcMain.handle(STREAM_PROVIDER_SHOW_DETAILS_CHANNEL, (_event, providerId: string) => {
    const providerName = getActiveStreamProviderName();
    return getShowDetails(providerId, providerName);
  });
  ipcMain.handle(STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL, (_event, page: number, limit?: number) => {
    const providerName = getActiveStreamProviderName();
    return streamProviders[providerName].getRecentUploads(page, limit ?? 12);
  });
  if (!appStore.get("stream.provider")) {
    appStore.set("stream.provider", DEFAULT_STREAM_PROVIDER);
  }
}
