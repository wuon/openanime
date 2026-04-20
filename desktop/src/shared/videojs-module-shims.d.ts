declare module "@videojs/core/dom" {
  export type VideoFeatures = unknown;
}

declare module "@videojs/react/video" {
  import type React from "react";

  export const videoFeatures: unknown;
  export const VideoSkin: React.ComponentType<Record<string, unknown>>;
  export const Video: React.ForwardRefExoticComponent<
    React.VideoHTMLAttributes<HTMLVideoElement> & React.RefAttributes<HTMLVideoElement>
  >;
}

declare module "@videojs/react/media/hls-video" {
  import type React from "react";

  export const HlsVideo: React.ForwardRefExoticComponent<
    React.VideoHTMLAttributes<HTMLVideoElement> &
      React.RefAttributes<HTMLVideoElement> & {
        type?: string;
        preferPlayback?: string;
        config?: Record<string, unknown>;
      }
  >;
}
