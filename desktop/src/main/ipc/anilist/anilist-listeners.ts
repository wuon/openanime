import { ipcMain } from "electron";

import { ANILIST_SHOW_DETAILS_CHANNEL } from "./anilist-channels";
import { getAniListShowDetails } from "./anilist-show-details";

export function addAniListListeners() {
  ipcMain.handle(ANILIST_SHOW_DETAILS_CHANNEL, (_event, mediaId: number) =>
    getAniListShowDetails(mediaId)
  );
}
