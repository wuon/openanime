import { contextBridge, ipcRenderer } from "electron";

import {
  WINDOW_CLOSE_CHANNEL,
  WINDOW_IS_MAXIMIZED_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
} from "./window-channels";

export function exposeWindowControls() {
  contextBridge.exposeInMainWorld("windowControls", {
    minimize: () => ipcRenderer.invoke(WINDOW_MINIMIZE_CHANNEL) as Promise<void>,
    close: () => ipcRenderer.invoke(WINDOW_CLOSE_CHANNEL) as Promise<void>,
    toggleMaximize: () => ipcRenderer.invoke(WINDOW_TOGGLE_MAXIMIZE_CHANNEL) as Promise<boolean>,
    isMaximized: () => ipcRenderer.invoke(WINDOW_IS_MAXIMIZED_CHANNEL) as Promise<boolean>,
  });
}

