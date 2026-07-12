import { app } from "electron";

import type {
  GithubIssue,
  GithubIssueLabel,
  GithubIssuesListResult,
} from "@/shared/github-issues-types";

/** Matches `updateElectronApp` repo in main.ts */
const GITHUB_REPO = "wuon/openanime";
const ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues`;

function parseLabel(raw: unknown): GithubIssueLabel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string" || typeof o.color !== "string") return null;
  return { name: o.name, color: o.color };
}

function parseIssue(raw: unknown): GithubIssue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;

  // Issues API also returns pull requests; skip those.
  if (o.pull_request != null) return null;

  if (typeof o.number !== "number" || typeof o.title !== "string") return null;
  if (typeof o.html_url !== "string") return null;
  if (o.state !== "open" && o.state !== "closed") return null;
  if (typeof o.created_at !== "string" || typeof o.updated_at !== "string") return null;

  const user =
    typeof o.user === "object" && o.user !== null
      ? (o.user as Record<string, unknown>)
      : null;
  const userLogin = user && typeof user.login === "string" ? user.login : null;

  const labelsRaw = Array.isArray(o.labels) ? o.labels : [];
  const labels: GithubIssueLabel[] = [];
  for (const label of labelsRaw) {
    const parsed = parseLabel(label);
    if (parsed) labels.push(parsed);
  }

  return {
    number: o.number,
    title: o.title,
    htmlUrl: o.html_url,
    state: o.state,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    userLogin,
    labels,
    comments: typeof o.comments === "number" ? o.comments : 0,
  };
}

export async function listGitHubIssues(): Promise<GithubIssuesListResult> {
  const base: GithubIssuesListResult = {
    issues: [],
    issuesUrl: ISSUES_URL,
  };

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&per_page=50&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": `Openanime/${app.getVersion()}`,
        },
      }
    );

    if (!res.ok) {
      return { ...base, error: `github-api-${res.status}` };
    }

    const raw = await res.json();
    if (!Array.isArray(raw)) {
      return { ...base, error: "invalid-json" };
    }

    const issues: GithubIssue[] = [];
    for (const item of raw) {
      const issue = parseIssue(item);
      if (issue) issues.push(issue);
    }

    return { ...base, issues };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...base, error: message };
  }
}
