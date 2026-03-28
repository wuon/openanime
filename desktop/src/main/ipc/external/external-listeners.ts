import { ipcMain, shell } from "electron";

import { EXTERNAL_OPEN_URL_CHANNEL } from "./external-channels";

/** Hostnames allowed for `openUrl` (https only). Add entries when new external links are needed. */
const ALLOWED_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "git-scm.com",
  "www.git-scm.com",
]);

function isAllowedExternalUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function addExternalEventListeners() {
  ipcMain.handle(EXTERNAL_OPEN_URL_CHANNEL, async (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) return;
    await shell.openExternal(url);
  });
}
