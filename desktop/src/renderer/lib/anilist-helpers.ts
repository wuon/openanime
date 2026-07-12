import type { AniListListMedia, AniListMediaListStatus } from "@/shared/types";

/** AniList descriptions often include `<br>`, `<i>`, etc. Strip tags for plain text UI. */
export function stripAniListDescription(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function anilistMediaTitle(media: AniListListMedia): string {
  return (
    media.title?.userPreferred ??
    media.title?.english ??
    media.title?.romaji ??
    media.title?.native ??
    `Anime #${media.id}`
  );
}

export function anilistCoverUrl(media: AniListListMedia): string | null {
  return media.coverImage?.extraLarge ?? media.coverImage?.large ?? null;
}

export const ANILIST_LIST_STATUS_LABELS: Record<AniListMediaListStatus, string> = {
  CURRENT: "Watching",
  PLANNING: "Planning",
  COMPLETED: "Completed",
  REPEATING: "Rewatching",
  PAUSED: "Paused",
  DROPPED: "Dropped",
};

export const ANILIST_ADD_TO_LIST_OPTIONS: AniListMediaListStatus[] = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "REPEATING",
  "PAUSED",
  "DROPPED",
];

export async function resolveProviderForAniListMedia(
  media: AniListListMedia
): Promise<{ providerId: string } | null> {
  const title = anilistMediaTitle(media);
  const results = await window.streamProvider.search(title);
  const match = results.find((r) => r.id === String(media.id));
  if (match) {
    return { providerId: match.providerId };
  }
  const first = results[0];
  if (first) {
    return { providerId: first.providerId };
  }
  return null;
}
