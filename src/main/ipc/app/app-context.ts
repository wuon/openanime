import { contextBridge, ipcRenderer } from "electron";

import { APP_VERSION_CHANNEL } from "./app-channels";

export function exposeAppContext() {
  contextBridge.exposeInMainWorld("app", {
    version: () => ipcRenderer.invoke(APP_VERSION_CHANNEL) as Promise<string>,
  });
}

