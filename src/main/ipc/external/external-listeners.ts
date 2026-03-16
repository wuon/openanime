import { ipcMain, shell } from "electron";

import { EXTERNAL_OPEN_GITHUB_CHANNEL } from "./external-channels";

const GITHUB_PREFIX = "https://github.com/";

export function addExternalEventListeners() {
  ipcMain.handle(EXTERNAL_OPEN_GITHUB_CHANNEL, async (_event, url: string) => {
    if (typeof url !== "string" || !url.startsWith(GITHUB_PREFIX)) return;
    await shell.openExternal(url);
  });
}

