import { ipcMain } from "electron";

import * as ANI_CLI_CHANNELS from "./ani-cli/ani-cli-channels";
import { addAniCliListeners } from "./ani-cli/ani-cli-listeners";
import * as APP_CHANNELS from "./app/app-channels";
import { addAppEventListeners } from "./app/app-listeners";
import * as EXTERNAL_CHANNELS from "./external/external-channels";
import { addExternalEventListeners } from "./external/external-listeners";
import * as RECENTLY_WATCHED_CHANNELS from "./recently-watched/recently-watched-channels";
import { addRecentlyWatchedListeners } from "./recently-watched/recently-watched-listeners";
import * as THEME_CHANNELS from "./theme/theme-channels";
import { addThemeEventListeners } from "./theme/theme-listeners";
import * as WINDOW_CHANNELS from "./window/window-channels";
import { addWindowEventListeners } from "./window/window-listeners";

export function registerListeners() {
  addThemeEventListeners();
  addAniCliListeners();
  addRecentlyWatchedListeners();
  addExternalEventListeners();
  addAppEventListeners();
  addWindowEventListeners();
}

export function unregisterListeners() {
  const allListeners = [
    ...Object.values(ANI_CLI_CHANNELS),
    ...Object.values(WINDOW_CHANNELS),
    ...Object.values(EXTERNAL_CHANNELS),
    ...Object.values(RECENTLY_WATCHED_CHANNELS),
    ...Object.values(APP_CHANNELS),
    ...Object.values(THEME_CHANNELS),
  ];

  allListeners.forEach((channel: string) => {
    ipcMain.removeHandler(channel);
  });
}
