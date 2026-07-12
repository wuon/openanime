import { postAniListGraphql } from "./anilist-api";

const MAL_TO_ANILIST_QUERY = `
  query ($malIds: [Int]) {
    Page(page: 1, perPage: 50) {
      media(idMal_in: $malIds, type: ANIME) {
        id
        idMal
      }
    }
  }
`;

const SINGLE_MAL_TO_ANILIST_QUERY = `
  query ($malId: Int) {
    Media(idMal: $malId, type: ANIME) {
      id
      idMal
    }
  }
`;

interface MalMediaRow {
  id?: number | null;
  idMal?: number | null;
}

interface MalPageResponse {
  Page?: {
    media?: MalMediaRow[] | null;
  } | null;
}

interface MalSingleResponse {
  Media?: MalMediaRow | null;
}

function asPositiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve one MyAnimeList anime id to its AniList media id.
 * Returns null when AniList has no mapping (or the request fails).
 */
export async function resolveAniListIdFromMal(malId: number): Promise<number | null> {
  const id = asPositiveInt(malId);
  if (id == null) return null;

  try {
    const data = await postAniListGraphql<MalSingleResponse>(SINGLE_MAL_TO_ANILIST_QUERY, {
      malId: id,
    });
    return asPositiveInt(data.Media?.id);
  } catch {
    return null;
  }
}

/**
 * Batch-resolve MyAnimeList anime ids to AniList media ids.
 * Missing / unmapped MAL ids are omitted from the returned map.
 * AniList caps `perPage` at 50 — larger inputs are chunked.
 */
export async function resolveAniListIdsFromMal(
  malIds: Iterable<number>
): Promise<Map<number, number>> {
  const unique: number[] = [];
  const seen = new Set<number>();
  for (const raw of malIds) {
    const id = asPositiveInt(raw);
    if (id == null || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }

  const out = new Map<number, number>();
  if (unique.length === 0) return out;

  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    try {
      const data = await postAniListGraphql<MalPageResponse>(MAL_TO_ANILIST_QUERY, {
        malIds: chunk,
      });
      for (const row of data.Page?.media ?? []) {
        const mal = asPositiveInt(row.idMal);
        const anilist = asPositiveInt(row.id);
        if (mal != null && anilist != null) {
          out.set(mal, anilist);
        }
      }
    } catch {
      // Leave unmapped; callers fall back to the MAL id.
    }
  }

  return out;
}
