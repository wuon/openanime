import { AllAnimeStreamProvider } from "./stream-providers/allanime-stream-provider";
import { StreamProvider, StreamUrlResult } from "./stream-providers/stream-provider";

const allAnimeStreamProvider: StreamProvider = new AllAnimeStreamProvider();

export async function getStreamUrl(
  showId: string,
  episode: string,
  mode: "sub" | "dub" = "sub"
): Promise<StreamUrlResult> {
  return allAnimeStreamProvider.getStreamUrl(showId, episode, mode);
}

export type { StreamProvider, StreamUrlResult };
