export interface GithubIssueLabel {
  name: string;
  color: string;
}

export interface GithubIssue {
  number: number;
  title: string;
  htmlUrl: string;
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  userLogin: string | null;
  labels: GithubIssueLabel[];
  comments: number;
}

export interface GithubIssuesListResult {
  issues: GithubIssue[];
  issuesUrl: string;
  error?: string;
}
