import { ipcMain } from "electron";

import { getEpisodesList, getShowDetails } from "@/main/ipc/stream-provider/stream-provider-search";
import { registerStreamUpstreamHandler } from "@/main/stream-proxy-upstream";
import { appStore } from "@/main/store";
import { resolveEnabledStreamProvider } from "@/shared/stream-providers";
import {
  getStreamProxyBaseUrl,
  getTranscodeProgress,
  prepareTranscodedStream,
  cancelTranscodedStream,
} from "@/main/stream-proxy";

import {
  STREAM_PROVIDER_ACTIVE_GET_CHANNEL,
  STREAM_PROVIDER_ACTIVE_SET_CHANNEL,
  STREAM_PROVIDER_EPISODES_CHANNEL,
  STREAM_PROVIDER_PREPARE_TRANSCODE_CHANNEL,
  STREAM_PROVIDER_CANCEL_TRANSCODE_CHANNEL,
  STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL,
  STREAM_PROVIDER_SEARCH_CHANNEL,
  STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
  STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL,
  STREAM_PROVIDER_STREAM_URL_CHANNEL,
  STREAM_PROVIDER_TRANSCODE_PROGRESS_CHANNEL,
} from "./stream-provider-channels";
import { refreshAaCrypto } from "./stream-providers/allanime/allanime-gql";
import { reanimeStreamUpstreamHandler } from "./stream-providers/reanime/reanime-stream-upstream";
import { senshiStreamUpstreamHandler } from "./stream-providers/senshi/senshi-stream-upstream";
import { StreamProviderName, streamProviders } from "./stream-providers/stream-provider";

registerStreamUpstreamHandler(reanimeStreamUpstreamHandler);
registerStreamUpstreamHandler(senshiStreamUpstreamHandler);

function getActiveStreamProviderName(): StreamProviderName {
  return resolveEnabledStreamProvider(appStore.get("stream.provider"));
}

function setActiveStreamProviderName(provider: StreamProviderName): StreamProviderName {
  const resolved = resolveEnabledStreamProvider(provider);
  appStore.set("stream.provider", resolved);
  return resolved;
}

function warmAllAnimeCryptoIfActive(provider: StreamProviderName): void {
  if (provider !== "allanime") return;
  void refreshAaCrypto();
}

export function addStreamProviderListeners() {
  ipcMain.handle(STREAM_PROVIDER_ACTIVE_GET_CHANNEL, () => getActiveStreamProviderName());
  ipcMain.handle(STREAM_PROVIDER_ACTIVE_SET_CHANNEL, (_event, provider: StreamProviderName) => {
    const resolved = setActiveStreamProviderName(provider);
    warmAllAnimeCryptoIfActive(resolved);
    return resolved;
  });
  ipcMain.handle(STREAM_PROVIDER_SEARCH_CHANNEL, (_event, query: string) => {
    const providerName = getActiveStreamProviderName();
    return streamProviders[providerName].search(query);
  });
  ipcMain.handle(
    STREAM_PROVIDER_EPISODES_CHANNEL,
    (_event, providerId: string, mode: "sub" | "dub", providerOverride?: StreamProviderName) => {
      const providerName = providerOverride
        ? resolveEnabledStreamProvider(providerOverride)
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
        ? resolveEnabledStreamProvider(providerOverride)
        : getActiveStreamProviderName();
      return streamProviders[providerName].getStreamUrl(id, providerId, episode, mode);
    }
  );
  ipcMain.handle(STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL, () => getStreamProxyBaseUrl());
  ipcMain.handle(
    STREAM_PROVIDER_PREPARE_TRANSCODE_CHANNEL,
    async (_event, targetUrl: string, referer: string | null, variant?: string | null) => {
      const variantQuery =
        variant && variant.trim()
          ? `&variant=${encodeURIComponent(variant.trim())}`
          : "";
      const localProxyInputUrl = `${getStreamProxyBaseUrl()}/stream/playlist.m3u8?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer ?? "")}${variantQuery}`;
      await prepareTranscodedStream(localProxyInputUrl, targetUrl, referer, variant ?? null);
      return true;
    }
  );
  ipcMain.handle(
    STREAM_PROVIDER_CANCEL_TRANSCODE_CHANNEL,
    (_event, targetUrl: string, variant?: string | null) => {
      cancelTranscodedStream(targetUrl, variant ?? null);
      return true;
    }
  );
  ipcMain.handle(
    STREAM_PROVIDER_TRANSCODE_PROGRESS_CHANNEL,
    (_event, targetUrl: string, variant?: string | null) => {
      return getTranscodeProgress(targetUrl, variant ?? null);
    }
  );
  ipcMain.handle(
    STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
    (_event, providerId: string, providerOverride?: StreamProviderName) => {
      const providerName = providerOverride
        ? resolveEnabledStreamProvider(providerOverride)
        : getActiveStreamProviderName();
      return getShowDetails(providerId, providerName);
    }
  );
  ipcMain.handle(STREAM_PROVIDER_RECENT_UPLOADS_CHANNEL, (_event, page: number, limit?: number) => {
    const providerName = getActiveStreamProviderName();
    return streamProviders[providerName].getRecentUploads(page, limit ?? 12);
  });

  const storedProvider = appStore.get("stream.provider");
  const resolvedProvider = resolveEnabledStreamProvider(storedProvider);
  if (storedProvider !== resolvedProvider) {
    appStore.set("stream.provider", resolvedProvider);
  }
  warmAllAnimeCryptoIfActive(resolvedProvider);
}
