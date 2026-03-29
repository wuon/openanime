import { useCallback, useEffect, useState } from "react";

import {
  SHOW_DETAILS_FETCH_CONCURRENCY,
  mergeShowDetailsByAnimeId,
  type ShowDetailsSummary,
} from "@/renderer/lib/fetch-show-thumbnails";
import {
  type RecentlyWatchedEntry,
  getRecentlyWatched,
} from "@/renderer/lib/recently-watched-bridge";

export function useWelcomeRecentlyWatched() {
  const [recentlyWatched, setRecentlyWatched] = useState<RecentlyWatchedEntry[]>([]);
  const [recentlyWatchedLoading, setRecentlyWatchedLoading] = useState(true);
  const [recentlyWatchedDetails, setRecentlyWatchedDetails] = useState<
    Record<string, ShowDetailsSummary>
  >({});

  useEffect(() => {
    let cancelled = false;
    setRecentlyWatchedLoading(true);
    void getRecentlyWatched()
      .read()
      .then((entries) => {
        if (!cancelled) setRecentlyWatched(entries);
      })
      .finally(() => {
        if (!cancelled) setRecentlyWatchedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (recentlyWatched.length === 0) return;
    const seen = new Set<string>();
    const toFetch: string[] = [];
    for (const entry of recentlyWatched) {
      if (seen.has(entry.animeId)) continue;
      seen.add(entry.animeId);
      if (recentlyWatchedDetails[entry.animeId] !== undefined) continue;
      toFetch.push(entry.animeId);
    }
    if (toFetch.length === 0) return;

    void (async () => {
      await mergeShowDetailsByAnimeId(
        toFetch,
        SHOW_DETAILS_FETCH_CONCURRENCY,
        setRecentlyWatchedDetails,
        () => cancelled
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [recentlyWatched]);

  const clearRecentlyWatched = useCallback(async () => {
    await getRecentlyWatched().clear();
    setRecentlyWatched([]);
    setRecentlyWatchedDetails({});
  }, []);

  return {
    recentlyWatched,
    recentlyWatchedLoading,
    recentlyWatchedDetails,
    clearRecentlyWatched,
  };
}
