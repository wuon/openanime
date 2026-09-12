/**
 * Toggle stream providers without code changes.
 * Set `enabled: false` to hide a provider from settings and block its IPC routes.
 */
export const streamProviderAvailability = {
  hianime: true,
  anidb: false,
  allanime: false,
  animepahe: false,
  animeparadise: false,
  reanime: false,
  senshi: false,
} as const;
