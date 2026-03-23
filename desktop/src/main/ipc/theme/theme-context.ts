import { contextBridge, ipcRenderer } from "electron";

import {
  THEME_CURRENT_CHANNEL,
  THEME_DARK_CHANNEL,
  THEME_LIGHT_CHANNEL,
  THEME_SYSTEM_CHANNEL,
  THEME_TOGGLE_CHANNEL,
} from "./theme-channels";

export function exposeThemeContext() {
  contextBridge.exposeInMainWorld("theme", {
    current: () => ipcRenderer.invoke(THEME_CURRENT_CHANNEL),
    toggle: () => ipcRenderer.invoke(THEME_TOGGLE_CHANNEL),
    dark: () => ipcRenderer.invoke(THEME_DARK_CHANNEL),
    light: () => ipcRenderer.invoke(THEME_LIGHT_CHANNEL),
    system: () => ipcRenderer.invoke(THEME_SYSTEM_CHANNEL),
  });
}
