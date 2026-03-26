import { ipcMain } from "electron";

import {
  ANI_CLI_EPISODES_CHANNEL,
  ANI_CLI_SEARCH_CHANNEL,
  ANI_CLI_SHOW_DETAILS_CHANNEL,
  ANI_CLI_STREAM_PROXY_BASE_CHANNEL,
  ANI_CLI_STREAM_URL_CHANNEL,
} from "./ani-cli/ani-cli-channels";
import { addAniCliListeners } from "./ani-cli/ani-cli-listeners";
import { addRecentlyWatchedListeners } from "./recently-watched/recently-watched-listeners";
import { APP_VERSION_CHANNEL } from "./app/app-channels";
import { addAppEventListeners } from "./app/app-listeners";
import { EXTERNAL_OPEN_GITHUB_CHANNEL } from "./external/external-channels";
import {
  RECENTLY_WATCHED_READ_CHANNEL,
  RECENTLY_WATCHED_RECORD_CHANNEL,
} from "./recently-watched/recently-watched-channels";
import { addExternalEventListeners } from "./external/external-listeners";
import * as THEME_CHANNELS from "./theme/theme-channels";
import { addThemeEventListeners } from "./theme/theme-listeners";
import { addWindowEventListeners } from "./window/window-listeners";
import {
  WINDOW_CLOSE_CHANNEL,
  WINDOW_IS_MAXIMIZED_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
} from "./window/window-channels";

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
    ANI_CLI_EPISODES_CHANNEL,
    ANI_CLI_SEARCH_CHANNEL,
    ANI_CLI_SHOW_DETAILS_CHANNEL,
    ANI_CLI_STREAM_PROXY_BASE_CHANNEL,
    ANI_CLI_STREAM_URL_CHANNEL,
    APP_VERSION_CHANNEL,
    EXTERNAL_OPEN_GITHUB_CHANNEL,
    RECENTLY_WATCHED_READ_CHANNEL,
    RECENTLY_WATCHED_RECORD_CHANNEL,
    WINDOW_MINIMIZE_CHANNEL,
    WINDOW_CLOSE_CHANNEL,
    WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
    WINDOW_IS_MAXIMIZED_CHANNEL,
    ...Object.values(THEME_CHANNELS),
  ];

  allListeners.forEach((channel: string) => {
    ipcMain.removeHandler(channel);
  });
}
