import { ipcMain } from "electron";

import {
  ANI_CLI_EPISODES_CHANNEL,
  ANI_CLI_SEARCH_CHANNEL,
  ANI_CLI_SHOW_DETAILS_CHANNEL,
  ANI_CLI_STREAM_PROXY_BASE_CHANNEL,
  ANI_CLI_STREAM_URL_CHANNEL,
} from "./ani-cli/ani-cli-channels";
import { addAniCliListeners } from "./ani-cli/ani-cli-listeners";
import { EXTERNAL_OPEN_GITHUB_CHANNEL } from "./external/external-channels";
import { addExternalEventListeners } from "./external/external-listeners";
import * as THEME_CHANNELS from "./theme/theme-channels";
import { addThemeEventListeners } from "./theme/theme-listeners";

export function registerListeners() {
  addThemeEventListeners();
  addAniCliListeners();
  addExternalEventListeners();
}

export function unregisterListeners() {
  const allListeners = [
    ANI_CLI_EPISODES_CHANNEL,
    ANI_CLI_SEARCH_CHANNEL,
    ANI_CLI_SHOW_DETAILS_CHANNEL,
    ANI_CLI_STREAM_PROXY_BASE_CHANNEL,
    ANI_CLI_STREAM_URL_CHANNEL,
    EXTERNAL_OPEN_GITHUB_CHANNEL,
    ...Object.values(THEME_CHANNELS),
  ];

  allListeners.forEach((channel: string) => {
    ipcMain.removeHandler(channel);
  });
}
