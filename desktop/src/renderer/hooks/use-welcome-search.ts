import { useEffect, useMemo, useState } from "react";

import type { SearchFilterValues } from "@/shared/search-filters";
import { ShowSearchResult } from "@/shared/types";

export type UseWelcomeSearchOptions = {
  /**
   * When true, an empty query calls `search("")`, which uses the provider default
   * (AllAnime returns latest uploads for an empty search object).
   */
  loadLatestWhenEmpty?: boolean;
  /** Provider browse filters; omitted keys / "any" are ignored by the provider. */
  filters?: SearchFilterValues;
};

export function useWelcomeSearch(debouncedQuery: string, options?: UseWelcomeSearchOptions) {
  const loadLatestWhenEmpty = options?.loadLatestWhenEmpty ?? false;
  const filters = options?.filters;
  const filtersSerialized = useMemo(() => JSON.stringify(filters ?? null), [filters]);
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
    const parsedFilters =
      filtersSerialized === "null"
        ? undefined
        : (JSON.parse(filtersSerialized) as SearchFilterValues);
    let cancelled = false;
    setLoading(true);
    setError(null);
    window.streamProvider
      .search(q, parsedFilters)
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
  }, [debouncedQuery, loadLatestWhenEmpty, filtersSerialized]);

  return { results, loading, error };
}
