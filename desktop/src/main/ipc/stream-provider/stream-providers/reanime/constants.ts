export const FLIXCLOUD_BASE = "https://flixcloud.cc";
export const FLIXCLOUD_PARTITION = "persist:openanime-flixcloud";
export const FLIXCLOUD_REFERER = `${FLIXCLOUD_BASE}/`;

export function isFlixcloudHost(hostname: string): boolean {
  return hostname === "flixcloud.cc" || hostname.endsWith(".flixcloud.cc");
}

/** Reanime HLS manifests/segments — includes rotating CDN hosts (e.g. *.slopnet.site). */
export function isReanimeCdnUrl(targetUrl: string, referer: string | null | undefined): boolean {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    return false;
  }

  if (isFlixcloudHost(url.hostname)) return true;

  const ref = referer?.trim() ?? "";
  if (!ref.includes("flixcloud.cc")) return false;

  return /\/_v7\//.test(url.pathname);
}
