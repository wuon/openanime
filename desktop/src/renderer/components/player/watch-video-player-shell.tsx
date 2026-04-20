import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { cn } from "@/renderer/lib/utils";

import { VideoJsReactPlayer } from "./videojs-react-player";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const watchEpisodeSelectTriggerClass =
  "h-8 w-[120px] border-white/25 bg-white/[0.12] text-white shadow-sm backdrop-blur-xl ring-offset-0 ring-offset-transparent placeholder:text-white/55 focus:ring-2 focus:ring-white/30 focus:ring-offset-0 hover:bg-white/[0.18] [&>svg]:text-white/75";

const watchEpisodeSelectContentClass =
  "z-[120] max-h-[min(24rem,70vh)] rounded-xl border border-white/20 bg-black/50 p-1 text-white shadow-2xl shadow-black/50 backdrop-blur-2xl";

const watchEpisodeSelectItemClass =
  "rounded-lg py-2 pl-8 pr-2 text-white/95 cursor-pointer focus:bg-white/[0.14] focus:text-white data-[highlighted]:bg-white/[0.14] data-[highlighted]:text-white data-[state=checked]:bg-white/[0.08]";

interface EpisodeOption {
  index: number;
}

interface WatchVideoPlayerShellProps {
  playUrl: string;
  streamRevision: number;
  loadingEpisode: boolean;
  streamError: string | null;
  playbackError: string | null;
  displayName: string;
  isDub: boolean;
  showLoading: boolean;
  hasShowDetails: boolean;
  showError: string | null;
  currentEpisode: number;
  episodes: EpisodeOption[];
  videoRef: React.RefObject<HTMLVideoElement>;
  onBack: () => void;
  onEpisodeSelect: (episode: string) => void;
  onRetryStream: () => void;
  onLoadedMetadata: React.ReactEventHandler<HTMLVideoElement>;
  onPause: React.ReactEventHandler<HTMLVideoElement>;
  onEnded: React.ReactEventHandler<HTMLVideoElement>;
  onPlaying: React.ReactEventHandler<HTMLVideoElement>;
  onError: React.ReactEventHandler<HTMLVideoElement>;
}

export function WatchVideoPlayerShell({
  playUrl,
  streamRevision,
  loadingEpisode,
  streamError,
  playbackError,
  displayName,
  isDub,
  showLoading,
  hasShowDetails,
  showError,
  currentEpisode,
  episodes,
  videoRef,
  onBack,
  onEpisodeSelect,
  onRetryStream,
  onLoadedMetadata,
  onPause,
  onEnded,
  onPlaying,
  onError,
}: WatchVideoPlayerShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const hideControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [arePlayerControlsVisible, setArePlayerControlsVisible] = useState(true);
  const [isTopChromeHovered, setIsTopChromeHovered] = useState(false);
  const [isEpisodeSelectOpen, setIsEpisodeSelectOpen] = useState(false);

  const clearHideControlsTimer = () => {
    if (hideControlsTimerRef.current != null) {
      clearTimeout(hideControlsTimerRef.current);
      hideControlsTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!playUrl || playbackError) {
      clearHideControlsTimer();
      setArePlayerControlsVisible(true);
      return;
    }

    const root = shellRef.current;
    if (!root) return;

    const controlsElement = root.querySelector<HTMLElement>(".media-controls");
    if (!controlsElement) {
      clearHideControlsTimer();
      setArePlayerControlsVisible(true);
      return;
    }

    const syncControlsVisibility = () => {
      const visible = controlsElement.hasAttribute("data-visible");
      if (visible) {
        clearHideControlsTimer();
        setArePlayerControlsVisible(true);
        return;
      }
      clearHideControlsTimer();
      hideControlsTimerRef.current = setTimeout(() => {
        hideControlsTimerRef.current = null;
        setArePlayerControlsVisible(false);
      }, 180);
    };

    syncControlsVisibility();
    const observer = new MutationObserver(syncControlsVisibility);
    observer.observe(controlsElement, {
      attributes: true,
      attributeFilter: ["data-visible"],
    });

    return () => {
      clearHideControlsTimer();
      observer.disconnect();
    };
  }, [playUrl, playbackError, streamRevision]);

  const isPlayerUiActive =
    !playUrl || Boolean(playbackError) || arePlayerControlsVisible || isTopChromeHovered || isEpisodeSelectOpen;

  return (
    <div
      ref={shellRef}
      className="relative flex flex-1 flex-col min-h-0 h-full w-full bg-black overflow-visible"
    >
      <div className="absolute inset-0 z-0 flex items-center justify-center min-h-0">
        {loadingEpisode && !playUrl ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin" />
            <span className="text-sm">Loading stream...</span>
          </div>
        ) : streamError && !playUrl ? (
          <div className="flex flex-col items-center gap-3 text-destructive px-4 text-center">
            <span className="text-sm">{streamError}</span>
            <Button type="button" variant="secondary" size="sm" onClick={onRetryStream}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : playUrl ? (
          <div className="relative h-full w-full min-h-0">
            <VideoJsReactPlayer
              key={streamRevision}
              videoRef={videoRef}
              src={playUrl}
              className="absolute inset-0 h-full w-full object-contain bg-black"
              onLoadedMetadata={onLoadedMetadata}
              onPause={onPause}
              onEnded={onEnded}
              onPlaying={onPlaying}
              onError={onError}
            />
            {playbackError ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 text-center">
                <p className="text-sm text-white/90 max-w-md">{playbackError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={loadingEpisode}
                  onClick={onRetryStream}
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
          isPlayerUiActive ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onMouseEnter={() => {
          setIsTopChromeHovered(true);
        }}
        onMouseLeave={() => {
          setIsTopChromeHovered(false);
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onBack}
          aria-label="Back"
          className="text-white hover:bg-white/15 hover:text-white shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {showLoading && !hasShowDetails ? (
            <span className="inline-flex items-center gap-2 text-white/80 font-normal">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              Loading show...
            </span>
          ) : (
            `${displayName} (${isDub ? "Dub" : "Sub"})`
          )}
        </span>
        {showError && !hasShowDetails ? (
          <span className="text-xs text-red-300 shrink-0 max-w-[200px] truncate" title={showError}>
            {showError}
          </span>
        ) : null}

        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={currentEpisode.toString()}
            onValueChange={onEpisodeSelect}
            onOpenChange={setIsEpisodeSelectOpen}
            disabled={loadingEpisode || showLoading}
          >
            <SelectTrigger className={watchEpisodeSelectTriggerClass}>
              <SelectValue placeholder="Episode" />
            </SelectTrigger>
            <SelectContent className={watchEpisodeSelectContentClass}>
              {episodes.map((ep) => (
                <SelectItem
                  key={ep.index}
                  value={ep.index.toString()}
                  className={watchEpisodeSelectItemClass}
                >
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
