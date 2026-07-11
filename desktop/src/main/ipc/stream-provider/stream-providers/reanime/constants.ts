export const FLIXCLOUD_BASE = "https://flixcloud.cc";
export const FLIXCLOUD_PARTITION = "persist:openanime-flixcloud";
export const FLIXCLOUD_REFERER = `${FLIXCLOUD_BASE}/`;

export function isFlixcloudHost(hostname: string): boolean {
  return hostname === "flixcloud.cc" || hostname.endsWith(".flixcloud.cc");
}

function isFlixcloudCdnHost(hostname: string): boolean {
  return (
    /\.stronghole\.site$/i.test(hostname) ||
    /\.slopnet\.site$/i.test(hostname) ||
    /^lock\d+\./i.test(hostname) ||
    /^vault\d+\./i.test(hostname)
  );
}

/** Reanime HLS manifests/segments/subtitles — includes rotating CDN hosts. */
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

  if (isFlixcloudCdnHost(url.hostname)) return true;
  return /\/_v7\//.test(url.pathname) || /\/subtitles\//.test(url.pathname);
}
