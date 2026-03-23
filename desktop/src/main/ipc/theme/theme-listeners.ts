import { ipcMain, nativeTheme } from "electron";

import {
  THEME_CURRENT_CHANNEL,
  THEME_DARK_CHANNEL,
  THEME_LIGHT_CHANNEL,
  THEME_SYSTEM_CHANNEL,
  THEME_TOGGLE_CHANNEL,
} from "./theme-channels";

export function addThemeEventListeners() {
  ipcMain.handle(THEME_CURRENT_CHANNEL, () => nativeTheme.themeSource);
  ipcMain.handle(THEME_TOGGLE_CHANNEL, () => {
    if (nativeTheme.shouldUseDarkColors) {
      nativeTheme.themeSource = "light";
    } else {
      nativeTheme.themeSource = "dark";
    }
    return nativeTheme.shouldUseDarkColors;
  });
  ipcMain.handle(THEME_DARK_CHANNEL, () => (nativeTheme.themeSource = "dark"));
  ipcMain.handle(THEME_LIGHT_CHANNEL, () => (nativeTheme.themeSource = "light"));
  ipcMain.handle(THEME_SYSTEM_CHANNEL, () => {
    nativeTheme.themeSource = "system";
    return nativeTheme.shouldUseDarkColors;
  });
}
