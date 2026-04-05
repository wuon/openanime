import { ipcMain } from "electron";

import type { AniListMediaPageVariables } from "@/shared/types";

import {
  ANILIST_POPULAR_SEASON_CHANNEL,
  ANILIST_SEARCH_CHANNEL,
  ANILIST_SHOW_DETAILS_CHANNEL,
} from "./anilist-channels";
import { getAniListPopularSeasonAnime } from "./anilist-popular-season";
import { searchAniListMedia } from "./anilist-search";
import { getAniListShowDetails } from "./anilist-show-details";

export function addAniListListeners() {
  ipcMain.handle(ANILIST_SHOW_DETAILS_CHANNEL, (_event, mediaId: number) =>
    getAniListShowDetails(mediaId)
  );
  ipcMain.handle(ANILIST_SEARCH_CHANNEL, (_event, variables: AniListMediaPageVariables) =>
    searchAniListMedia(variables)
  );
  ipcMain.handle(ANILIST_POPULAR_SEASON_CHANNEL, () => getAniListPopularSeasonAnime());
}
