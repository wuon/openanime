import { BrowserWindow } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";

import { FLIXCLOUD_BASE, FLIXCLOUD_PARTITION } from "./constants";

const TOKEN_API_FILTER = { urls: [`${FLIXCLOUD_BASE}/api/m3u8/*`] };
const IS_DEV = process.env.NODE_ENV !== "production";

export type FlixcloudTokenPayloadFetcher = (token: string) => Promise<Record<string, string>>;

let permitNextTokenRequest = false;

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[reanime-flix] ${event}${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installFlixTokenRequestGate(win: BrowserWindow): void {
  win.webContents.session.webRequest.onBeforeRequest(TOKEN_API_FILTER, (_details, callback) => {
    if (permitNextTokenRequest) {
      permitNextTokenRequest = false;
      callback({});
      return;
    }
    callback({ cancel: true });
  });
}

function clearFlixTokenRequestGate(win: BrowserWindow): void {
  win.webContents.session.webRequest.onBeforeRequest(TOKEN_API_FILTER, null);
  permitNextTokenRequest = false;
}

function isSslLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("ERR_SSL") ||
    message.includes("SSL") ||
    message.includes("-107") ||
    message.includes("net::ERR_FAILED")
  );
}

async function loadEmbedPage(
  win: BrowserWindow,
  embedUrl: string,
  referer: string,
  userAgent: string
): Promise<void> {
  const navigate = async () => {
    await win.loadURL(embedUrl, {
      userAgent,
      httpReferrer: referer,
    });
  };

  try {
    await navigate();
  } catch (error: unknown) {
    if (!isSslLoadError(error)) throw error;
    log("browser:embed:ssl-retry", { embedUrl });
    await win.webContents.session.clearStorageData();
    await sleep(500);
    await navigate();
  }
}

async function waitChallenge(win: BrowserWindow, timeoutMs = 45_000): Promise<void> {
  const startedAt = Date.now();
  log("browser:challenge:start", { timeoutMs });
  while (Date.now() - startedAt < timeoutMs) {
    const state = (await win.webContents.executeJavaScript(
      `(() => {
        const t = String(document.title || "").toLowerCase();
        const b = String(document.body?.innerText || "").toLowerCase();
        return {
          blocked:
            t.includes("just a moment") ||
            b.includes("checking your browser") ||
            b.includes("ddos-guard") ||
            b.includes("captcha")
        };
      })()`,
      true
    )) as { blocked: boolean };
    if (!state.blocked) {
      log("browser:challenge:passed", { ms: Date.now() - startedAt });
      return;
    }
    await sleep(1500);
  }
  throw new Error("Flixcloud challenge timed out");
}

async function fetchTokenFromEmbedPage(
  win: BrowserWindow,
  token: string,
  referer: string,
  embedUrl: string
): Promise<Record<string, string>> {
  const tokenUrl = `${FLIXCLOUD_BASE}/api/m3u8/${token}`;
  const tokenStartedAt = Date.now();
  log("browser:token:start", { token: token.slice(0, 24), embedUrl });

  permitNextTokenRequest = true;
  try {
    const payload = (await win.webContents.executeJavaScript(
      `(async () => {
        const response = await fetch(${JSON.stringify(tokenUrl)}, {
          method: "GET",
          credentials: "include",
          headers: {
            Accept: "application/json",
            Referer: ${JSON.stringify(referer)},
          },
        });
        if (!response.ok) {
          throw new Error("Flixcloud token request failed (" + response.status + ")");
        }
        return await response.json();
      })()`,
      true
    )) as Record<string, string>;

    log("browser:token:done", {
      keys: Object.keys(payload).join(","),
      ms: Date.now() - tokenStartedAt,
    });
    return payload;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown error";
    log("browser:token:failed", { error: message, ms: Date.now() - tokenStartedAt });
    throw error instanceof Error ? error : new Error(message);
  } finally {
    permitNextTokenRequest = false;
  }
}

/**
 * Load the flixcloud embed in a hidden browser (same approach as AnimePahe fallback).
 * Keeps the window alive until `work` completes so the embed page can fetch the one-time token.
 */
export async function withFlixcloudBrowser<T>(
  embedUrl: string,
  referer: string,
  work: (html: string, fetchTokenPayload: FlixcloudTokenPayloadFetcher) => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  const userAgent = getElectronUserAgent();
  log("browser:window:create", { embedUrl, referer });

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: FLIXCLOUD_PARTITION,
      sandbox: false,
    },
  });

  installFlixTokenRequestGate(win);

  try {
    const embedStartedAt = Date.now();
    log("browser:embed:load", { embedUrl });

    await loadEmbedPage(win, embedUrl, referer, userAgent);

    log("browser:embed:loaded", {
      url: win.webContents.getURL(),
      ms: Date.now() - embedStartedAt,
    });

    await waitChallenge(win);

    const html = (await win.webContents.executeJavaScript(
      "document.documentElement ? document.documentElement.outerHTML : ''",
      true
    )) as string;

    if (!html.includes('type:"data",data:')) {
      throw new Error("Flixcloud embed HTML missing SSR data block");
    }

    log("browser:embed:done", {
      embedUrl,
      bytes: html.length,
      ms: Date.now() - embedStartedAt,
    });

    const fetchTokenPayload: FlixcloudTokenPayloadFetcher = (token: string) =>
      fetchTokenFromEmbedPage(win, token, referer, embedUrl);

    return await work(html, fetchTokenPayload);
  } finally {
    clearFlixTokenRequestGate(win);
    if (!win.isDestroyed()) win.destroy();
    log("browser:window:destroy", { ms: Date.now() - startedAt });
  }
}
