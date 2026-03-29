import { useEffect, useState } from "react";

import {
  type AnimeSearchResult,
  getAniCli,
} from "@/renderer/lib/ani-cli-bridge";
import {
  SHOW_DETAILS_FETCH_CONCURRENCY,
  mergeShowThumbnailsFromShowDetails,
} from "@/renderer/lib/fetch-show-thumbnails";

export function useWelcomeRecentUploads(pageSize: number) {
  const [recentAnime, setRecentAnime] = useState<AnimeSearchResult[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentThumbnails, setRecentThumbnails] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    void getAniCli()
      .getRecent(1, pageSize)
      .then(
        (res: { items: AnimeSearchResult[]; hasMore: boolean }) => {
          if (!cancelled) setRecentAnime(res.items);
        },
        () => {
          if (!cancelled) setRecentAnime([]);
        }
      )
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    return () => {
      cancelled = true;
    };
  }, [pageSize]);

  useEffect(() => {
    let cancelled = false;
    if (recentAnime.length === 0) return;
    const toFetch = recentAnime.filter((a) => recentThumbnails[a.id] === undefined);
    if (toFetch.length === 0) return;

    void (async () => {
      await mergeShowThumbnailsFromShowDetails(
        toFetch,
        SHOW_DETAILS_FETCH_CONCURRENCY,
        setRecentThumbnails,
        () => cancelled
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [recentAnime]);

  return { recentAnime, recentLoading, recentThumbnails };
}
