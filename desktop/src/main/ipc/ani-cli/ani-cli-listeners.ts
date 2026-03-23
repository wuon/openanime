import {
  getEpisodesList,
  getRecentAnime,
  getShowDetails,
  searchAnime,
} from "@/main/ipc/ani-cli/ani-cli-search";
import { getStreamProxyBaseUrl } from "@/main/stream-proxy";
import { ipcMain } from "electron";

import {
  ANI_CLI_EPISODES_CHANNEL,
  ANI_CLI_RECENT_CHANNEL,
  ANI_CLI_SEARCH_CHANNEL,
  ANI_CLI_SHOW_DETAILS_CHANNEL,
  ANI_CLI_STREAM_PROXY_BASE_CHANNEL,
  ANI_CLI_STREAM_URL_CHANNEL,
} from "./ani-cli-channels";
import { getStreamUrl } from "./ani-cli-stream";

export function addAniCliListeners() {
  ipcMain.handle(ANI_CLI_SEARCH_CHANNEL, (_event, query: string) => searchAnime(query));
  ipcMain.handle(ANI_CLI_EPISODES_CHANNEL, (_event, showId: string, mode: "sub" | "dub") =>
    getEpisodesList(showId, mode)
  );
  ipcMain.handle(
    ANI_CLI_STREAM_URL_CHANNEL,
    (_event, showId: string, episode: string, mode: "sub" | "dub") =>
      getStreamUrl(showId, episode, mode)
  );
  ipcMain.handle(ANI_CLI_STREAM_PROXY_BASE_CHANNEL, () => getStreamProxyBaseUrl());
  ipcMain.handle(ANI_CLI_SHOW_DETAILS_CHANNEL, (_event, showId: string) => getShowDetails(showId));
  ipcMain.handle(ANI_CLI_RECENT_CHANNEL, (_event, page: number, limit?: number) =>
    getRecentAnime(page, limit ?? 12)
  );
}
