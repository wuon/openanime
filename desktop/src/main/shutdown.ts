import { BrowserWindow } from "electron";

import { unregisterListeners } from "@/main/ipc/listeners";
import { destroyAnidbBrowser } from "@/main/ipc/stream-provider/stream-providers/anidb/anidb-browser-fetch";
import { destroyHianimeBrowser } from "@/main/ipc/stream-provider/stream-providers/hianime/hianime-browser-fetch";
import { destroyFlixcloudBrowser } from "@/main/ipc/stream-provider/stream-providers/reanime/flixcloud-browser-upstream";
import { stopStreamProxy } from "@/main/stream-proxy";

let didShutdown = false;

export function isAppShuttingDown(): boolean {
  return didShutdown;
}

function destroyHiddenWindows(): void {
  for (const win of [...BrowserWindow.getAllWindows()]) {
    if (win.isDestroyed() || win.isVisible()) continue;
    win.destroy();
  }
}

/**
 * Tear down hidden provider windows, IPC, ffmpeg, and the stream proxy.
 *
 * Provider sessions keep `show: false` BrowserWindows alive. Those still count
 * toward Electron's window list, so `window-all-closed` never fires after the
 * user closes the visible window unless we destroy them first.
 */
export function shutdownBackgroundResources(): void {
  if (didShutdown) return;
  didShutdown = true;

  destroyHianimeBrowser();
  destroyAnidbBrowser();
  destroyFlixcloudBrowser();
  destroyHiddenWindows();
  unregisterListeners();
  stopStreamProxy();
}
