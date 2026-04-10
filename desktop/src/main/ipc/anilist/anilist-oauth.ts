import { app, safeStorage, shell } from "electron";

import { appStore } from "@/main/store";
import type { AniListIntegrationStatus } from "@/shared/types";

import { fetchAniListViewerName } from "./anilist-user";

const PROD_PROTOCOL = "openanime";
const DEV_PROTOCOL = "openanime-dev";
const PROD_CLIENT_ID = "38904";
const DEV_CLIENT_ID = "38906";

export const APP_PROTOCOL = app.isPackaged ? PROD_PROTOCOL : DEV_PROTOCOL;
/** Must match a redirect URI configured for this client in the AniList API app settings. */
export const ANILIST_OAUTH_REDIRECT_URI = `${APP_PROTOCOL}://auth/anilist/callback`;

/** AniList-hosted pin page; set this as Redirect URL in client settings to use manual token entry. */
export const ANILIST_PIN_REDIRECT_URI = "https://anilist.co/api/v2/oauth/pin";

const CLIENT_ID = app.isPackaged ? PROD_CLIENT_ID : DEV_CLIENT_ID;
const ANILIST_ACCESS_TOKEN_STORE_KEY = "anilist.accessToken";

export function parseAccessTokenFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const fromSearch = parsed.searchParams.get("access_token");
    if (fromSearch) {
      return fromSearch;
    }
    const hash = parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      const fromHash = hashParams.get("access_token");
      if (fromHash) {
        return fromHash;
      }
    }
  } catch {
    // ignore
  }
  const match = url.match(/[#&?]access_token=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function getStoredAniListAccessToken(): string | null {
  const value = appStore.get(ANILIST_ACCESS_TOKEN_STORE_KEY);
  const stored = typeof value === "string" ? value : undefined;
  if (stored && stored.length > 0) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(stored, "base64"));
      }
      return stored;
    } catch {
      return null;
    }
  }
  return null;
}

export function saveAniListAccessToken(token: string): void {
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token).toString("base64")
    : token;
  appStore.set(ANILIST_ACCESS_TOKEN_STORE_KEY, payload);
}

export function clearAniListAccessToken(): void {
  appStore.delete(ANILIST_ACCESS_TOKEN_STORE_KEY);
}

function buildAuthorizeUrl(): string {
  const u = new URL("https://anilist.co/api/v2/oauth/authorize");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("response_type", "token");
  u.searchParams.set("redirect_uri", ANILIST_OAUTH_REDIRECT_URI);
  return u.toString();
}

function buildPinAuthorizeUrl(): string {
  const u = new URL("https://anilist.co/api/v2/oauth/authorize");
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("response_type", "token");
  return u.toString();
}

export async function openAniListPinAuthInBrowser(): Promise<void> {
  await shell.openExternal(buildPinAuthorizeUrl());
}

function isAniListCallbackUrl(url: string): boolean {
  return url.startsWith(`${ANILIST_OAUTH_REDIRECT_URI}?`) || url === ANILIST_OAUTH_REDIRECT_URI;
}

let pendingResolver: ((token: string) => void) | null = null;
let pendingRejecter: ((error: Error) => void) | null = null;
let pendingTimeout: NodeJS.Timeout | null = null;

function clearPendingAuthState() {
  pendingResolver = null;
  pendingRejecter = null;
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
}

export function completeAniListOAuthFromDeepLink(url: string) {
  if (!isAniListCallbackUrl(url) || !pendingResolver) {
    return;
  }
  const token = parseAccessTokenFromUrl(url);
  if (!token) {
    pendingRejecter?.(new Error("AniList callback did not include an access token."));
    clearPendingAuthState();
    return;
  }
  pendingResolver(token);
  clearPendingAuthState();
}

export async function beginAniListOAuth(): Promise<string> {
  if (pendingResolver) {
    throw new Error("AniList sign-in is already in progress.");
  }

  const authorizeUrl = buildAuthorizeUrl();
  await shell.openExternal(authorizeUrl);

  return new Promise((resolve, reject) => {
    pendingResolver = resolve;
    pendingRejecter = reject;
    pendingTimeout = setTimeout(
      () => {
        pendingRejecter?.(new Error("AniList sign-in timed out."));
        clearPendingAuthState();
      },
      2 * 60 * 1000
    );
  });
}

export type AniListAuthActionResult = { ok: true } | { ok: false; error: string };

export async function connectAniListAccount(): Promise<AniListAuthActionResult> {
  try {
    const token = await beginAniListOAuth();
    saveAniListAccessToken(token);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "AniList sign-in failed.";
    return { ok: false, error: message };
  }
}

export async function submitAniListManualToken(
  rawToken: unknown
): Promise<AniListAuthActionResult> {
  const token = typeof rawToken === "string" ? rawToken.trim() : "";
  if (!token) {
    return { ok: false, error: "Paste an access token from the AniList pin page." };
  }
  const username = await fetchAniListViewerName(token);
  if (!username) {
    return { ok: false, error: "That token is invalid or expired." };
  }
  saveAniListAccessToken(token);
  return { ok: true };
}

export async function getAniListIntegrationStatus(): Promise<AniListIntegrationStatus> {
  const token = getStoredAniListAccessToken();
  if (!token) {
    return { connected: false };
  }
  const username = await fetchAniListViewerName(token);
  if (!username) {
    clearAniListAccessToken();
    return { connected: false };
  }
  return { connected: true, username };
}
