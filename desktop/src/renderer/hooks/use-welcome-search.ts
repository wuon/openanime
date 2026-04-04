import { useEffect, useState } from "react";

import { ShowSearchResult } from "@/shared/types";

export type UseWelcomeSearchOptions = {
  /**
   * When true, an empty query calls `search("")`, which uses the provider default
   * (AllAnime returns latest uploads for an empty search object).
   */
  loadLatestWhenEmpty?: boolean;
};

export function useWelcomeSearch(debouncedQuery: string, options?: UseWelcomeSearchOptions) {
  const loadLatestWhenEmpty = options?.loadLatestWhenEmpty ?? false;
  const [results, setResults] = useState<ShowSearchResult[]>([]);
  const [loading, setLoading] = useState(() => loadLatestWhenEmpty && debouncedQuery.trim() === "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q && !loadLatestWhenEmpty) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    const searchArg = q;
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.streamProvider
      .search(searchArg)
      .then((list) => {
        if (!cancelled) setResults(list);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, loadLatestWhenEmpty]);

  return { results, loading, error };
}
