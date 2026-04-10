export const ANILIST_GRAPHQL_API = "https://graphql.anilist.co";

interface AniListGraphQlError {
  message?: string;
}

interface AniListGraphQlEnvelope<T> {
  data?: T;
  errors?: AniListGraphQlError[];
}

export async function postAniListGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const res = await fetch(ANILIST_GRAPHQL_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`AniList API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as AniListGraphQlEnvelope<T>;
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    throw new Error(json.errors[0]?.message ?? "AniList query failed");
  }

  if (json.data === undefined) {
    throw new Error("AniList response missing data");
  }

  return json.data;
}
