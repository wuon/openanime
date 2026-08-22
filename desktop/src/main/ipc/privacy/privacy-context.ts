import { contextBridge, ipcRenderer } from "electron";

import {
  PRIVACY_INCOGNITO_GET_CHANNEL,
  PRIVACY_INCOGNITO_SET_CHANNEL,
} from "./privacy-channels";

export function exposePrivacyContext() {
  contextBridge.exposeInMainWorld("privacy", {
    getIncognito: () => ipcRenderer.invoke(PRIVACY_INCOGNITO_GET_CHANNEL) as Promise<boolean>,
    setIncognito: (enabled: boolean) =>
      ipcRenderer.invoke(PRIVACY_INCOGNITO_SET_CHANNEL, enabled) as Promise<boolean>,
  });
}
