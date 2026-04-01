export interface StreamUrlResult {
  url: string;
  referer: string;
}

export interface StreamProvider {
  getStreamUrl(showId: string, episode: string, mode: "sub" | "dub"): Promise<StreamUrlResult>;
}
