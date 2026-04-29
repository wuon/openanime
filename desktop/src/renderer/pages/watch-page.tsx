import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { WatchVideoPlayerShell } from "@/renderer/components/player/watch-video-player-shell";
import { Button } from "@/renderer/components/ui/button";
import { useGoBack } from "@/renderer/hooks/use-go-back";
import type { Episode, HistoryEntry } from "@/shared/types";

import { type RichShowDetails, useShowDetails } from "../hooks/use-show-details";

/** How many automatic reconnects after a playback error before showing the manual overlay. */
const MAX_AUTO_RECONNECT = 5;
const PERIODIC_HISTORY_SYNC_MS = 10_000;

const IS_DEV = process.env.NODE_ENV !== "production";
const ENABLE_HLS_SERVER_TRANSCODE = true;

function logPlaybackFailure(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.error(`[watch-playback] ${event}${suffix}`);
}

function shouldUseServerTranscode(streamUrl: string): boolean {
  if (!ENABLE_HLS_SERVER_TRANSCODE) return false;
  return /\.m3u8(?:$|\?)/i.test(streamUrl);
}

function buildWatchHistoryEntry(
  episode: Episode,
  ep: string,
  provider: HistoryEntry["provider"],
  showDetails: RichShowDetails | null
): HistoryEntry {
  const index = Number(ep);
  const mode = episode.mode;
  const richList = showDetails?.episodes[mode] ?? [];
  const rich = richList.find((e) => e.index === index);
  const thumb =
    rich?.thumbnail ?? showDetails?.coverImage ?? showDetails?.bannerImage ?? episode.thumbnail;

  return {
    id: `${provider}:${episode.id}-${ep}`,
    provider,
    episode: {
      ...episode,
      index,
      title: {
        english: showDetails?.title.english ?? episode.title.english,
        romanji: showDetails?.title.romaji ?? episode.title.romanji,
        native: showDetails?.title.native ?? episode.title.native,
      },
      thumbnail: thumb,
    },
    currentDurationMs: 0,
    totalDurationMs: 0,
    timestamp: Date.now(),
  };
}

interface WatchState {
  episode: Episode;
  /** Saved position from Continue watching (ms). */
  resumeFromMs?: number;
  /** Optional stream provider override for this watch session only. */
  providerOverride?: HistoryEntry["provider"];
}

interface TranscodeProgressInfo {
  state: "idle" | "running" | "done" | "error";
  progressPercent: number | null;
  message: string;
}

export function WatchPage() {
  const location = useLocation();
  const goBack = useGoBack();
  const state = location.state as WatchState | null;
  const resumeFromMs = state?.resumeFromMs;
  const streamProviderOverride = state?.providerOverride;

  const [playUrl, setPlayUrl] = useState<string>("");
  /** Bumps when a new stream URL is ready so the <video> remounts (retry after errors). */
  const [streamRevision, setStreamRevision] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loadingEpisode, setLoadingEpisode] = useState(false);
  const [transcodeProgress, setTranscodeProgress] = useState<{
    active: boolean;
    progressPercent: number | null;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const episode = state?.episode;

  const {
    details: showDetails,
    episodesByMode,
    loading: showLoading,
    error: showError,
  } = useShowDetails(episode?.id, episode?.providerId, streamProviderOverride);

  const episodes = useMemo(() => {
    if (!episode) return [];
    const richEpisodes = showDetails?.episodes[episode.mode] ?? [];
    if (richEpisodes.length > 0) return richEpisodes;

    const rawState = episodesByMode[episode.mode];
    if (rawState.status !== "loaded") return [];
    return rawState.episodes.map((rawEpisode, idx) => {
      const parsed = Number(rawEpisode);
      return { index: Number.isFinite(parsed) ? parsed : idx + 1 };
    });
  }, [episode, showDetails, episodesByMode]);

  const [currentEpisode, setCurrentEpisode] = useState<number>(() => episode?.index ?? 1);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastHistoryEntryRef = useRef<HistoryEntry | null>(null);
  /** Seconds to seek to after the next successful load (set before reload). */
  const resumeAfterLoadRef = useRef<number | null>(null);
  /** Last known position when playback failed (for manual retry after overlay). */
  const lastPlaybackTimeRef = useRef<number | null>(null);
  const autoReconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historySyncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historySyncInFlightRef = useRef(false);
  /** Stream revision when load succeeded; upsert runs after show details finish loading. */
  const deferredHistoryUpsertRef = useRef<{ revision: number; ep: string } | null>(null);
  const activeLoadTokenRef = useRef(0);
  const historyProviderRef = useRef<HistoryEntry["provider"]>("allanime");

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current != null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const syncHistoryProgress = useCallback(async (opts?: { sync?: boolean }) => {
    if (deferredHistoryUpsertRef.current != null) return;
    const base = lastHistoryEntryRef.current;
    const video = videoRef.current;
    if (!base || !video) return;
    const currentMs = Math.max(0, Math.floor(video.currentTime * 1000));
    let totalMs = base.totalDurationMs;
    if (Number.isFinite(video.duration) && video.duration > 0) {
      totalMs = Math.floor(video.duration * 1000);
    }
    const next: HistoryEntry = {
      ...base,
      currentDurationMs: currentMs,
      totalDurationMs: totalMs,
      timestamp: Date.now(),
    };
    lastHistoryEntryRef.current = next;
    try {
      if (opts?.sync) {
        window.recentlyWatched.upsertSync(next);
        return;
      }
      await window.recentlyWatched.upsert(next);
    } catch {
      // best-effort
    }
  }, []);

  const stopPeriodicHistorySync = useCallback(() => {
    if (historySyncIntervalRef.current != null) {
      clearInterval(historySyncIntervalRef.current);
      historySyncIntervalRef.current = null;
    }
  }, []);

  const triggerPeriodicHistorySync = useCallback(async () => {
    if (historySyncInFlightRef.current) return;
    historySyncInFlightRef.current = true;
    try {
      await syncHistoryProgress();
    } finally {
      historySyncInFlightRef.current = false;
    }
  }, [syncHistoryProgress]);

  const startPeriodicHistorySync = useCallback(() => {
    stopPeriodicHistorySync();
    historySyncIntervalRef.current = setInterval(() => {
      void triggerPeriodicHistorySync();
    }, PERIODIC_HISTORY_SYNC_MS);
  }, [stopPeriodicHistorySync, triggerPeriodicHistorySync]);

  const applyResumeIfNeeded = useCallback((video: HTMLVideoElement) => {
    const resume = resumeAfterLoadRef.current;
    if (resume == null || resume <= 0 || Number.isNaN(resume)) return;
    resumeAfterLoadRef.current = null;
    const dur = video.duration;
    let target = resume;
    if (Number.isFinite(dur) && dur > 0) {
      target = Math.min(resume, Math.max(0, dur - 0.25));
    }
    video.currentTime = Math.max(0, target);
  }, []);

  const handleVideoPlaying = useCallback(() => {
    autoReconnectAttemptRef.current = 0;
    startPeriodicHistorySync();
  }, [startPeriodicHistorySync]);

  const handleVideoPause = useCallback(() => {
    stopPeriodicHistorySync();
    void syncHistoryProgress();
  }, [stopPeriodicHistorySync, syncHistoryProgress]);

  const handleVideoEnded = useCallback(() => {
    stopPeriodicHistorySync();
    void syncHistoryProgress();
  }, [stopPeriodicHistorySync, syncHistoryProgress]);

  const loadStream = useCallback(
    async (ep: string, opts?: { resumeFrom?: number | null }) => {
      if (!episode?.providerId || !ep) return;
      activeLoadTokenRef.current += 1;
      const loadToken = activeLoadTokenRef.current;
      setCurrentEpisode(Number(ep));
      setPlayUrl("");
      lastHistoryEntryRef.current = null;
      clearReconnectTimeout();
      stopPeriodicHistorySync();
      if (opts?.resumeFrom != null && opts.resumeFrom > 0) {
        resumeAfterLoadRef.current = opts.resumeFrom;
      } else {
        resumeAfterLoadRef.current = null;
      }
      setLoadingEpisode(true);
      setTranscodeProgress(null);
      setError(null);
      setPlaybackError(null);
      try {
        const { url, referer } = await window.streamProvider.getStreamUrl(
          episode.id,
          episode.providerId,
          ep,
          episode.mode,
          streamProviderOverride
        );
        historyProviderRef.current =
          streamProviderOverride ?? (await window.streamProvider.getActiveProvider());
        const base = await window.streamProvider.getStreamProxyBaseUrl();
        const shouldTranscode = shouldUseServerTranscode(url);
        if (shouldTranscode) {
          const streamProvider = window.streamProvider as {
            getTranscodeProgress: (targetUrl: string) => Promise<TranscodeProgressInfo>;
            prepareTranscodedStream: (
              targetUrl: string,
              streamReferer: string | null
            ) => Promise<boolean>;
          };
          setTranscodeProgress({
            active: true,
            progressPercent: 0,
            message: "Preparing video for playback...",
          });

          let stopPolling = false;
          const pollProgress = async () => {
            try {
              const next = await streamProvider.getTranscodeProgress(url);
              if (stopPolling || activeLoadTokenRef.current !== loadToken) return;
              setTranscodeProgress({
                active: next.state === "running" || next.state === "idle",
                progressPercent: next.progressPercent,
                message: next.message || "Transcoding video...",
              });
            } catch {
              // best-effort
            }
          };

          await pollProgress();
          const progressInterval = setInterval(() => {
            void pollProgress();
          }, 500);
          try {
            await streamProvider.prepareTranscodedStream(url, referer);
          } finally {
            stopPolling = true;
            clearInterval(progressInterval);
          }
          if (activeLoadTokenRef.current !== loadToken) return;
          setTranscodeProgress({
            active: false,
            progressPercent: 100,
            message: "Transcode complete",
          });
        }

        const transcodeParam = shouldTranscode ? "&transcode=1" : "";
        const urlWithProxy = `${base}/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}${transcodeParam}`;
        if (activeLoadTokenRef.current !== loadToken) return;
        setPlayUrl(urlWithProxy);
        setStreamRevision((r) => {
          const next = r + 1;
          deferredHistoryUpsertRef.current = { revision: next, ep };
          return next;
        });
        lastHistoryEntryRef.current = buildWatchHistoryEntry(
          episode,
          ep,
          historyProviderRef.current,
          null
        );
      } catch (err) {
        if (activeLoadTokenRef.current !== loadToken) return;
        setError(err instanceof Error ? err.message : "Failed to load stream");
      } finally {
        if (activeLoadTokenRef.current === loadToken) {
          setLoadingEpisode(false);
          setTranscodeProgress(null);
        }
      }
    },
    [episode, clearReconnectTimeout, stopPeriodicHistorySync, streamProviderOverride]
  );

  useEffect(() => {
    if (!episode) return;
    setCurrentEpisode(episode.index);
  }, [episode?.id, episode?.providerId, episode?.index, episode?.mode]);

  useEffect(() => {
    if (!episode) return;
    const resumeFrom = resumeFromMs != null && resumeFromMs > 0 ? resumeFromMs / 1000 : undefined;
    void loadStream(String(episode.index), resumeFrom != null ? { resumeFrom } : undefined);
  }, [episode?.id, episode?.providerId, episode?.index, episode?.mode, loadStream, resumeFromMs]);

  useEffect(() => {
    if (showLoading || !episode || !playUrl) return;
    const pending = deferredHistoryUpsertRef.current;
    if (!pending || pending.revision !== streamRevision) return;

    const prev = lastHistoryEntryRef.current;
    const entry = buildWatchHistoryEntry(
      episode,
      pending.ep,
      historyProviderRef.current,
      showDetails
    );
    const video = videoRef.current;
    if (video && !Number.isNaN(video.currentTime) && video.currentTime > 0) {
      entry.currentDurationMs = Math.max(
        entry.currentDurationMs,
        Math.floor(video.currentTime * 1000)
      );
    }
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      entry.totalDurationMs = Math.floor(video.duration * 1000);
    } else if (prev && prev.id === entry.id && prev.totalDurationMs > 0) {
      entry.totalDurationMs = prev.totalDurationMs;
    }
    lastHistoryEntryRef.current = entry;
    deferredHistoryUpsertRef.current = null;
    void window.recentlyWatched.upsert(entry).then(
      () => {
        void syncHistoryProgress();
      },
      () => {
        // best-effort
      }
    );
  }, [showLoading, showDetails, playUrl, episode, streamRevision, syncHistoryProgress]);

  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      stopPeriodicHistorySync();
    };
  }, [clearReconnectTimeout, stopPeriodicHistorySync]);

  const onEpisodeSelect = useCallback(
    (ep: string) => {
      setCurrentEpisode(Number(ep));
      void (async () => {
        await syncHistoryProgress();
        await loadStream(ep);
      })();
    },
    [loadStream, syncHistoryProgress]
  );

  const retryStream = useCallback(() => {
    if (!Number.isFinite(currentEpisode)) return;
    clearReconnectTimeout();
    autoReconnectAttemptRef.current = 0;
    const el = videoRef.current;
    const fromVideo =
      el && !Number.isNaN(el.currentTime) && el.currentTime > 0 ? el.currentTime : null;
    const resumeFrom = fromVideo ?? lastPlaybackTimeRef.current ?? undefined;
    setPlayUrl("");
    setPlaybackError(null);
    setError(null);
    void loadStream(currentEpisode.toString(), resumeFrom != null ? { resumeFrom } : undefined);
  }, [clearReconnectTimeout, currentEpisode, loadStream]);

  const handleVideoError = useCallback(() => {
    stopPeriodicHistorySync();
    const el = videoRef.current;
    const mediaError = el?.error;
    logPlaybackFailure("video-element-error", {
      currentTime: el?.currentTime ?? null,
      readyState: el?.readyState ?? null,
      networkState: el?.networkState ?? null,
      mediaErrorCode: mediaError?.code ?? null,
      mediaErrorMessage: mediaError?.message ?? null,
    });
    const t = el && !Number.isNaN(el.currentTime) && el.currentTime > 0 ? el.currentTime : 0;
    lastPlaybackTimeRef.current = t > 0 ? t : lastPlaybackTimeRef.current;

    const ep = currentEpisode;

    autoReconnectAttemptRef.current += 1;
    const n = autoReconnectAttemptRef.current;

    if (n <= MAX_AUTO_RECONNECT) {
      const delayMs = n === 1 ? 0 : Math.min(1000 * 2 ** (n - 2), 8000);
      clearReconnectTimeout();
      setPlayUrl("");
      setPlaybackError(null);
      const run = () => {
        void loadStream(ep.toString(), t > 0 ? { resumeFrom: t } : undefined);
      };
      if (delayMs === 0) {
        run();
      } else {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          run();
        }, delayMs);
      }
      return;
    }

    autoReconnectAttemptRef.current = 0;
    setPlaybackError(
      "Stream interrupted (e.g. network lost or server error). Reconnect automatically failed; try again or check your connection."
    );
  }, [clearReconnectTimeout, currentEpisode, loadStream, stopPeriodicHistorySync]);

  useEffect(() => {
    return () => {
      void syncHistoryProgress({ sync: true });
    };
  }, [syncHistoryProgress]);

  useEffect(() => {
    const flushSyncOnExit = () => {
      void syncHistoryProgress({ sync: true });
    };
    const flushAsyncOnHidden = () => {
      void syncHistoryProgress();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushAsyncOnHidden();
      }
    };
    window.addEventListener("beforeunload", flushSyncOnExit);
    window.addEventListener("pagehide", flushSyncOnExit);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flushSyncOnExit);
      window.removeEventListener("pagehide", flushSyncOnExit);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [syncHistoryProgress]);

  if (!episode) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 min-h-0">
        <p className="text-muted-foreground">
          No episode selected. Go back and pick an episode to play.
        </p>
        <Button type="button" variant="outline" onClick={goBack}>
          Go back
        </Button>
      </div>
    );
  }

  const displayName =
    showDetails?.title.english ??
    showDetails?.title.romaji ??
    showDetails?.title.native ??
    episode.title.english ??
    episode.title.romanji ??
    episode.title.native ??
    "Unknown";

  return (
    <WatchVideoPlayerShell
      playUrl={playUrl}
      streamRevision={streamRevision}
      loadingEpisode={loadingEpisode}
      transcodeProgress={transcodeProgress}
      streamError={error}
      playbackError={playbackError}
      displayName={displayName}
      isDub={episode.mode === "dub"}
      showLoading={showLoading}
      hasShowDetails={Boolean(showDetails)}
      showError={showError}
      currentEpisode={currentEpisode}
      episodes={episodes}
      videoRef={videoRef}
      onBack={goBack}
      onEpisodeSelect={onEpisodeSelect}
      onRetryStream={retryStream}
      onLoadedMetadata={(e) => {
        applyResumeIfNeeded(e.currentTarget);
        void syncHistoryProgress();
      }}
      onPause={handleVideoPause}
      onEnded={handleVideoEnded}
      onPlaying={handleVideoPlaying}
      onError={handleVideoError}
    />
  );
}
