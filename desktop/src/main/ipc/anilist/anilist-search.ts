import type { AniListMediaPageResult, AniListMediaPageVariables } from "@/shared/types";

import { fetchAniListMediaPage } from "./anilist-media-page";

export async function searchAniListMedia(variables: AniListMediaPageVariables): Promise<AniListMediaPageResult> {
  return fetchAniListMediaPage(variables);
}
