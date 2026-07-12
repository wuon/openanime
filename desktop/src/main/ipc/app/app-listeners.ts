import { app, ipcMain } from "electron";
import { platform as nodePlatform } from "node:os";

import { openLogsDirectory } from "@/main/logger";

import {
  APP_CHECK_FOR_UPDATE_CHANNEL,
  APP_LIST_GITHUB_ISSUES_CHANNEL,
  APP_LIST_PINNED_GITHUB_ISSUES_CHANNEL,
  APP_OPEN_LOGS_DIRECTORY_CHANNEL,
  APP_OS_CHANNEL,
  APP_VERSION_CHANNEL,
} from "./app-channels";
import { checkGitHubReleaseVsCurrent } from "./check-for-update";
import { listGitHubIssues } from "./list-github-issues";
import {
  listPinnedGitHubIssues,
  prefetchPinnedGitHubIssues,
} from "./list-pinned-github-issues";

export function addAppEventListeners() {
  ipcMain.handle(APP_VERSION_CHANNEL, () => app.getVersion());
  ipcMain.handle(APP_OS_CHANNEL, () => nodePlatform());
  ipcMain.handle(APP_CHECK_FOR_UPDATE_CHANNEL, () => checkGitHubReleaseVsCurrent());
  ipcMain.handle(APP_OPEN_LOGS_DIRECTORY_CHANNEL, () => openLogsDirectory());
  ipcMain.handle(APP_LIST_GITHUB_ISSUES_CHANNEL, () => listGitHubIssues());
  ipcMain.handle(APP_LIST_PINNED_GITHUB_ISSUES_CHANNEL, () => listPinnedGitHubIssues());
  prefetchPinnedGitHubIssues();
}
