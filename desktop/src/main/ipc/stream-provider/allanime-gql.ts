import { getElectronUserAgent } from "@/main/electron-user-agent";

export const ALLANIME_REFERER = "https://allmanga.to";

const ALLANIME_BASE = "allanime.day";
export const ALLANIME_API = `https://api.${ALLANIME_BASE}`;

export async function allAnimeGql<T>(variables: unknown, query: string): Promise<T> {
  const res = await fetch(`${ALLANIME_API}/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: ALLANIME_REFERER,
      "User-Agent": getElectronUserAgent(),
    },
    body: JSON.stringify({ variables, query }),
  });

  if (!res.ok) {
    throw new Error(`allanime request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as T;
}
