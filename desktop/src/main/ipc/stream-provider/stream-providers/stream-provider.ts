import { Episode, ShowSearchResult } from "@/shared/types";
import type { StreamProviderName } from "@/shared/stream-providers";

import { AllAnimeStreamProvider } from "./allanime/allanime-stream-provider";
import { AnimePaheStreamProvider } from "./animepahe-stream-provider";
import { AnimeParadiseStreamProvider } from "./animeparadise-stream-provider";
import { ReanimeStreamProvider } from "./reanime/reanime-stream-provider";
import { SenshiStreamProvider } from "./senshi/senshi-stream-provider";

export type { StreamProviderName };

export interface StreamSubtitleTrack {
  url: string;
  language: string;
  format: string;
  default?: boolean;
}

export interface StreamQualityOption {
  /** Stable id — usually the variant playlist URI from the master. */
  id: string;
  label: string;
  height?: number;
  bandwidth?: number;
}

export interface StreamUrlResult {
  url: string;
  referer: string;
  subtitles?: StreamSubtitleTrack[];
  /** HLS video renditions when the provider returns a multi-variant master. */
  qualities?: StreamQualityOption[];
  /** Default/selected quality id from `qualities` (highest when omitted by callers). */
  selectedQuality?: string;
}

export type StreamMode = "sub" | "dub";

export interface StreamProvider {
  getStreamUrl(
    id: string | null,
    providerId: string | null,
    episode: string,
    mode: StreamMode
  ): Promise<StreamUrlResult>;
  getRecentUploads(page: number, limit?: number, mode?: StreamMode): Promise<Episode[]>;
  search(query: string): Promise<ShowSearchResult[]>;
}

export const streamProviders: Record<StreamProviderName, StreamProvider> = {
  allanime: new AllAnimeStreamProvider(),
  animepahe: new AnimePaheStreamProvider(),
  animeparadise: new AnimeParadiseStreamProvider(),
  reanime: new ReanimeStreamProvider(),
  senshi: new SenshiStreamProvider(),
};
