import { app, ipcMain } from "electron";

import { APP_VERSION_CHANNEL } from "./app-channels";

export function addAppEventListeners() {
  ipcMain.handle(APP_VERSION_CHANNEL, () => app.getVersion());
}

