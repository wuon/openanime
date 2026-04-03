import { useEffect, useState } from "react";

import { Episode } from "@/shared/types";

export function useWelcomeRecentlyUploaded(pageSize: number) {
  const [recentUploads, setRecentUploads] = useState<Episode[]>([]);
  const [recentUploadsLoading, setRecentUploadsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setRecentUploadsLoading(true);
    window.streamProvider
      .getRecentUploads(1, pageSize)
      .then(
        (episodes: Episode[]) => {
          if (cancelled) return;
          setRecentUploads(episodes);
        },
        () => {
          if (!cancelled) setRecentUploads([]);
        }
      )
      .finally(() => {
        if (!cancelled) setRecentUploadsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pageSize]);

  return { recentUploads, recentUploadsLoading };
}
