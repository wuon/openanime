import { postAniListGraphql } from "./anilist-api";
import { getStoredAniListAccessToken } from "./anilist-oauth";

export class AniListNotConnectedError extends Error {
  constructor() {
    super("AniList account is not connected.");
    this.name = "AniListNotConnectedError";
  }
}

export function requireAniListAccessToken(): string {
  const token = getStoredAniListAccessToken();
  if (!token) {
    throw new AniListNotConnectedError();
  }
  return token;
}

export async function postAniListAuthedGraphql<T>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<T> {
  const token = requireAniListAccessToken();
  return postAniListGraphql<T>(query, variables, { Authorization: `Bearer ${token}` });
}

interface ViewerPayload {
  Viewer: {
    id: number;
    name?: string | null;
  } | null;
}

let cachedViewerId: number | null = null;

export async function getAniListViewerId(): Promise<number> {
  if (cachedViewerId != null) {
    return cachedViewerId;
  }
  const data = await postAniListAuthedGraphql<ViewerPayload>("query { Viewer { id name } }");
  const id = data.Viewer?.id;
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Failed to resolve AniList viewer id.");
  }
  cachedViewerId = id;
  return id;
}

export function clearAniListViewerIdCache(): void {
  cachedViewerId = null;
}
