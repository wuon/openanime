import { BrowserWindow, ipcMain } from "electron";

import {
  WINDOW_CLOSE_CHANNEL,
  WINDOW_IS_MAXIMIZED_CHANNEL,
  WINDOW_MINIMIZE_CHANNEL,
  WINDOW_TOGGLE_MAXIMIZE_CHANNEL,
} from "./window-channels";

export function addWindowEventListeners() {
  ipcMain.handle(WINDOW_MINIMIZE_CHANNEL, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle(WINDOW_CLOSE_CHANNEL, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle(WINDOW_TOGGLE_MAXIMIZE_CHANNEL, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;

    if (win.isMaximized()) win.unmaximize();
    else win.maximize();

    return win.isMaximized();
  });

  ipcMain.handle(WINDOW_IS_MAXIMIZED_CHANNEL, (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });
}

