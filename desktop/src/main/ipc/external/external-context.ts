import { contextBridge, ipcRenderer } from "electron";

import { EXTERNAL_OPEN_URL_CHANNEL } from "./external-channels";

export function exposeExternalContext() {
  contextBridge.exposeInMainWorld("urlOpener", {
    openUrl: (url: string) =>
      ipcRenderer.invoke(EXTERNAL_OPEN_URL_CHANNEL, url) as Promise<void>,
  });
}
