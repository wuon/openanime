import { useEffect, useState } from "react";

import {
  type AnimeSearchResult,
  getAniCli,
} from "@/renderer/lib/ani-cli-bridge";
import {
  SHOW_DETAILS_FETCH_CONCURRENCY,
  mergeShowThumbnailsFromShowDetails,
} from "@/renderer/lib/fetch-show-thumbnails";

export function useWelcomeSearch(debouncedQuery: string) {
  const [results, setResults] = useState<AnimeSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchThumbnails, setSearchThumbnails] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSearchThumbnails({});
    const aniCli = getAniCli();
    void aniCli
      .search(q)
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
  }, [debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    if (results.length === 0) return;
    const toFetch = results.filter((a) => searchThumbnails[a.id] === undefined);
    if (toFetch.length === 0) return;

    void (async () => {
      await mergeShowThumbnailsFromShowDetails(
        toFetch,
        SHOW_DETAILS_FETCH_CONCURRENCY,
        setSearchThumbnails,
        () => cancelled
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [results]);

  return { results, loading, error, searchThumbnails };
}
