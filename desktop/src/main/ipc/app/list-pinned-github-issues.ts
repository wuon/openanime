import { getElectronUserAgent } from "@/main/electron-user-agent";
import type {
  GithubIssue,
  GithubIssueLabel,
  GithubIssuesListResult,
} from "@/shared/github-issues-types";

/** Matches `updateElectronApp` repo in main.ts */
const GITHUB_REPO = "wuon/openanime";
const ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues`;

/**
 * Extract a JSON value starting at `start` (must point at `{` or `[`).
 * Used to read Relay payloads embedded in the public GitHub issues HTML.
 */
function extractJsonValue(source: string, start: number): unknown | null {
  const open = source[start];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(source.slice(start, i + 1)) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parsePinnedIssueNode(raw: unknown): GithubIssue | null {
  if (typeof raw !== "object" || raw === null) return null;
  const wrapper = raw as Record<string, unknown>;
  const issueRaw =
    typeof wrapper.issue === "object" && wrapper.issue !== null
      ? (wrapper.issue as Record<string, unknown>)
      : wrapper;

  if (typeof issueRaw.number !== "number" || typeof issueRaw.title !== "string") return null;
  if (typeof issueRaw.url !== "string") return null;
  if (typeof issueRaw.state !== "string") return null;

  const stateLower = issueRaw.state.toLowerCase();
  if (stateLower !== "open" && stateLower !== "closed") return null;

  const author =
    typeof issueRaw.author === "object" && issueRaw.author !== null
      ? (issueRaw.author as Record<string, unknown>)
      : null;
  const userLogin = author && typeof author.login === "string" ? author.login : null;

  const labels: GithubIssueLabel[] = [];
  // Embedded HTML payload often omits labels on pinned nodes; keep empty when absent.
  const labelsContainer =
    typeof issueRaw.labels === "object" && issueRaw.labels !== null
      ? (issueRaw.labels as Record<string, unknown>)
      : null;
  const labelNodes = Array.isArray(labelsContainer?.nodes)
    ? labelsContainer.nodes
    : Array.isArray(labelsContainer?.edges)
      ? labelsContainer.edges
      : [];
  for (const entry of labelNodes) {
    if (typeof entry !== "object" || entry === null) continue;
    const node =
      "node" in entry && typeof (entry as { node: unknown }).node === "object"
        ? ((entry as { node: Record<string, unknown> }).node ?? null)
        : (entry as Record<string, unknown>);
    if (!node || typeof node.name !== "string" || typeof node.color !== "string") continue;
    labels.push({ name: node.name, color: node.color.replace(/^#/, "") });
  }

  const createdAt =
    typeof issueRaw.createdAt === "string" ? issueRaw.createdAt : new Date(0).toISOString();
  const updatedAt =
    typeof issueRaw.updatedAt === "string" ? issueRaw.updatedAt : createdAt;
  const comments =
    typeof issueRaw.totalCommentsCount === "number"
      ? issueRaw.totalCommentsCount
      : typeof issueRaw.comments === "object" &&
          issueRaw.comments !== null &&
          typeof (issueRaw.comments as { totalCount?: unknown }).totalCount === "number"
        ? (issueRaw.comments as { totalCount: number }).totalCount
        : 0;

  return {
    number: issueRaw.number,
    title: issueRaw.title,
    htmlUrl: issueRaw.url,
    state: stateLower,
    createdAt,
    updatedAt,
    userLogin,
    labels,
    comments,
  };
}

function parsePinnedIssuesFromHtml(html: string): GithubIssue[] | null {
  const key = '"pinnedIssues":';
  const keyIndex = html.indexOf(key);
  if (keyIndex < 0) return null;

  const valueStart = keyIndex + key.length;
  const pinned = extractJsonValue(html, valueStart);
  if (typeof pinned !== "object" || pinned === null) return null;

  const nodes = (pinned as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes)) return [];

  const issues: GithubIssue[] = [];
  for (const node of nodes) {
    const issue = parsePinnedIssueNode(node);
    if (issue) issues.push(issue);
  }
  return issues;
}

const BREAKING_LABEL = "breaking";

function hasBreakingLabel(issue: GithubIssue): boolean {
  return issue.labels.some((label) => label.name.toLowerCase() === BREAKING_LABEL);
}

/**
 * Pinned issue HTML often omits labels; load open `breaking` issues and intersect.
 */
async function fetchBreakingIssueNumbers(): Promise<Set<number> | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/issues?state=open&labels=${encodeURIComponent(BREAKING_LABEL)}&per_page=50`,
      {
        headers: {
          "User-Agent": getElectronUserAgent(),
        },
      }
    );
    if (!res.ok) return null;

    const raw = await res.json();
    if (!Array.isArray(raw)) return null;

    const numbers = new Set<number>();
    for (const item of raw) {
      if (typeof item !== "object" || item === null) continue;
      // Issues API also returns pull requests; skip those.
      if ((item as { pull_request?: unknown }).pull_request != null) continue;
      const number = (item as { number?: unknown }).number;
      if (typeof number === "number") numbers.add(number);
    }
    return numbers;
  } catch {
    return null;
  }
}

/**
 * Lists pinned GitHub issues that also have the `breaking` label.
 *
 * Uses the public issues HTML for pins (GraphQL requires auth), then intersects
 * with open issues labeled `breaking` from the REST API.
 */
async function fetchPinnedGitHubIssues(): Promise<GithubIssuesListResult> {
  const base: GithubIssuesListResult = {
    issues: [],
    issuesUrl: ISSUES_URL,
  };

  try {
    const res = await fetch(ISSUES_URL, {
      headers: {
        "User-Agent": getElectronUserAgent(),
      },
    });

    if (!res.ok) {
      return { ...base, error: `github-html-${res.status}` };
    }

    const html = await res.text();
    const pinned = parsePinnedIssuesFromHtml(html);
    if (pinned === null) {
      return { ...base, error: "pinned-payload-missing" };
    }

    if (pinned.length === 0) {
      return { ...base, issues: [] };
    }

    // Pinned HTML often omits labels; when every pin already has labels, filter locally.
    const allHaveLabels = pinned.every((issue) => issue.labels.length > 0);
    if (allHaveLabels) {
      return { ...base, issues: pinned.filter(hasBreakingLabel) };
    }

    const breakingNumbers = await fetchBreakingIssueNumbers();
    if (breakingNumbers === null) {
      // REST unavailable: only keep pinned issues we can already confirm are breaking.
      return { ...base, issues: pinned.filter(hasBreakingLabel) };
    }

    return {
      ...base,
      issues: pinned.filter((issue) => breakingNumbers.has(issue.number)),
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ...base, error: message };
  }
}

/** Launch-scoped cache; shared by prefetch + IPC callers. */
let pinnedIssuesLaunchCache: Promise<GithubIssuesListResult> | null = null;

export function listPinnedGitHubIssues(): Promise<GithubIssuesListResult> {
  if (!pinnedIssuesLaunchCache) {
    pinnedIssuesLaunchCache = fetchPinnedGitHubIssues();
  }
  return pinnedIssuesLaunchCache;
}

/** Kick off the launch cache early so Home can resolve from memory. */
export function prefetchPinnedGitHubIssues(): void {
  void listPinnedGitHubIssues();
}
