export const FLIXCLOUD_BASE = "https://flixcloud.cc";
export const FLIXCLOUD_PARTITION = "persist:openanime-flixcloud";
export const FLIXCLOUD_REFERER = `${FLIXCLOUD_BASE}/`;

export function isFlixcloudHost(hostname: string): boolean {
  return hostname === "flixcloud.cc" || hostname.endsWith(".flixcloud.cc");
}
