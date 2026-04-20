import { useCallback, useEffect, useMemo, useState } from "react";
import type { HistoryEntry } from "@/shared/types";

const DISPLAY_UNIQUE_SHOW_LIMIT = 12;

export function useWelcomeRecentlyWatched() {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [recentlyWatchedLoading, setRecentlyWatchedLoading] = useState(true);

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

  const clearRecentlyWatched = useCallback(async () => {
    await window.recentlyWatched.clear();
    setHistoryEntries([]);
  }, []);

  return {
    recentlyWatched,
    recentlyWatchedLoading,
    clearRecentlyWatched,
  };
}
