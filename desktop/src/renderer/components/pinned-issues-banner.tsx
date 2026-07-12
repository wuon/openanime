import { AlertTriangle, ExternalLinkIcon } from "lucide-react";
import React from "react";

import { Button } from "@/renderer/components/ui/button";
import type { GithubIssue } from "@/shared/github-issues-types";

const ISSUES_URL = "https://github.com/wuon/openanime/issues";

function openExternalUrl(url: string) {
  if (window.urlOpener) {
    void window.urlOpener.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

interface PinnedIssuesBannerProps {
  issues: GithubIssue[];
}

/**
 * Non-dismissible home banner for pinned GitHub issues labeled `breaking`.
 */
export function PinnedIssuesBanner({ issues }: PinnedIssuesBannerProps) {
  if (issues.length === 0) return null;

  const count = issues.length;
  const primary = issues[0];
  const summary =
    count === 1 ? `${primary.title}` : `${count} issues are currently being investigated.`;
  const targetUrl = count === 1 ? primary.htmlUrl : ISSUES_URL;

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full border-b border-destructive/40 bg-destructive/10 px-6 py-3 md:px-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex gap-3 min-w-0">
        <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" aria-hidden />
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Openanime is currently degraded or unavailable
          </p>
          <p className="text-sm text-muted-foreground line-clamp-2">{summary}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="sm:shrink-0 w-full sm:w-auto"
        onClick={() => openExternalUrl(targetUrl)}
      >
        View on GitHub
        <ExternalLinkIcon className="size-4" />
      </Button>
    </div>
  );
}
