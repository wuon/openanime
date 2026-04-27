import { ipcMain } from "electron";

import * as ANILIST_CHANNELS from "./anilist/anilist-channels";
import { addAniListListeners } from "./anilist/anilist-listeners";
import * as APP_CHANNELS from "./app/app-channels";
import { addAppEventListeners } from "./app/app-listeners";
import * as EXTERNAL_CHANNELS from "./external/external-channels";
import { addExternalEventListeners } from "./external/external-listeners";
import * as RECENTLY_WATCHED_CHANNELS from "./recently-watched/recently-watched-channels";
import { addRecentlyWatchedListeners } from "./recently-watched/recently-watched-listeners";
import * as STREAM_PROVIDER_CHANNELS from "./stream-provider/stream-provider-channels";
import { addStreamProviderListeners } from "./stream-provider/stream-provider-listeners";
import * as THEME_CHANNELS from "./theme/theme-channels";
import { addThemeEventListeners } from "./theme/theme-listeners";
import * as WINDOW_CHANNELS from "./window/window-channels";
import { addWindowEventListeners } from "./window/window-listeners";

export function registerListeners() {
  addThemeEventListeners();
  addStreamProviderListeners();
  addAniListListeners();
  addRecentlyWatchedListeners();
  addExternalEventListeners();
  addAppEventListeners();
  addWindowEventListeners();
}

export function unregisterListeners() {
  const allListeners = [
    ...Object.values(ANILIST_CHANNELS),
    ...Object.values(STREAM_PROVIDER_CHANNELS),
    ...Object.values(WINDOW_CHANNELS),
    ...Object.values(EXTERNAL_CHANNELS),
    ...Object.values(RECENTLY_WATCHED_CHANNELS),
    ...Object.values(APP_CHANNELS),
    ...Object.values(THEME_CHANNELS),
  ];

  allListeners.forEach((channel: string) => {
    ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(channel);
  });
}
