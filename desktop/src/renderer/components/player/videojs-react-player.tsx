import { createPlayer } from "@videojs/react";
import { HlsVideo } from "@videojs/react/media/hls-video";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import "@videojs/react/video/skin.css";
import React, { memo, useEffect, useMemo, useRef } from "react";

import { isHlsPlaylistUrl } from "@/shared/utils/hls-url";

import "./videojs-react-player.css";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- beta package types currently resolve createPlayer as any in this toolchain.
const Player = createPlayer({ features: videoFeatures });

/**
 * Stable references for HlsVideo props. These MUST be module-level — passing
 * a fresh object/string on every render causes @videojs/react's HlsVideo to
 * destroy and re-create the hls.js instance, which re-loads the playlist and
 * re-fetches segments from the start (causing playback to jump back to 0
 * whenever the parent re-renders, e.g. on mouse move showing controls).
 */
const HLS_VIDEO_CONFIG = { defaultAudioCodec: "mp4a.40.2" } as const;
const HLS_SOURCE_TYPE = "application/vnd.apple.mpegurl";
const HLS_PREFER_PLAYBACK = "mse";
const PLAYER_CLASS_NAME = "absolute inset-0 h-full w-full object-contain bg-black !rounded-none !border-0";

export interface PlayerSubtitleTrack {
  src: string;
  label: string;
  srclang: string;
  default?: boolean;
}

interface VideoJsReactPlayerProps {
  src?: string;
  className?: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  subtitleTracks?: PlayerSubtitleTrack[];
  /** Label of the single active subtitle track, or null for off. */
  activeSubtitleLabel?: string | null;
  onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>;
  onPause?: React.ReactEventHandler<HTMLVideoElement>;
  onEnded?: React.ReactEventHandler<HTMLVideoElement>;
  onPlaying?: React.ReactEventHandler<HTMLVideoElement>;
  onError?: React.ReactEventHandler<HTMLVideoElement>;
}

function isHlsSourceUrl(src?: string): boolean {
  if (!src) return false;
  try {
    const parsed = new URL(src);
    // Local transcode playlists are always HLS.
    if (parsed.pathname.startsWith("/transcode/") && parsed.pathname.endsWith(".m3u8")) {
      return true;
    }
    // Prefer the upstream target inside ?url= — proxy paths like /stream/playlist.m3u8
    // must not force HLS mode when the real source is an mp4.
    const nested = parsed.searchParams.get("url");
    if (nested) return isHlsPlaylistUrl(nested);
  } catch {
    // fall through
  }
  return isHlsPlaylistUrl(src);
}

/** Exactly one subtitle track may be `showing`; everything else stays disabled. */
function applyActiveSubtitle(video: HTMLVideoElement, activeLabel: string | null | undefined): void {
  const wanted = activeLabel?.trim() ? activeLabel.trim().toLowerCase() : null;
  const textTracks = video.textTracks;
  for (let i = 0; i < textTracks.length; i++) {
    const textTrack = textTracks[i];
    if (!textTrack || textTrack.kind !== "subtitles") continue;
    const isActive = wanted != null && textTrack.label.toLowerCase() === wanted;
    const nextMode: TextTrackMode = isActive ? "showing" : "disabled";
    if (textTrack.mode !== nextMode) {
      textTrack.mode = nextMode;
    }
  }
}

function attachSubtitleTracks(
  video: HTMLVideoElement,
  subtitleTracks: PlayerSubtitleTrack[] | undefined,
  activeLabel: string | null | undefined
): void {
  video.querySelectorAll("track[data-oa-sub]").forEach((el) => el.remove());

  for (const track of subtitleTracks ?? []) {
    const el = document.createElement("track");
    el.kind = "subtitles";
    el.label = track.label;
    el.srclang = track.srclang;
    el.src = track.src;
    // Never set the HTML `default` attribute — browsers may enable every defaulted
    // track at once. Selection is driven exclusively by `activeSubtitleLabel`.
    el.dataset.oaSub = "1";
    video.appendChild(el);
  }

  applyActiveSubtitle(video, activeLabel);
}

function subtitleTracksKey(tracks: PlayerSubtitleTrack[] | undefined): string {
  if (!tracks?.length) return "";
  return tracks.map((t) => `${t.srclang}\0${t.label}\0${t.src}\0${t.default ? "1" : "0"}`).join("\n");
}

type StableMediaHandlers = {
  onLoadedMetadata: React.ReactEventHandler<HTMLVideoElement>;
  onPause: React.ReactEventHandler<HTMLVideoElement>;
  onEnded: React.ReactEventHandler<HTMLVideoElement>;
  onPlaying: React.ReactEventHandler<HTMLVideoElement>;
  onError: React.ReactEventHandler<HTMLVideoElement>;
};

/**
 * @videojs/react@10-beta's HlsVideo computes `attachMediaElement(mediaApi)` as
 * an inline arrow ref on every render, and `useComposedRefs` includes it in its
 * `useCallback` deps. The composed ref therefore changes identity on every
 * render, which makes React invoke its cleanup (`media.detach()` →
 * `hls.detachMedia()`) and then the new ref (`hls.attachMedia()`) — producing
 * a brief black flash and segment re-fetches whenever this tree re-renders.
 *
 * Only remount/re-render this when the media source itself changes.
 */
interface MediaSurfaceProps {
  src?: string;
  className?: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  handlers: StableMediaHandlers;
}

function MediaSurfaceInner({ src, className, videoRef, handlers }: MediaSurfaceProps) {
  const isHlsSource = isHlsSourceUrl(src);
  const mediaClassName = useMemo(() => {
    if (!className) return PLAYER_CLASS_NAME;
    return `${className} !rounded-none !border-0`;
  }, [className]);

  return (
    <Player.Provider>
      <VideoSkin className="oa-videojs-player h-full w-full !bg-black !rounded-none !border-0">
        {isHlsSource ? (
          <HlsVideo
            ref={videoRef}
            src={src}
            type={HLS_SOURCE_TYPE}
            preferPlayback={HLS_PREFER_PLAYBACK}
            config={HLS_VIDEO_CONFIG}
            className={mediaClassName}
            autoPlay
            playsInline
            crossOrigin="anonymous"
            onLoadedMetadata={handlers.onLoadedMetadata}
            onPause={handlers.onPause}
            onEnded={handlers.onEnded}
            onPlaying={handlers.onPlaying}
            onError={handlers.onError}
          />
        ) : (
          <Video
            ref={videoRef}
            src={src}
            className={mediaClassName}
            autoPlay
            playsInline
            crossOrigin="anonymous"
            onLoadedMetadata={handlers.onLoadedMetadata}
            onPause={handlers.onPause}
            onEnded={handlers.onEnded}
            onPlaying={handlers.onPlaying}
            onError={handlers.onError}
          />
        )}
      </VideoSkin>
    </Player.Provider>
  );
}

const MediaSurface = memo(MediaSurfaceInner, (prev, next) => {
  return (
    prev.src === next.src &&
    prev.className === next.className &&
    prev.videoRef === next.videoRef &&
    prev.handlers === next.handlers
  );
});

/**
 * Outer shell always runs so subtitle selection / parent handlers stay fresh via
 * refs, while MediaSurface (and thus HlsVideo) only re-renders when src changes.
 */
export function VideoJsReactPlayer({
  src,
  className,
  videoRef,
  subtitleTracks,
  activeSubtitleLabel = null,
  onLoadedMetadata,
  onPause,
  onEnded,
  onPlaying,
  onError,
}: VideoJsReactPlayerProps) {
  const subtitleTracksRef = useRef(subtitleTracks);
  const activeSubtitleLabelRef = useRef(activeSubtitleLabel);
  const onLoadedMetadataRef = useRef(onLoadedMetadata);
  const onPauseRef = useRef(onPause);
  const onEndedRef = useRef(onEnded);
  const onPlayingRef = useRef(onPlaying);
  const onErrorRef = useRef(onError);

  subtitleTracksRef.current = subtitleTracks;
  activeSubtitleLabelRef.current = activeSubtitleLabel;
  onLoadedMetadataRef.current = onLoadedMetadata;
  onPauseRef.current = onPause;
  onEndedRef.current = onEnded;
  onPlayingRef.current = onPlaying;
  onErrorRef.current = onError;

  const handlers = useMemo<StableMediaHandlers>(
    () => ({
      onLoadedMetadata: (event) => {
        attachSubtitleTracks(
          event.currentTarget,
          subtitleTracksRef.current,
          activeSubtitleLabelRef.current
        );
        onLoadedMetadataRef.current?.(event);
      },
      onPause: (event) => {
        onPauseRef.current?.(event);
      },
      onEnded: (event) => {
        onEndedRef.current?.(event);
      },
      onPlaying: (event) => {
        onPlayingRef.current?.(event);
      },
      onError: (event) => {
        onErrorRef.current?.(event);
      },
    }),
    []
  );

  const tracksKey = subtitleTracksKey(subtitleTracks);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    attachSubtitleTracks(video, subtitleTracksRef.current, activeSubtitleLabelRef.current);
  }, [src, tracksKey, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    applyActiveSubtitle(video, activeSubtitleLabel);
  }, [activeSubtitleLabel, videoRef, src]);

  // Re-assert single-track mode if the skin's captions control enables several at once.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let applying = false;
    const onChange = () => {
      if (applying) return;
      applying = true;
      try {
        applyActiveSubtitle(video, activeSubtitleLabelRef.current);
      } finally {
        applying = false;
      }
    };

    video.textTracks.addEventListener("change", onChange);
    return () => {
      video.textTracks.removeEventListener("change", onChange);
    };
  }, [videoRef, src, tracksKey]);

  return (
    <MediaSurface src={src} className={className} videoRef={videoRef} handlers={handlers} />
  );
}
