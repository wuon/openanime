export interface StreamUrlResult {
  url: string;
  referer: string;
}

export interface StreamProvider {
  getStreamUrl(id: string | null, providerId: string | null, episode: string, mode: "sub" | "dub"): Promise<StreamUrlResult>;
}
