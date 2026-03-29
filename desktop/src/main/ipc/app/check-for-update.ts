import { app } from "electron";
import { coerce, gt, valid } from "semver";

import type { AppUpdateCheckResult } from "@/shared/app-update-types";

/** Matches `updateElectronApp` repo in main.ts */
const GITHUB_REPO = "wuon/openanime";

function parseLatestReleaseJson(raw: unknown): { tag_name?: string; html_url?: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  return {
    tag_name: typeof o.tag_name === "string" ? o.tag_name : undefined,
    html_url: typeof o.html_url === "string" ? o.html_url : undefined,
  };
}

export async function checkGitHubReleaseVsCurrent(): Promise<AppUpdateCheckResult> {
  const currentVersion = app.getVersion();
  const base: AppUpdateCheckResult = {
    updateAvailable: false,
    currentVersion,
    latestVersion: null,
    releaseUrl: null,
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Openanime/${currentVersion}`,
      },
    });

    if (!res.ok) {
      const err: AppUpdateCheckResult = { ...base, error: `github-api-${res.status}` };
      return err;
    }

    const data = parseLatestReleaseJson(await res.json());
    if (!data) {
      const err: AppUpdateCheckResult = { ...base, error: "invalid-json" };
      return err;
    }
    const rawTag = data.tag_name?.trim() ?? "";
    const latestVersion = rawTag.replace(/^v/i, "");
    if (!latestVersion) {
      const err: AppUpdateCheckResult = { ...base, error: "missing-tag" };
      return err;
    }

    const releaseUrl = data.html_url ?? `https://github.com/${GITHUB_REPO}/releases/latest`;

    const latestSemver = valid(coerce(latestVersion));
    const currentSemver = valid(coerce(currentVersion));
    if (latestSemver === null || currentSemver === null) {
      const err: AppUpdateCheckResult = {
        ...base,
        latestVersion,
        releaseUrl,
        error: "invalid-semver",
      };
      return err;
    }

    if (!gt(latestSemver, currentSemver)) {
      const ok: AppUpdateCheckResult = {
        ...base,
        latestVersion,
        releaseUrl,
      };
      return ok;
    }

    const update: AppUpdateCheckResult = {
      updateAvailable: true,
      currentVersion,
      latestVersion,
      releaseUrl,
    };
    return update;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const err: AppUpdateCheckResult = { ...base, error: message };
    return err;
  }
}
