import { Episode, ShowSearchResult } from "@/shared/types";

import { AllAnimeStreamProvider } from "./allanime-stream-provider";
import { AnimePaheStreamProvider } from "./animepahe-stream-provider";

export interface StreamUrlResult {
  url: string;
  referer: string;
}

export type StreamMode = "sub" | "dub";
export type StreamProviderName = "allanime" | "animepahe";

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
};
