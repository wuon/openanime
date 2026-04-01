import { useCallback, useEffect, useState } from "react";

import {
  SHOW_DETAILS_FETCH_CONCURRENCY,
  mergeShowDetailsByid,
  type ShowDetailsSummary,
} from "@/renderer/lib/fetch-show-thumbnails";
import { RecentlyWatchedEntry } from "@/shared/types";

export function useWelcomeRecentlyWatched() {
  const [recentlyWatched, setRecentlyWatched] = useState<RecentlyWatchedEntry[]>([]);
  const [recentlyWatchedLoading, setRecentlyWatchedLoading] = useState(true);
  const [recentlyWatchedDetails, setRecentlyWatchedDetails] = useState<
    Record<string, ShowDetailsSummary>
  >({});

  useEffect(() => {
    let cancelled = false;
    setRecentlyWatchedLoading(true);
    window.recentlyWatched
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
    const toFetch: Array<{ id: string; providerId: string }> = [];
    for (const entry of recentlyWatched) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      if (recentlyWatchedDetails[entry.id] !== undefined) continue;
      toFetch.push({ id: entry.id, providerId: entry.providerId });
    }
    if (toFetch.length === 0) return;

    void (async () => {
      await mergeShowDetailsByid(
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
    await window.recentlyWatched.clear();
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
