import { streamProviderAvailability } from "./stream-providers.config";

export type StreamProviderName = keyof typeof streamProviderAvailability;

export const STREAM_PROVIDER_LABELS: Record<StreamProviderName, string> = {
  allanime: "AllAnime",
  animepahe: "AnimePahe",
  animeparadise: "AnimeParadise",
  reanime: "Reanime",
};

export const ALL_STREAM_PROVIDER_NAMES = Object.keys(
  streamProviderAvailability
) as StreamProviderName[];

export function isStreamProviderName(value: unknown): value is StreamProviderName {
  return typeof value === "string" && value in streamProviderAvailability;
}

export function getEnabledStreamProviders(): StreamProviderName[] {
  return ALL_STREAM_PROVIDER_NAMES.filter((name) => streamProviderAvailability[name]);
}

export function isStreamProviderEnabled(name: StreamProviderName): boolean {
  return streamProviderAvailability[name];
}

export function isHistoryProviderDisabled(provider: unknown): provider is StreamProviderName {
  return isStreamProviderName(provider) && !isStreamProviderEnabled(provider);
}

export function resolveEnabledStreamProvider(value: unknown): StreamProviderName {
  const enabled = getEnabledStreamProviders();
  if (enabled.length === 0) {
    throw new Error("No stream providers are enabled in stream-providers.config.ts");
  }

  if (isStreamProviderName(value) && isStreamProviderEnabled(value)) {
    return value;
  }

  return enabled[0];
}
