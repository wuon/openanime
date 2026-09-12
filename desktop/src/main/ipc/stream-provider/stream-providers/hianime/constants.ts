export const HIANIME_BASE = process.env.HIANIME_BASE || "https://hianime.at";
export const HIANIME_REFERER = `${HIANIME_BASE.replace(/\/$/, "")}/`;
export const HIANIME_PARTITION = "persist:openanime-hianime";

export function isHianimeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "hianime.at" || host.endsWith(".hianime.at");
}

export function isHianimeUrl(url: string): boolean {
  try {
    return isHianimeHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Slug id from search/watch URLs (`steinsgate-872`, `one-piece-1`). */
export function hianimeSlug(providerId: string): string {
  const trimmed = providerId.trim();
  const slug = trimmed.replace(/^\/(?:watch\/)?/, "").split(/[?#]/)[0] ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
    throw new Error(`Invalid HiAnime provider id: ${providerId}`);
  }
  return slug;
}

/**
 * Trailing numeric catalog id used by `/api/theme/episode/list/{id}`.
 * `steinsgate-0-2640` → `2640` (not the first hyphen suffix).
 */
export function hianimeAnimeId(providerId: string): string {
  const slug = hianimeSlug(providerId);
  const match = /-(\d+)$/.exec(slug);
  if (!match?.[1]) {
    throw new Error(`Invalid HiAnime provider id: ${providerId}`);
  }
  return match[1];
}
