export interface AppUpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  error?: string;
}
