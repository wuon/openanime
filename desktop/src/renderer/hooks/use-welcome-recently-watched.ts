import { useCallback, useEffect, useMemo, useState } from "react";

import {
  SHOW_DETAILS_FETCH_CONCURRENCY,
  mergeShowDetailsByid,
  type ShowDetailsSummary,
} from "@/renderer/lib/fetch-show-thumbnails";
import type { HistoryEntry } from "@/shared/types";

const DISPLAY_UNIQUE_SHOW_LIMIT = 12;

export function useWelcomeRecentlyWatched() {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [recentlyWatchedLoading, setRecentlyWatchedLoading] = useState(true);
  const [recentlyWatchedDetails, setRecentlyWatchedDetails] = useState<
    Record<string, ShowDetailsSummary>
  >({});

  const recentlyWatched = useMemo(() => {
    const out: HistoryEntry[] = [];
    const seen = new Set<string>();
    for (let i = historyEntries.length - 1; i >= 0 && out.length < DISPLAY_UNIQUE_SHOW_LIMIT; i--) {
      const e = historyEntries[i];
      if (seen.has(e.episode.id)) continue;
      seen.add(e.episode.id);
      out.push(e);
    }
    return out;
  }, [historyEntries]);

  useEffect(() => {
    let cancelled = false;
    setRecentlyWatchedLoading(true);
    window.recentlyWatched
      .read()
      .then((entries) => {
        if (!cancelled) setHistoryEntries(entries);
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
      const showId = entry.episode.id;
      if (seen.has(showId)) continue;
      seen.add(showId);
      if (recentlyWatchedDetails[showId] !== undefined) continue;
      toFetch.push({ id: showId, providerId: entry.episode.providerId });
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
    setHistoryEntries([]);
    setRecentlyWatchedDetails({});
  }, []);

  return {
    recentlyWatched,
    recentlyWatchedLoading,
    recentlyWatchedDetails,
    clearRecentlyWatched,
  };
}
