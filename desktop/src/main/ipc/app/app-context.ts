import { contextBridge, ipcRenderer } from "electron";

import {
  APP_DEPENDENCIES_REQUIRED_CHANNEL,
  APP_OS_CHANNEL,
  APP_VERSION_CHANNEL,
} from "./app-channels";

export function exposeAppContext() {
  contextBridge.exposeInMainWorld("app", {
    version: () => ipcRenderer.invoke(APP_VERSION_CHANNEL) as Promise<string>,
    os: () => ipcRenderer.invoke(APP_OS_CHANNEL) as Promise<string>,
    dependenciesRequired: () =>
      ipcRenderer.invoke(APP_DEPENDENCIES_REQUIRED_CHANNEL) as Promise<boolean>,
  });
}

