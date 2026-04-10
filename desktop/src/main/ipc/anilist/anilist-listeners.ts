import { ipcMain } from "electron";

import type { AniListMediaPageVariables } from "@/shared/types";

import {
  ANILIST_CONNECT_CHANNEL,
  ANILIST_DISCONNECT_CHANNEL,
  ANILIST_GET_STATUS_CHANNEL,
  ANILIST_OPEN_PIN_AUTH_CHANNEL,
  ANILIST_POPULAR_SEASON_CHANNEL,
  ANILIST_SEARCH_CHANNEL,
  ANILIST_SHOW_DETAILS_CHANNEL,
  ANILIST_SUBMIT_MANUAL_TOKEN_CHANNEL,
} from "./anilist-channels";
import {
  clearAniListAccessToken,
  connectAniListAccount,
  getAniListIntegrationStatus,
  openAniListPinAuthInBrowser,
  submitAniListManualToken,
} from "./anilist-oauth";
import { getAniListPopularSeasonAnime } from "./anilist-popular-season";
import { searchAniListMedia } from "./anilist-search";
import { getAniListShowDetails } from "./anilist-show-details";

export function addAniListListeners() {
  ipcMain.handle(ANILIST_SHOW_DETAILS_CHANNEL, (_event, mediaId: number) =>
    getAniListShowDetails(mediaId)
  );
  ipcMain.handle(ANILIST_SEARCH_CHANNEL, (_event, variables: AniListMediaPageVariables) =>
    searchAniListMedia(variables)
  );
  ipcMain.handle(ANILIST_POPULAR_SEASON_CHANNEL, () => getAniListPopularSeasonAnime());

  ipcMain.handle(ANILIST_CONNECT_CHANNEL, () => connectAniListAccount());

  ipcMain.handle(ANILIST_DISCONNECT_CHANNEL, () => clearAniListAccessToken());

  ipcMain.handle(ANILIST_OPEN_PIN_AUTH_CHANNEL, () => openAniListPinAuthInBrowser());

  ipcMain.handle(ANILIST_SUBMIT_MANUAL_TOKEN_CHANNEL, (_event, rawToken: unknown) =>
    submitAniListManualToken(rawToken)
  );

  ipcMain.handle(ANILIST_GET_STATUS_CHANNEL, () => getAniListIntegrationStatus());
}
