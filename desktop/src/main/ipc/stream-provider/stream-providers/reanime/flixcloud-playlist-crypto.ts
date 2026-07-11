/**
 * Flixcloud CDN playlists are base64(XOR(plaintext, repeating __pk)).
 * `__pk` is the base64 of 32 bytes from WASM export `_c()` after `_s`/`_r`.
 * Patched hls.js on flixcloud.cc does the same transform before parsing #EXTM3U.
 */

const playlistKeys = new Map<string, string>();

export function flixcloudVideoIdFromUrl(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/_v7\/([^/]+)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function registerFlixcloudPlaylistKey(streamUrl: string, playlistKey: string): void {
  const videoId = flixcloudVideoIdFromUrl(streamUrl);
  if (!videoId || !playlistKey) return;
  playlistKeys.set(videoId, playlistKey);
}

export function getFlixcloudPlaylistKey(streamUrl: string): string | null {
  const videoId = flixcloudVideoIdFromUrl(streamUrl);
  if (!videoId) return null;
  return playlistKeys.get(videoId) ?? null;
}

/**
 * Decrypt a Flixcloud playlist body when it is XOR-wrapped (not already #EXTM3U).
 * Returns null if decryption fails or the body is not a playlist ciphertext.
 */
export function decryptFlixcloudPlaylistBody(
  body: string | Buffer,
  playlistKeyB64: string
): string | null {
  const text = typeof body === "string" ? body : body.toString("utf8");
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("#EXTM3U")) return trimmed;

  try {
    const key = Buffer.from(playlistKeyB64, "base64");
    if (key.length === 0) return null;
    const cipher = Buffer.from(trimmed, "base64");
    if (cipher.length === 0) return null;

    const plain = Buffer.alloc(cipher.length);
    for (let i = 0; i < cipher.length; i++) {
      plain[i] = cipher[i]! ^ key[i % key.length]!;
    }
    const decoded = plain.toString("utf8");
    if (!decoded.trimStart().startsWith("#EXTM3U")) return null;
    return decoded;
  } catch {
    return null;
  }
}
