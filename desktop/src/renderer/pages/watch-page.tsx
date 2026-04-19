import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { Button } from "@/renderer/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/renderer/components/ui/select";
import { useGoBack } from "@/renderer/hooks/use-go-back";
import { cn } from "@/renderer/lib/utils";
import type { Episode, HistoryEntry } from "@/shared/types";

import { type RichShowDetails, useShowDetails } from "../hooks/use-show-details";

/** How many automatic reconnects after a playback error before showing the manual overlay. */
const MAX_AUTO_RECONNECT = 5;

/** Time after last pointer activity before hiding the top chrome (back, title, episode). */
const CHROME_HIDE_AFTER_MS = 2800;

const watchEpisodeSelectTriggerClass =
  "h-8 w-[120px] border-white/25 bg-white/[0.12] text-white shadow-sm backdrop-blur-xl ring-offset-0 ring-offset-transparent placeholder:text-white/55 focus:ring-2 focus:ring-white/30 focus:ring-offset-0 hover:bg-white/[0.18] [&>svg]:text-white/75";

const watchEpisodeSelectContentClass =
  "z-[120] max-h-[min(24rem,70vh)] rounded-xl border border-white/20 bg-black/50 p-1 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl";

const watchEpisodeSelectItemClass =
  "rounded-lg py-2 pl-8 pr-2 text-white/95 cursor-pointer focus:bg-white/[0.14] focus:text-white data-[highlighted]:bg-white/[0.14] data-[highlighted]:text-white data-[state=checked]:bg-white/[0.08]";

function buildWatchHistoryEntry(
  episode: Episode,
  ep: string,
  showDetails: RichShowDetails | null
): HistoryEntry {
  const index = Number(ep);
  const mode = episode.mode;
  const richList = showDetails?.episodes[mode] ?? [];
  const rich = richList.find((e) => e.index === index);
  const thumb =
    rich?.thumbnail ?? showDetails?.coverImage ?? showDetails?.bannerImage ?? episode.thumbnail;

  return {
    id: `${episode.id}-${ep}`,
    provider: "allanime",
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
}

export function WatchPage() {
  const location = useLocation();
  const goBack = useGoBack();
  const state = location.state as WatchState | null;
  const resumeFromMs = state?.resumeFromMs;

  const [playUrl, setPlayUrl] = useState<string>("");
  /** Bumps when a new stream URL is ready so the <video> remounts (retry after errors). */
  const [streamRevision, setStreamRevision] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [loadingEpisode, setLoadingEpisode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const episode = state?.episode;

  const {
    details: showDetails,
    loading: showLoading,
    error: showError,
  } = useShowDetails(episode?.id, episode?.providerId);

  const episodes = episode && showDetails ? (showDetails.episodes[episode.mode] ?? []) : [];

  const [currentEpisode, setCurrentEpisode] = useState<number>(() => episode?.index ?? 1);
  /** Hidden after playback is ready until the first pointer move (see playUrl effect). */
  const [chromeVisible, setChromeVisible] = useState(true);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const chromeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHistoryEntryRef = useRef<HistoryEntry | null>(null);
  /** Seconds to seek to after the next successful load (set before reload). */
  const resumeAfterLoadRef = useRef<number | null>(null);
  /** Last known position when playback failed (for manual retry after overlay). */
  const lastPlaybackTimeRef = useRef<number | null>(null);
  const autoReconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Stream revision when load succeeded; upsert runs after show details finish loading. */
  const deferredHistoryUpsertRef = useRef<{ revision: number; ep: string } | null>(null);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current != null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const syncHistoryProgress = useCallback(async () => {
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
      await window.recentlyWatched.upsert(next);
    } catch {
      // best-effort
    }
  }, []);

  const loadStream = useCallback(
    async (ep: string, opts?: { resumeFrom?: number | null }) => {
      if (!episode?.providerId || !ep) return;
      lastHistoryEntryRef.current = null;
      clearReconnectTimeout();
      if (opts?.resumeFrom != null && opts.resumeFrom > 0) {
        resumeAfterLoadRef.current = opts.resumeFrom;
      } else {
        resumeAfterLoadRef.current = null;
      }
      setLoadingEpisode(true);
      setError(null);
      setPlaybackError(null);
      try {
        const { url, referer } = await window.streamProvider.getStreamUrl(
          episode.id,
          episode.providerId,
          ep,
          episode.mode
        );
        const base = await window.streamProvider.getStreamProxyBaseUrl();
        const urlWithProxy = `${base}/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
        setPlayUrl(urlWithProxy);
        setStreamRevision((r) => {
          const next = r + 1;
          deferredHistoryUpsertRef.current = { revision: next, ep };
          return next;
        });
        setCurrentEpisode(Number(ep));
        lastHistoryEntryRef.current = buildWatchHistoryEntry(episode, ep, null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stream");
      } finally {
        setLoadingEpisode(false);
      }
    },
    [episode, clearReconnectTimeout]
  );

  useEffect(() => {
    if (!episode) return;
    setCurrentEpisode(episode.index);
  }, [episode?.id, episode?.providerId, episode?.index, episode?.mode]);

  useEffect(() => {
    if (!episode) return;
    const resumeFrom =
      resumeFromMs != null && resumeFromMs > 0 ? resumeFromMs / 1000 : undefined;
    void loadStream(
      String(episode.index),
      resumeFrom != null ? { resumeFrom } : undefined
    );
  }, [episode?.id, episode?.providerId, episode?.index, episode?.mode, loadStream, resumeFromMs]);

  useEffect(() => {
    if (showLoading || !episode || !playUrl) return;
    const pending = deferredHistoryUpsertRef.current;
    if (!pending || pending.revision !== streamRevision) return;

    const prev = lastHistoryEntryRef.current;
    const entry = buildWatchHistoryEntry(episode, pending.ep, showDetails);
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
    };
  }, [clearReconnectTimeout]);

  const onEpisodeSelect = useCallback(
    (ep: string) => {
      setCurrentEpisode(Number(ep));
      void loadStream(ep);
    },
    [loadStream]
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
    const el = videoRef.current;
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
  }, [clearReconnectTimeout, currentEpisode, loadStream]);

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
  }, []);

  const clearChromeHideTimer = useCallback(() => {
    if (chromeHideTimerRef.current != null) {
      clearTimeout(chromeHideTimerRef.current);
      chromeHideTimerRef.current = null;
    }
  }, []);

  const scheduleChromeHide = useCallback(() => {
    clearChromeHideTimer();
    chromeHideTimerRef.current = setTimeout(() => {
      chromeHideTimerRef.current = null;
      setChromeVisible(false);
    }, CHROME_HIDE_AFTER_MS);
  }, [clearChromeHideTimer]);

  const onWatchShellPointerActivity = useCallback(() => {
    setChromeVisible(true);
    if (playUrl && !playbackError) {
      scheduleChromeHide();
    } else {
      clearChromeHideTimer();
    }
  }, [playUrl, playbackError, scheduleChromeHide, clearChromeHideTimer]);

  useEffect(() => {
    if (!playUrl || playbackError) {
      clearChromeHideTimer();
      setChromeVisible(true);
      return;
    }
    clearChromeHideTimer();
    setChromeVisible(false);
    return () => {
      clearChromeHideTimer();
    };
  }, [playUrl, playbackError, clearChromeHideTimer]);

  useEffect(() => {
    return () => {
      void syncHistoryProgress();
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
    <div
      className="relative flex flex-1 flex-col min-h-0 h-full w-full bg-black overflow-hidden"
      onMouseMove={onWatchShellPointerActivity}
      onPointerDown={onWatchShellPointerActivity}
    >
      <div className="absolute inset-0 z-0 flex items-center justify-center min-h-0">
        {loadingEpisode && !playUrl ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin" />
            <span className="text-sm">Loading stream…</span>
          </div>
        ) : error && !playUrl ? (
          <div className="flex flex-col items-center gap-3 text-destructive px-4 text-center">
            <span className="text-sm">{error}</span>
            <Button type="button" variant="secondary" size="sm" onClick={retryStream}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : playUrl ? (
          <div className="relative h-full w-full min-h-0">
            <video
              ref={videoRef}
              key={streamRevision}
              className="absolute inset-0 h-full w-full object-contain bg-black"
              controls
              autoPlay
              playsInline
              src={playUrl}
              onLoadedMetadata={(e) => {
                applyResumeIfNeeded(e.currentTarget);
                void syncHistoryProgress();
              }}
              onPause={() => {
                void syncHistoryProgress();
              }}
              onEnded={() => {
                void syncHistoryProgress();
              }}
              onPlaying={handleVideoPlaying}
              onError={handleVideoError}
            />
            {playbackError ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center">
                <p className="text-sm text-white/90 max-w-md">{playbackError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loadingEpisode}
                  onClick={retryStream}
                >
                  {loadingEpisode ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Reload stream
                    </>
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground px-4 text-center">
            <span className="text-sm">Select an episode to play</span>
          </div>
        )}
      </div>

      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/80 via-black/45 to-transparent text-white transition-opacity duration-200",
          chromeVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={goBack}
          aria-label="Back"
          className="text-white hover:bg-white/15 hover:text-white shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {showLoading && !showDetails ? (
            <span className="inline-flex items-center gap-2 text-white/80 font-normal">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Loading show…
            </span>
          ) : (
            `${displayName} (${episode.mode === "dub" ? "Dub" : "Sub"})`
          )}
        </span>
        {showError && !showDetails ? (
          <span
            className="text-xs text-red-300 shrink-0 max-w-[200px] truncate"
            title={showError}
          >
            {showError}
          </span>
        ) : null}

        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={currentEpisode.toString()}
            onValueChange={onEpisodeSelect}
            disabled={loadingEpisode || showLoading}
          >
            <SelectTrigger className={watchEpisodeSelectTriggerClass}>
              <SelectValue placeholder="Episode" />
            </SelectTrigger>
            <SelectContent className={watchEpisodeSelectContentClass}>
              {episodes.map((ep) => (
                <SelectItem key={ep.index} value={ep.index.toString()} className={watchEpisodeSelectItemClass}>
                  Episode {ep.index}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
