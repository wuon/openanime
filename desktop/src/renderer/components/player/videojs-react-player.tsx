import { createPlayer } from "@videojs/react";
import { HlsVideo } from "@videojs/react/media/hls-video";
import { Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import "@videojs/react/video/skin.css";
import React from "react";

import "./videojs-react-player.css";

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- beta package types currently resolve createPlayer as any in this toolchain.
const Player = createPlayer({ features: videoFeatures });

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
  if (/\.m3u8(?:$|\?)/i.test(src)) return true;
  try {
    const parsed = new URL(src);
    if (parsed.searchParams.get("transcode") === "1") return false;
    const nested = parsed.searchParams.get("url");
    if (!nested) return false;
    return /\.m3u8(?:$|\?)/i.test(nested);
  } catch {
    return /m3u8/i.test(src);
  }
}

export function VideoJsReactPlayer({
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

  return (
    <Player.Provider>
      <VideoSkin className="oa-videojs-player h-full w-full !bg-black !rounded-none !border-0">
        {isHlsSource ? (
          <HlsVideo
            ref={videoRef}
            src={src}
            type="application/vnd.apple.mpegurl"
            preferPlayback="mse"
            config={{ defaultAudioCodec: "mp4a.40.2" }}
            className={`${className ?? ""} !rounded-none !border-0`}
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
            className={`${className ?? ""} !rounded-none !border-0`}
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
