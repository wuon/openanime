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
import { ShowDetails } from "@/shared/types";

/** How many automatic reconnects after a playback error before showing the manual overlay. */
const MAX_AUTO_RECONNECT = 5;

interface WatchState {
  anime: { id: string; providerId: string; name: string; mode: "sub" | "dub" };
  episodes: string[];
  currentEpisode: string;
  /** When true, open on the latest episode (e.g. from recently uploaded tile) */
  preferLatest?: boolean;
}

export function WatchPage() {
  const location = useLocation();
  const goBack = useGoBack();
  const state = location.state as WatchState | null;

  const [playUrl, setPlayUrl] = useState<string>("");
  /** Bumps when a new stream URL is ready so the <video> remounts (retry after errors). */
  const [streamRevision, setStreamRevision] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [details, setDetails] = useState<ShowDetails | null>(null);
  const [, setLoading] = useState(true);
  const [loadingEpisode, setLoadingEpisode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anime = state?.anime;
  const [episodes, setEpisodes] = useState<string[]>(() => state?.episodes ?? []);
  const initialEpisode = state?.currentEpisode ?? episodes[0] ?? "";

  const [currentEpisode, setCurrentEpisode] = useState<string>(initialEpisode);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  /** Seconds to seek to after the next successful load (set before reload). */
  const resumeAfterLoadRef = useRef<number | null>(null);
  /** Last known position when playback failed (for manual retry after overlay). */
  const lastPlaybackTimeRef = useRef<number | null>(null);
  const autoReconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current != null) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const loadStream = useCallback(
    async (ep: string, opts?: { resumeFrom?: number | null }) => {
      if (!anime?.providerId || !ep) return;
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
          anime.id,
          anime.providerId,
          ep,
          anime.mode
        );
        const base = await window.streamProvider.getStreamProxyBaseUrl();
        const urlWithProxy = `${base}/stream?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
        setPlayUrl(urlWithProxy);
        setStreamRevision((r) => r + 1);
        setCurrentEpisode(ep);
        try {
          await window.recentlyWatched.record(anime.id, anime.providerId, ep, anime.mode);
        } catch {
          // Ignore - recording is best-effort
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stream");
      } finally {
        setLoadingEpisode(false);
      }
    },
    [anime, clearReconnectTimeout]
  );

  useEffect(() => {
    return () => {
      clearReconnectTimeout();
    };
  }, [clearReconnectTimeout]);

  useEffect(() => {
    if (!state?.anime) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const initialEpisodes = state.episodes ?? [];
    void Promise.all([
      window.streamProvider.getShowDetails(state.anime.providerId),
      initialEpisodes.length === 0
        ? window.streamProvider.getEpisodes(state.anime.providerId, state.anime.mode)
        : Promise.resolve(initialEpisodes),
    ])
      .then(async ([d, epList]) => {
        if (cancelled) return;
        setDetails(d);

        let episodesToUse = initialEpisodes;
        if (initialEpisodes.length === 0 && Array.isArray(epList)) {
          episodesToUse = epList;
          setEpisodes(epList);
        }

        const fallbackEpisode = episodesToUse[0] ?? "";
        const preferredEpisode =
          state.preferLatest && episodesToUse.length > 0
            ? episodesToUse[episodesToUse.length - 1]
            : state.currentEpisode || fallbackEpisode;

        if (!preferredEpisode) return;
        setCurrentEpisode(preferredEpisode);
        await loadStream(preferredEpisode);
      })
      .catch(() => {
        if (!cancelled)
          setDetails({
            id: state.anime.id,
            providerId: state.anime.providerId,
            name: state.anime.name,
            thumbnail: null,
            type: "TV",
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    state?.anime?.id,
    state?.anime?.providerId,
    state?.anime?.name,
    state?.anime?.mode,
    state?.episodes,
    state?.currentEpisode,
    state?.preferLatest,
    loadStream,
  ]);

  const onEpisodeSelect = useCallback(
    (ep: string) => {
      setCurrentEpisode(ep);
      void loadStream(ep);
    },
    [loadStream]
  );

  const retryStream = useCallback(() => {
    if (!currentEpisode) return;
    clearReconnectTimeout();
    autoReconnectAttemptRef.current = 0;
    const el = videoRef.current;
    const fromVideo =
      el && !Number.isNaN(el.currentTime) && el.currentTime > 0 ? el.currentTime : null;
    const resumeFrom = fromVideo ?? lastPlaybackTimeRef.current ?? undefined;
    setPlayUrl("");
    setPlaybackError(null);
    setError(null);
    void loadStream(currentEpisode, resumeFrom != null ? { resumeFrom } : undefined);
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
        void loadStream(ep, t > 0 ? { resumeFrom: t } : undefined);
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

  if (!state?.anime) {
    return (
      <div className="container flex flex-col items-center justify-center gap-4 p-8">
        <p className="text-muted-foreground">
          No anime selected. Go back and pick an episode to play.
        </p>
        <Button type="button" variant="outline" onClick={goBack}>
          Go back
        </Button>
      </div>
    );
  }

  const displayName = details?.name ?? anime.name;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="sticky top-12 z-10 flex items-center gap-3 px-4 py-2 border-b border-border shrink-0 bg-background">
        <Button type="button" variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {displayName} ({anime.mode === "dub" ? "Dub" : "Sub"})
        </span>

        <div className="flex items-center gap-2 shrink-0">
          <Select value={currentEpisode} onValueChange={onEpisodeSelect} disabled={loadingEpisode}>
            <SelectTrigger className="w-[120px] bg-background h-8">
              <SelectValue placeholder="Episode" />
            </SelectTrigger>
            <SelectContent>
              {episodes.map((ep) => (
                <SelectItem key={ep} value={ep}>
                  Episode {ep}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Video player - fixed 16:9 area, centered */}
      <div className="w-full flex items-center justify-center shrink-0 p-8">
        <div className="w-full max-w-5xl px-4">
          <div className="relative w-full aspect-video bg-black rounded-md overflow-hidden flex items-center justify-center">
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
              <div className="relative h-full w-full">
                <video
                  ref={videoRef}
                  key={streamRevision}
                  className="h-full w-full object-contain bg-black"
                  controls
                  autoPlay
                  playsInline
                  src={playUrl}
                  onLoadedMetadata={(e) => {
                    applyResumeIfNeeded(e.currentTarget);
                  }}
                  onPlaying={handleVideoPlaying}
                  onError={handleVideoError}
                />
                {playbackError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center">
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
        </div>
      </div>
    </div>
  );
}
