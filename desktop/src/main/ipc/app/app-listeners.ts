import { app, ipcMain } from "electron";

import { APP_OS_CHANNEL, APP_VERSION_CHANNEL } from "./app-channels";

export function addAppEventListeners() {
  ipcMain.handle(APP_VERSION_CHANNEL, () => app.getVersion());
  ipcMain.handle(APP_OS_CHANNEL, () => process.platform);
}

