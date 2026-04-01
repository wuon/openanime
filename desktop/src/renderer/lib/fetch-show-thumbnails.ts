import type { Dispatch, SetStateAction } from "react";

import { forEachWithConcurrency } from "@/renderer/lib/for-each-with-concurrency";

/** Each call hits the network; cap parallel work so the welcome screen stays responsive. */
export const SHOW_DETAILS_FETCH_CONCURRENCY = 3;

export type ShowDetailsSummary = { name: string; thumbnail: string | null };

/**
 * Fetches `getShowDetails` for each item and merges `thumbnail` into a map keyed by `id`.
 */
export async function mergeShowThumbnailsFromShowDetails<T extends { id: string }>(
  toFetch: T[],
  concurrency: number,
  setMap: Dispatch<SetStateAction<Record<string, string | null>>>,
  cancelled: () => boolean
): Promise<void> {
  if (toFetch.length === 0) return;
  await forEachWithConcurrency(toFetch, concurrency, async (anime) => {
    if (cancelled()) return;
    try {
      const details = await window.aniCli.getShowDetails(anime.id);
      if (cancelled()) return;
      setMap((prev) =>
        prev[anime.id] !== undefined ? prev : { ...prev, [anime.id]: details.thumbnail ?? null }
      );
    } catch {
      if (cancelled()) return;
      setMap((prev) =>
        prev[anime.id] !== undefined ? prev : { ...prev, [anime.id]: null }
      );
    }
  });
}

/**
 * Fetches `getShowDetails` for each anime id and merges name + thumbnail.
 */
export async function mergeShowDetailsByAnimeId(
  animeIds: string[],
  concurrency: number,
  setDetails: Dispatch<SetStateAction<Record<string, ShowDetailsSummary>>>,
  cancelled: () => boolean
): Promise<void> {
  if (animeIds.length === 0) return;
  await forEachWithConcurrency(animeIds, concurrency, async (animeId) => {
    if (cancelled()) return;
    try {
      const details = await window.aniCli.getShowDetails(animeId);
      if (cancelled()) return;
      setDetails((prev) =>
        prev[animeId] !== undefined
          ? prev
          : {
              ...prev,
              [animeId]: { name: details.name, thumbnail: details.thumbnail ?? null },
            }
      );
    } catch {
      if (cancelled()) return;
      setDetails((prev) =>
        prev[animeId] !== undefined
          ? prev
          : { ...prev, [animeId]: { name: animeId, thumbnail: null } }
      );
    }
  });
}
