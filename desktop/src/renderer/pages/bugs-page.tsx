import { ExternalLink, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

import { SubmitBugDialog } from "@/renderer/components/submit-bug-dialog";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Skeleton } from "@/renderer/components/ui/skeleton";
import type { GithubIssue, GithubIssuesListResult } from "@/shared/github-issues-types";

const ISSUE_SKELETON_ROWS = 6;

function openExternalUrl(url: string) {
  if (window.urlOpener) {
    void window.urlOpener.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function formatIssueDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** GitHub label colors are hex without `#`; pick readable text for the chip. */
function labelTextColor(hex: string): string {
  const normalized = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return "#fff";
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111" : "#fff";
}

function IssuesTableSkeleton() {
  return (
    <div className="rounded-xl border border-border overflow-hidden" aria-busy="true">
      <div className="overflow-x-auto">
        <table className="w-full text-sm caption-bottom">
          <thead className="border-b border-border bg-muted/40">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                Issue
              </th>
              <th className="px-4 py-3 font-medium min-w-[12rem]" scope="col">
                Title
              </th>
              <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                Labels
              </th>
              <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: ISSUE_SKELETON_ROWS }, (_, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-10" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-64 max-w-full" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-5 w-20 rounded-full" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-24" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: GithubIssue }) {
  return (
    <tr
      className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => openExternalUrl(issue.htmlUrl)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openExternalUrl(issue.htmlUrl);
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open issue #${issue.number}: ${issue.title}`}
    >
      <td className="px-4 py-3 align-middle whitespace-nowrap font-mono text-muted-foreground tabular-nums">
        #{issue.number}
      </td>
      <td className="px-4 py-3 align-middle min-w-[12rem]">
        <span className="font-medium text-foreground">{issue.title}</span>
        {issue.userLogin && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            opened by {issue.userLogin}
            {issue.comments > 0
              ? ` · ${issue.comments} comment${issue.comments === 1 ? "" : "s"}`
              : ""}
          </span>
        )}
      </td>
      <td className="px-4 py-3 align-middle">
        <div className="flex flex-wrap gap-1.5">
          {issue.labels.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            issue.labels.map((label) => (
              <Badge
                key={label.name}
                variant="outline"
                className="border-transparent text-xs font-medium"
                style={{
                  backgroundColor: `#${label.color}`,
                  color: labelTextColor(label.color),
                }}
              >
                {label.name}
              </Badge>
            ))
          )}
        </div>
      </td>
      <td className="px-4 py-3 align-middle whitespace-nowrap text-muted-foreground">
        {formatIssueDate(issue.updatedAt)}
      </td>
    </tr>
  );
}

export function BugsPage() {
  const [result, setResult] = useState<GithubIssuesListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    void window.app
      .listGithubIssues()
      .then((next) => {
        setResult(next);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const issues = result?.issues ?? [];
  const empty = !loading && !result?.error && issues.length === 0;
  const error = !loading ? result?.error : undefined;

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
      <SubmitBugDialog open={submitOpen} onOpenChange={setSubmitOpen} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h1 className="text-4xl font-semibold tracking-tight">Bugs</h1>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Refresh issues"
            disabled={loading}
            onClick={() => load()}
          >
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
          </Button>
          <Button type="button" onClick={() => setSubmitOpen(true)}>
            Report a bug
          </Button>
        </div>
      </div>

      {loading ? (
        <IssuesTableSkeleton />
      ) : error ? (
        <div className="rounded-xl border border-border p-5 space-y-3">
          <p className="text-sm text-destructive" role="alert">
            Could not load issues{error.startsWith("github-api-") ? ` (${error})` : `: ${error}`}.
          </p>
          <Button type="button" variant="outline" onClick={() => load()}>
            Try again
          </Button>
        </div>
      ) : empty ? (
        <p className="text-muted-foreground text-sm">No open issues right now.</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm caption-bottom">
              <thead className="border-b border-border bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                    Issue
                  </th>
                  <th className="px-4 py-3 font-medium min-w-[12rem]" scope="col">
                    Title
                  </th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                    Labels
                  </th>
                  <th className="px-4 py-3 font-medium whitespace-nowrap" scope="col">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <IssueRow key={issue.number} issue={issue} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
