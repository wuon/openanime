import React, { useCallback, useEffect, useState } from "react";

import { ThemePicker } from "@/renderer/components/theme-picker";
import { Button } from "@/renderer/components/ui/button";
import type { AppUpdateCheckResult } from "@/shared/app-update-types";

function openExternalUrl(url: string) {
  if (window.urlOpener) {
    void window.urlOpener.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function SettingsPage() {
  const [updateCheck, setUpdateCheck] = useState<AppUpdateCheckResult | null>(null);
  const [updateLoading, setUpdateLoading] = useState(true);
  const [watchHistoryLoading, setWatchHistoryLoading] = useState(true);
  const [hasWatchHistory, setHasWatchHistory] = useState(false);
  const [clearHistoryBusy, setClearHistoryBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setUpdateLoading(true);
      try {
        const result = await window.app.checkForUpdate();
        if (!cancelled) {
          setUpdateCheck(result);
        }
      } finally {
        if (!cancelled) {
          setUpdateLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setWatchHistoryLoading(true);
    void window.recentlyWatched.read().then((entries) => {
      if (!cancelled) {
        setHasWatchHistory(entries.length > 0);
      }
    }).finally(() => {
      if (!cancelled) {
        setWatchHistoryLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClearWatchHistory = useCallback(async () => {
    setClearHistoryBusy(true);
    try {
      await window.recentlyWatched.clear();
      setHasWatchHistory(false);
    } finally {
      setClearHistoryBusy(false);
    }
  }, []);

  const onUpdateClick = useCallback(() => {
    const url = updateCheck?.releaseUrl;
    if (url) {
      openExternalUrl(url);
    }
  }, [updateCheck?.releaseUrl]);

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-6 md:p-8">
      <h1 className="text-4xl font-semibold tracking-tight">Settings</h1>

      <section className="rounded-xl border border-border p-5 flex flex-col gap-4">
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm font-medium">App version</h2>
          <p className="text-sm text-muted-foreground">
            Compared with the latest release on GitHub.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm sm:max-w-md">
            <dt className="text-muted-foreground">Current</dt>
            <dd className="font-mono tabular-nums">
              {updateLoading ? "…" : (updateCheck?.currentVersion ?? "—")}
            </dd>
            <dt className="text-muted-foreground">Latest</dt>
            <dd className="font-mono tabular-nums">
              {updateLoading ? "…" : (updateCheck?.latestVersion ?? "—")}
            </dd>
          </dl>

          <Button
            type="button"
            className="sm:shrink-0 w-full sm:w-auto"
            disabled={updateLoading || !updateCheck?.updateAvailable || !updateCheck.releaseUrl}
            onClick={onUpdateClick}
          >
            Update
          </Button>
        </div>

        {updateCheck?.error && (
          <p className="text-sm text-destructive" role="alert">
            Could not check for updates ({updateCheck.error}).
          </p>
        )}
      </section>

      <section className="rounded-xl border border-border p-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm font-medium">Watch history</h2>
          <p className="text-sm text-muted-foreground">
            Clear saved playback progress for Continue watching on this device.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="sm:shrink-0 w-full sm:w-auto text-destructive hover:text-destructive border-destructive/40 hover:bg-destructive/10"
          disabled={watchHistoryLoading || !hasWatchHistory || clearHistoryBusy}
          onClick={() => {
            void onClearWatchHistory();
          }}
        >
          Clear history
        </Button>
      </section>

      <section className="rounded-xl border border-border p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 min-w-0">
          <h2 className="text-sm font-medium">Theme</h2>
          <p className="text-sm text-muted-foreground">Light, dark, or match your system.</p>
        </div>
        <ThemePicker className="sm:shrink-0" />
      </section>
    </div>
  );
}
