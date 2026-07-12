/**
 * Helpers for HLS master playlists (multi-rendition #EXT-X-STREAM-INF).
 */

export interface HlsVideoVariant {
  /** Relative or absolute URI from the master line after STREAM-INF. */
  uri: string;
  bandwidth: number | null;
  width: number | null;
  height: number | null;
  /** UI label, e.g. "1080p". */
  label: string;
}

function parseStreamInfAttrs(line: string): {
  bandwidth: number | null;
  width: number | null;
  height: number | null;
} {
  const bandwidthMatch = /BANDWIDTH=(\d+)/i.exec(line);
  const resolutionMatch = /RESOLUTION=(\d+)x(\d+)/i.exec(line);
  return {
    bandwidth: bandwidthMatch ? Number(bandwidthMatch[1]) : null,
    width: resolutionMatch ? Number(resolutionMatch[1]) : null,
    height: resolutionMatch ? Number(resolutionMatch[2]) : null,
  };
}

function variantLabel(height: number | null, bandwidth: number | null): string {
  if (height != null && height > 0) return `${height}p`;
  if (bandwidth != null && bandwidth > 0) {
    const kbps = Math.round(bandwidth / 1000);
    return `${kbps}kbps`;
  }
  return "Auto";
}

/** Parse video renditions from an HLS master playlist body. */
export function parseHlsVideoVariants(master: string): HlsVideoVariant[] {
  const lines = master.split(/\r?\n/);
  const out: HlsVideoVariant[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const next = (lines[i + 1] ?? "").trim();
    if (!next || next.startsWith("#")) continue;
    const attrs = parseStreamInfAttrs(line);
    out.push({
      uri: next,
      bandwidth: attrs.bandwidth,
      width: attrs.width,
      height: attrs.height,
      label: variantLabel(attrs.height, attrs.bandwidth),
    });
  }
  return out;
}

/** Sort tallest → shortest (then bandwidth). */
export function sortHlsVariantsDescending(variants: HlsVideoVariant[]): HlsVideoVariant[] {
  return [...variants].sort((a, b) => {
    const heightDiff = (b.height ?? 0) - (a.height ?? 0);
    if (heightDiff !== 0) return heightDiff;
    return (b.bandwidth ?? 0) - (a.bandwidth ?? 0);
  });
}

/**
 * Prefer a mid/high quality that is less CDN-hostile than max 1080p.
 * Falls back to closest available height, then tallest.
 */
export function pickPreferredHlsVariant(
  variants: HlsVideoVariant[],
  preferredHeight = 720
): HlsVideoVariant | null {
  if (variants.length === 0) return null;
  const sorted = sortHlsVariantsDescending(variants);
  const exact = sorted.find((v) => v.height === preferredHeight);
  if (exact) return exact;
  // Closest at-or-below preferred, else closest above, else tallest.
  const below = sorted.filter((v) => (v.height ?? 0) > 0 && (v.height ?? 0) <= preferredHeight);
  if (below.length > 0) return below[0]!;
  return sorted[sorted.length - 1] ?? sorted[0]!;
}

function urlsLooselyEqual(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const pathA = a.includes("://") ? new URL(a).pathname : a.replace(/^\.\//, "");
    const pathB = b.includes("://") ? new URL(b).pathname : b.replace(/^\.\//, "");
    return (
      pathA === pathB ||
      pathA.endsWith(`/${pathB}`) ||
      pathB.endsWith(`/${pathA}`) ||
      pathA.endsWith(pathB) ||
      pathB.endsWith(pathA)
    );
  } catch {
    return false;
  }
}

/**
 * Keep AUDIO/SUBTITLE media tags and a single video STREAM-INF (+ its URI line).
 * When `variantUri` is missing/unmatched, falls back to the preferred height.
 */
export function filterHlsMasterToVariant(
  master: string,
  variantUri: string | null | undefined,
  preferredHeight = 720
): string {
  if (!master.includes("#EXT-X-STREAM-INF")) return master;

  const variants = parseHlsVideoVariants(master);
  if (variants.length <= 1) return master;

  const wanted = variantUri?.trim();
  const matched =
    (wanted ? variants.find((v) => v.uri === wanted || urlsLooselyEqual(v.uri, wanted)) : null) ??
    pickPreferredHlsVariant(variants, preferredHeight);
  if (!matched) return master;

  const lines = master.split(/\r?\n/);
  const out: string[] = [];
  let kept = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const next = (lines[i + 1] ?? "").trim();
      const isMatch = next === matched.uri || urlsLooselyEqual(next, matched.uri);
      if (isMatch) {
        out.push(line);
        if (next) out.push(next);
        kept = true;
      }
      i += 1;
      continue;
    }
    out.push(line);
  }

  return kept ? out.join("\n") : master;
}
