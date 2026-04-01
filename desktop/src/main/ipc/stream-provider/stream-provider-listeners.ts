import {
  getEpisodesList,
  getRecentAnime,
  getShowDetails,
  searchAnime,
} from "@/main/ipc/stream-provider/stream-provider-search";
import { getStreamProxyBaseUrl } from "@/main/stream-proxy";
import { ipcMain } from "electron";

import {
  STREAM_PROVIDER_EPISODES_CHANNEL,
  STREAM_PROVIDER_RECENT_CHANNEL,
  STREAM_PROVIDER_SEARCH_CHANNEL,
  STREAM_PROVIDER_SHOW_DETAILS_CHANNEL,
  STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL,
  STREAM_PROVIDER_STREAM_URL_CHANNEL,
} from "./stream-provider-channels";
import { getStreamUrl } from "./stream-provider-stream";

export function addStreamProviderListeners() {
  ipcMain.handle(STREAM_PROVIDER_SEARCH_CHANNEL, (_event, query: string) => searchAnime(query));
  ipcMain.handle(
    STREAM_PROVIDER_EPISODES_CHANNEL,
    (_event, providerId: string, mode: "sub" | "dub") => getEpisodesList(providerId, mode)
  );
  ipcMain.handle(
    STREAM_PROVIDER_STREAM_URL_CHANNEL,
    (_event, id: string | null, providerId: string | null, episode: string, mode: "sub" | "dub") =>
      getStreamUrl(id, providerId, episode, mode)
  );
  ipcMain.handle(STREAM_PROVIDER_STREAM_PROXY_BASE_CHANNEL, () => getStreamProxyBaseUrl());
  ipcMain.handle(STREAM_PROVIDER_SHOW_DETAILS_CHANNEL, (_event, providerId: string) =>
    getShowDetails(providerId)
  );
  ipcMain.handle(STREAM_PROVIDER_RECENT_CHANNEL, (_event, page: number, limit?: number) =>
    getRecentAnime(page, limit ?? 12)
  );
}
