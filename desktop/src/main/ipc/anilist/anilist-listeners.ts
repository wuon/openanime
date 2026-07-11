import { ipcMain } from "electron";

import type {
  AniListMediaListStatus,
  AniListMediaPageVariables,
  AniListSaveListEntryInput,
  AniListSyncWatchProgressInput,
} from "@/shared/types";

import {
  ANILIST_CONNECT_CHANNEL,
  ANILIST_DELETE_LIST_ENTRY_CHANNEL,
  ANILIST_DISCONNECT_CHANNEL,
  ANILIST_GET_FAVOURITES_CHANNEL,
  ANILIST_GET_MEDIA_LIST_CHANNEL,
  ANILIST_GET_STATUS_CHANNEL,
  ANILIST_OPEN_PIN_AUTH_CHANNEL,
  ANILIST_POPULAR_SEASON_CHANNEL,
  ANILIST_SAVE_LIST_ENTRY_CHANNEL,
  ANILIST_SEARCH_CHANNEL,
  ANILIST_SHOW_DETAILS_CHANNEL,
  ANILIST_SUBMIT_MANUAL_TOKEN_CHANNEL,
  ANILIST_SYNC_WATCH_PROGRESS_CHANNEL,
  ANILIST_TOGGLE_FAVOURITE_CHANNEL,
} from "./anilist-channels";
import { fetchAniListFavourites, toggleAniListFavourite } from "./anilist-favourites";
import {
  deleteAniListMediaListEntry,
  fetchAniListMediaList,
  saveAniListMediaListEntry,
  syncAniListWatchProgress,
} from "./anilist-list";
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

  ipcMain.handle(
    ANILIST_GET_MEDIA_LIST_CHANNEL,
    (_event, status: AniListMediaListStatus, page?: number) =>
      fetchAniListMediaList(status, page ?? 1)
  );

  ipcMain.handle(ANILIST_GET_FAVOURITES_CHANNEL, (_event, page?: number) =>
    fetchAniListFavourites(page ?? 1)
  );

  ipcMain.handle(ANILIST_SAVE_LIST_ENTRY_CHANNEL, (_event, input: AniListSaveListEntryInput) =>
    saveAniListMediaListEntry(input)
  );

  ipcMain.handle(ANILIST_DELETE_LIST_ENTRY_CHANNEL, (_event, listEntryId: number) =>
    deleteAniListMediaListEntry(listEntryId)
  );

  ipcMain.handle(ANILIST_TOGGLE_FAVOURITE_CHANNEL, (_event, mediaId: number) =>
    toggleAniListFavourite(mediaId)
  );

  ipcMain.handle(
    ANILIST_SYNC_WATCH_PROGRESS_CHANNEL,
    (_event, input: AniListSyncWatchProgressInput) => syncAniListWatchProgress(input)
  );
}
