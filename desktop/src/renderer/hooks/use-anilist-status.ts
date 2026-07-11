import { useCallback, useEffect, useState } from "react";

import type { AniListIntegrationStatus } from "@/shared/types";

export function useAniListStatus(): {
  status: AniListIntegrationStatus;
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const [status, setStatus] = useState<AniListIntegrationStatus>({ connected: false });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await window.anilist.getStatus();
      setStatus(next);
    } catch {
      setStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { status, loading, refresh };
}
