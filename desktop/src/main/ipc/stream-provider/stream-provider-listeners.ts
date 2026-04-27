import { ipcMain } from "electron";

import { getEpisodesList, getShowDetails } from "@/main/ipc/stream-provider/stream-provider-search";
import { appStore } from "@/main/store";
import {
  getStreamProxyBaseUrl,
  getTranscodeProgress,
  prepareTranscodedStream,
} from "@/main/stream-proxy";

import {
  STREAM_PROVIDER_ACTIVE_GET_CHANNEL,
  STREAM_PROVIDER_ACTIVE_SET_CHANNEL,
  STREAM_PROVIDER_EPISODES_CHANNEL,
  STREAM_PROVIDER_PREPARE_TRANSCODE_CHANNEL,
  STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL,
  STREAM_PROVIDER_SEARCH_CHANNEL,
  STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
  STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL,
  STREAM_PROVIDER_STREAM_URL_CHANNEL,
  STREAM_PROVIDER_TRANSCODE_PROGRESS_CHANNEL,
} from "./stream-provider-channels";
import { StreamProviderName, streamProviders } from "./stream-providers/stream-provider";

const DEFAULT_STREAM_PROVIDER: StreamProviderName = "animepahe";

function normalizeProvider(value: unknown): StreamProviderName {
  return value === "allanime" ? "allanime" : "animepahe";
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
    (
      _event,
      providerId: string,
      mode: "sub" | "dub",
      providerOverride?: StreamProviderName
    ) => {
      const providerName = providerOverride
        ? normalizeProvider(providerOverride)
        : getActiveStreamProviderName();
      return getEpisodesList(providerId, providerName, mode);
    }
  );
  ipcMain.handle(
    STREAM_PROVIDER_STREAM_URL_CHANNEL,
    (
      _event,
      id: string | null,
      providerId: string | null,
      episode: string,
      mode: "sub" | "dub",
      providerOverride?: StreamProviderName
    ) => {
      const providerName = providerOverride
        ? normalizeProvider(providerOverride)
        : getActiveStreamProviderName();
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
  ipcMain.handle(
    STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
    (_event, providerId: string, providerOverride?: StreamProviderName) => {
      const providerName = providerOverride
        ? normalizeProvider(providerOverride)
        : getActiveStreamProviderName();
      return getShowDetails(providerId, providerName);
    }
  );
  ipcMain.handle(STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL, (_event, page: number, limit?: number) => {
    const providerName = getActiveStreamProviderName();
    return streamProviders[providerName].getRecentUploads(page, limit ?? 12);
  });
  if (!appStore.get("stream.provider")) {
    appStore.set("stream.provider", DEFAULT_STREAM_PROVIDER);
  }
}
