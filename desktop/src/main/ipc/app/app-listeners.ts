import { app, ipcMain } from "electron";
import { platform as nodePlatform } from "node:os";

import { isWindowsGitBashAvailable } from "../ani-cli/ani-cli-stream";
import { checkGitHubReleaseVsCurrent } from "./check-for-update";
import {
  APP_CHECK_FOR_UPDATE_CHANNEL,
  APP_DEPENDENCIES_REQUIRED_CHANNEL,
  APP_OS_CHANNEL,
  APP_VERSION_CHANNEL,
} from "./app-channels";

function areDependenciesMissing(): boolean {
  if (process.platform !== "win32") return false;
  return !isWindowsGitBashAvailable();
}

export function addAppEventListeners() {
  ipcMain.handle(APP_VERSION_CHANNEL, () => app.getVersion());
  ipcMain.handle(APP_OS_CHANNEL, () => nodePlatform());
  ipcMain.handle(APP_DEPENDENCIES_REQUIRED_CHANNEL, () => areDependenciesMissing());
  ipcMain.handle(APP_CHECK_FOR_UPDATE_CHANNEL, () => checkGitHubReleaseVsCurrent());
}
