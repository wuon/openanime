import { useEffect, useState } from "react";

import type { GithubIssue } from "@/shared/github-issues-types";

/**
 * Pinned GitHub issues labeled `breaking`. Empty while loading or on fetch failure
 * (banner should only appear when we positively detect matching issues).
 */
export function usePinnedGithubIssues(): {
  issues: GithubIssue[];
  loading: boolean;
} {
  const [issues, setIssues] = useState<GithubIssue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void window.app
      .listPinnedGithubIssues()
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setIssues([]);
          return;
        }
        setIssues(result.issues);
      })
      .catch(() => {
        if (!cancelled) setIssues([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { issues, loading };
}
