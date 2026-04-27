import React, { useCallback, useEffect, useState } from "react";

import { ThemePicker } from "@/renderer/components/theme-picker";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import type { AppUpdateCheckResult } from "@/shared/app-update-types";
import type { AniListIntegrationStatus, StreamProvider } from "@/shared/types";

function openExternalUrl(url: string) {
  if (window.urlOpener) {
    void window.urlOpener.openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function SettingsPage() {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const [updateCheck, setUpdateCheck] = useState<AppUpdateCheckResult | null>(null);
  const [updateLoading, setUpdateLoading] = useState(true);
  const [watchHistoryLoading, setWatchHistoryLoading] = useState(true);
  const [hasWatchHistory, setHasWatchHistory] = useState(false);
  const [clearHistoryBusy, setClearHistoryBusy] = useState(false);
  const [anilistStatus, setAnilistStatus] = useState<AniListIntegrationStatus | null>(null);
  const [anilistStatusLoading, setAnilistStatusLoading] = useState(true);
  const [anilistConnectBusy, setAnilistConnectBusy] = useState(false);
  const [anilistDisconnectBusy, setAnilistDisconnectBusy] = useState(false);
  const [anilistError, setAnilistError] = useState<string | null>(null);
  const [anilistPinToken, setAnilistPinToken] = useState("");
  const [anilistPinOpenBusy, setAnilistPinOpenBusy] = useState(false);
  const [anilistPinSubmitBusy, setAnilistPinSubmitBusy] = useState(false);
  const [activeStreamProvider, setActiveStreamProvider] = useState<StreamProvider>("animepahe");
  const [streamProviderLoading, setStreamProviderLoading] = useState(true);
  const [streamProviderBusy, setStreamProviderBusy] = useState(false);

  useEffect(() => {
    if (!isDevelopment) {
      setStreamProviderLoading(false);
      return;
    }

    let cancelled = false;
    void window.streamProvider
      .getActiveProvider()
      .then((provider) => {
        if (!cancelled) {
          setActiveStreamProvider(provider);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setStreamProviderLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDevelopment]);

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
    void window.recentlyWatched
      .read()
      .then((entries) => {
        if (!cancelled) {
          setHasWatchHistory(entries.length > 0);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setWatchHistoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshAnilistStatus = useCallback(async () => {
    setAnilistStatusLoading(true);
    try {
      const s = await window.anilist.getStatus();
      setAnilistStatus(s);
      setAnilistError(null);
    } finally {
      setAnilistStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDevelopment) {
      setAnilistStatusLoading(false);
      return;
    }

    void refreshAnilistStatus();
  }, [isDevelopment, refreshAnilistStatus]);

  const onAnilistConnect = useCallback(async () => {
    setAnilistConnectBusy(true);
    setAnilistError(null);
    try {
      const result = await window.anilist.connect();
      if (result.ok) {
        await refreshAnilistStatus();
      } else {
        const { error } = result as { ok: false; error: string };
        setAnilistError(error);
      }
    } finally {
      setAnilistConnectBusy(false);
    }
  }, [refreshAnilistStatus]);

  const onAnilistOpenPinAuth = useCallback(async () => {
    setAnilistPinOpenBusy(true);
    setAnilistError(null);
    try {
      await window.anilist.openPinAuthPage();
    } catch (e) {
      setAnilistError(e instanceof Error ? e.message : "Could not open AniList.");
    } finally {
      setAnilistPinOpenBusy(false);
    }
  }, []);

  const onAnilistSubmitPinToken = useCallback(async () => {
    setAnilistPinSubmitBusy(true);
    setAnilistError(null);
    try {
      const result = await window.anilist.submitManualToken(anilistPinToken);
      if (result.ok) {
        setAnilistPinToken("");
        await refreshAnilistStatus();
      } else {
        const { error } = result as { ok: false; error: string };
        setAnilistError(error);
      }
    } finally {
      setAnilistPinSubmitBusy(false);
    }
  }, [anilistPinToken, refreshAnilistStatus]);

  const onAnilistDisconnect = useCallback(async () => {
    setAnilistDisconnectBusy(true);
    setAnilistError(null);
    try {
      await window.anilist.disconnect();
      await refreshAnilistStatus();
    } finally {
      setAnilistDisconnectBusy(false);
    }
  }, [refreshAnilistStatus]);

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

  const onStreamProviderChange = useCallback(async (provider: StreamProvider) => {
    setStreamProviderBusy(true);
    try {
      const next = await window.streamProvider.setActiveProvider(provider);
      setActiveStreamProvider(next);
    } finally {
      setStreamProviderBusy(false);
    }
  }, []);

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

      {isDevelopment && (
        <section className="rounded-xl border border-border p-5 flex flex-col gap-6">
          <div className="space-y-1 min-w-0">
            <h2 className="text-sm font-medium">Integrations</h2>
            <p className="text-sm text-muted-foreground">
              Connect third-party services. More providers will appear here over time.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1 min-w-0 max-w-xl">
              <h3 className="text-sm font-medium">AniList</h3>
              <p className="text-sm text-muted-foreground">
                {anilistStatusLoading
                  ? "…"
                  : anilistStatus?.connected && anilistStatus.username
                    ? `Signed in as ${anilistStatus.username}.`
                    : "Not connected."}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end sm:shrink-0 w-full sm:w-auto">
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  disabled={
                    anilistStatusLoading ||
                    anilistConnectBusy ||
                    anilistDisconnectBusy ||
                    Boolean(anilistStatus?.connected)
                  }
                  onClick={() => {
                    void onAnilistConnect();
                  }}
                >
                  {anilistConnectBusy ? "Connecting…" : "Connect"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={
                    anilistStatusLoading ||
                    anilistConnectBusy ||
                    anilistDisconnectBusy ||
                    !anilistStatus?.connected
                  }
                  onClick={() => {
                    void onAnilistDisconnect();
                  }}
                >
                  {anilistDisconnectBusy ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            </div>
          </div>

          {anilistError && (
            <p className="text-sm text-destructive" role="alert">
              {anilistError}
            </p>
          )}

          <div className="border-t border-border pt-4 flex flex-col gap-3">
            <div className="space-y-1 min-w-0 max-w-xl">
              <h4 className="text-sm font-medium">Pin fallback</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                If custom URL sign-in does not work, set your AniList client&apos;s redirect URL to{" "}
                <code className="font-mono text-[0.8rem]">https://anilist.co/api/v2/oauth/pin</code>
                , open AniList below, then paste the access token shown on the pin page.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto shrink-0"
                disabled={
                  anilistStatusLoading ||
                  anilistConnectBusy ||
                  anilistDisconnectBusy ||
                  anilistPinOpenBusy ||
                  anilistPinSubmitBusy ||
                  Boolean(anilistStatus?.connected)
                }
                onClick={() => {
                  void onAnilistOpenPinAuth();
                }}
              >
                {anilistPinOpenBusy ? "Opening…" : "Open AniList (pin)"}
              </Button>
              <div className="flex flex-1 flex-col gap-2 min-w-0 sm:min-w-[240px] sm:max-w-md">
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste access token"
                  value={anilistPinToken}
                  disabled={
                    anilistStatusLoading ||
                    anilistConnectBusy ||
                    anilistDisconnectBusy ||
                    anilistPinSubmitBusy ||
                    Boolean(anilistStatus?.connected)
                  }
                  onChange={(e) => {
                    setAnilistPinToken(e.target.value);
                  }}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto shrink-0"
                disabled={
                  anilistStatusLoading ||
                  anilistConnectBusy ||
                  anilistDisconnectBusy ||
                  anilistPinSubmitBusy ||
                  !anilistPinToken.trim() ||
                  Boolean(anilistStatus?.connected)
                }
                onClick={() => {
                  void onAnilistSubmitPinToken();
                }}
              >
                {anilistPinSubmitBusy ? "Saving…" : "Save token"}
              </Button>
            </div>
          </div>

          <div className="border-t border-border pt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 min-w-0">
              <h3 className="text-sm font-medium text-muted-foreground">MyAnimeList</h3>
              <p className="text-sm text-muted-foreground">Coming soon.</p>
            </div>
          </div>
        </section>
      )}

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
          <h2 className="text-sm font-medium">Streaming provider</h2>
          <p className="text-sm text-muted-foreground">
            Choose which upstream source is used for search, episodes, and playback.
          </p>
        </div>
        <Select
          value={activeStreamProvider}
          onValueChange={(value) => {
            if (value === "allanime" || value === "animepahe") {
              void onStreamProviderChange(value);
            }
          }}
          disabled={streamProviderLoading || streamProviderBusy}
        >
          <SelectTrigger className="sm:shrink-0 w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="allanime">AllAnime</SelectItem>
            <SelectItem value="animepahe">AnimePahe</SelectItem>
          </SelectContent>
        </Select>
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
