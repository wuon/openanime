import { createPlayer } from "@videojs/react";
import { HlsVideo } from "@videojs/react/media/hls-video";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import "@videojs/react/video/skin.css";
import React, { memo, useMemo } from "react";

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

interface VideoJsReactPlayerProps {
  src?: string;
  className?: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>;
  onPause?: React.ReactEventHandler<HTMLVideoElement>;
  onEnded?: React.ReactEventHandler<HTMLVideoElement>;
  onPlaying?: React.ReactEventHandler<HTMLVideoElement>;
  onError?: React.ReactEventHandler<HTMLVideoElement>;
}

function isHlsSourceUrl(src?: string): boolean {
  if (!src) return false;
  if (isHlsPlaylistUrl(src)) return true;
  try {
    const parsed = new URL(src);
    if (parsed.pathname.startsWith("/transcode/") && parsed.pathname.endsWith(".m3u8")) return true;
    const nested = parsed.searchParams.get("url");
    if (!nested) return false;
    return isHlsPlaylistUrl(nested);
  } catch {
    return false;
  }
}

/**
 * @videojs/react@10-beta's HlsVideo computes `attachMediaElement(mediaApi)` as
 * an inline arrow ref on every render, and `useComposedRefs` includes it in its
 * `useCallback` deps. The composed ref therefore changes identity on every
 * render, which makes React invoke its cleanup (`media.detach()` →
 * `hls.detachMedia()`) and then the new ref (`hls.attachMedia()`) — producing
 * a brief black flash on the video element whenever the parent re-renders.
 *
 * `React.memo` keeps this component from re-rendering when its props are
 * unchanged (the parent shell re-renders on mouse activity, but our props
 * here are stable references), which prevents the detach/attach cycle.
 */
function VideoJsReactPlayerInner({
  src,
  className,
  videoRef,
  onLoadedMetadata,
  onPause,
  onEnded,
  onPlaying,
  onError,
}: VideoJsReactPlayerProps) {
  const isHlsSource = isHlsSourceUrl(src);
  // Memoize the className string so its reference is stable across renders.
  const mediaClassName = useMemo(
    () => `${className ?? ""} !rounded-none !border-0`,
    [className]
  );

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
            onLoadedMetadata={onLoadedMetadata}
            onPause={onPause}
            onEnded={onEnded}
            onPlaying={onPlaying}
            onError={onError}
          />
        ) : (
          <Video
            ref={videoRef}
            src={src}
            className={mediaClassName}
            autoPlay
            playsInline
            onLoadedMetadata={onLoadedMetadata}
            onPause={onPause}
            onEnded={onEnded}
            onPlaying={onPlaying}
            onError={onError}
          />
        )}
      </VideoSkin>
    </Player.Provider>
  );
}

export const VideoJsReactPlayer = memo(VideoJsReactPlayerInner);
