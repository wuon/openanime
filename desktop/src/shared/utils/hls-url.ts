/** True when `url` points at an HLS master or media playlist (not a transport segment). */
export function isHlsPlaylistUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return /(?:^|\/)m3u8(?:[?#]|$)/i.test(parsed.pathname);
  } catch {
    return /(?:^|[/.])m3u8(?:[?#]|$)/i.test(url);
  }
}
