import { contextBridge, ipcRenderer } from "electron";

import { EXTERNAL_OPEN_GITHUB_CHANNEL } from "./external-channels";

export function exposeExternalContext() {
  contextBridge.exposeInMainWorld("urlOpener", {
    openGithub: (url: string) =>
      ipcRenderer.invoke(EXTERNAL_OPEN_GITHUB_CHANNEL, url) as Promise<void>,
  });
}
