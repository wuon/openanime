/**
 * Toggle stream providers without code changes.
 * Set `enabled: false` to hide a provider from settings and block its IPC routes.
 */
export const streamProviderAvailability = {
  allanime: true,
  animepahe: false,
  animeparadise: false,
  reanime: true,
  senshi: true,
} as const;
