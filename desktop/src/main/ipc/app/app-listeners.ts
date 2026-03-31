import { app, ipcMain } from "electron";
import { platform as nodePlatform } from "node:os";

import { APP_CHECK_FOR_UPDATE_CHANNEL, APP_OS_CHANNEL, APP_VERSION_CHANNEL } from "./app-channels";
import { checkGitHubReleaseVsCurrent } from "./check-for-update";

export function addAppEventListeners() {
  ipcMain.handle(APP_VERSION_CHANNEL, () => app.getVersion());
  ipcMain.handle(APP_OS_CHANNEL, () => nodePlatform());
  ipcMain.handle(APP_CHECK_FOR_UPDATE_CHANNEL, () => checkGitHubReleaseVsCurrent());
}
