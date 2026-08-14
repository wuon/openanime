export const ANIDB_BASE = process.env.ANIDB_BASE || "https://anidb.app";
export const ANIDB_REFERER = `${ANIDB_BASE.replace(/\/$/, "")}/`;
export const ANIDB_PARTITION = "persist:openanime-anidb";

export function isAnidbHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "anidb.app" || host.endsWith(".anidb.app");
}

export function isAnidbUrl(url: string): boolean {
  try {
    return isAnidbHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Numeric anime id from providerId (`naruto-123` → `123`, or plain `123`). */
export function anidbNumericId(providerId: string): string {
  const trimmed = providerId.trim();
  const tail = trimmed.includes("-") ? trimmed.slice(trimmed.lastIndexOf("-") + 1) : trimmed;
  if (!/^\d+$/.test(tail)) {
    throw new Error(`Invalid AniDB provider id: ${providerId}`);
  }
  return tail;
}
