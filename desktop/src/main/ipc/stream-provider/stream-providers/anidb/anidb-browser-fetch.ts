/**
 * anidb.app sits behind Cloudflare. Plain Node fetch gets the JS challenge page;
 * a warmed Electron session (Chromium TLS + cookies) clears it for API/HTML calls.
 */
import { BrowserWindow, type Session } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";

import { ANIDB_PARTITION, ANIDB_REFERER, isAnidbHost } from "./constants";

const IS_DEV = process.env.NODE_ENV !== "production";
const CHALLENGE_TIMEOUT_MS = 70_000;

let browserWindow: BrowserWindow | null = null;
let warmSessionPromise: Promise<BrowserWindow> | null = null;
let fetchQueue: Promise<unknown> = Promise.resolve();

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[anidb-browser] ${event}${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeCfBlock(text: string): boolean {
  const head = text.slice(0, 800).toLowerCase();
  return (
    head.includes("just a moment") ||
    head.includes("attention required") ||
    head.includes("checking your browser") ||
    head.includes("cf-error-details") ||
    head.includes("sorry, you have been blocked")
  );
}

async function waitChallenge(win: BrowserWindow, timeoutMs = CHALLENGE_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const state = (await win.webContents.executeJavaScript(
      `(() => {
        const t = String(document.title || "").toLowerCase();
        const b = String(document.body?.innerText || "").toLowerCase();
        return {
          blocked:
            t.includes("just a moment") ||
            t.includes("attention required") ||
            b.includes("checking your browser") ||
            b.includes("ddos-guard") ||
            b.includes("captcha") ||
            b.includes("sorry, you have been blocked")
        };
      })()`,
      true
    )) as { blocked: boolean };
    if (!state.blocked) {
      log("challenge:passed", { ms: Date.now() - startedAt });
      return;
    }
    await sleep(1500);
  }
  throw new Error("anidb.app Cloudflare challenge timed out");
}

async function warmAnidbBrowser(): Promise<BrowserWindow> {
  if (browserWindow && !browserWindow.isDestroyed()) {
    return browserWindow;
  }

  const startedAt = Date.now();
  const userAgent = getElectronUserAgent();
  log("browser:warm:start");

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: ANIDB_PARTITION,
      sandbox: false,
    },
  });

  await win.loadURL(ANIDB_REFERER, {
    userAgent,
    httpReferrer: ANIDB_REFERER,
  });
  await waitChallenge(win);
  browserWindow = win;
  log("browser:warm:done", { ms: Date.now() - startedAt });
  return win;
}

async function getAnidbBrowser(): Promise<BrowserWindow> {
  const existing = browserWindow;
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const inFlight = warmSessionPromise;
  if (inFlight !== null) {
    return inFlight;
  }

  const warming = warmAnidbBrowser().finally(() => {
    warmSessionPromise = null;
  });
  warmSessionPromise = warming;
  return warming;
}

function enqueueFetch<T>(fn: () => Promise<T>): Promise<T> {
  const task = fetchQueue.then(fn, fn);
  fetchQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {
    "User-Agent": getElectronUserAgent(),
    Referer: ANIDB_REFERER,
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "connection" || lower === "content-length") continue;
      out[key] = value;
    }
  }
  return out;
}

async function sessionFetchText(
  session: Session,
  url: string,
  headers: Record<string, string>
): Promise<{ status: number; text: string }> {
  const response = await session.fetch(url, { headers, redirect: "follow" });
  const text = await response.text();
  return { status: response.status, text };
}

/**
 * Fetch text from anidb.app (or related URLs) via the warmed Chromium session.
 * Serializes requests so CF cookie handshake stays consistent.
 */
export async function fetchAnidbText(
  url: string,
  headers?: Record<string, string>
): Promise<string> {
  return enqueueFetch(async () => {
    const startedAt = Date.now();
    const win = await getAnidbBrowser();
    const session = win.webContents.session;
    const reqHeaders = sanitizeHeaders(headers);

    log("fetch:start", { url: url.slice(0, 120) });

    let result = await sessionFetchText(session, url, reqHeaders);
    if (result.status === 403 || looksLikeCfBlock(result.text)) {
      log("fetch:cf-retry", { status: result.status });
      // Re-warm origin then retry once.
      await win.loadURL(ANIDB_REFERER, {
        userAgent: getElectronUserAgent(),
        httpReferrer: ANIDB_REFERER,
      });
      await waitChallenge(win);
      result = await sessionFetchText(session, url, reqHeaders);
    }

    if (!result.status || result.status >= 400) {
      throw new Error(`anidb.app request failed (${result.status}): ${url}`);
    }
    if (looksLikeCfBlock(result.text)) {
      throw new Error("anidb.app still blocked by Cloudflare");
    }

    log("fetch:done", { url: url.slice(0, 120), status: result.status, ms: Date.now() - startedAt });
    return result.text;
  });
}

export async function fetchAnidbJson<T>(
  url: string,
  headers?: Record<string, string>
): Promise<T> {
  const text = await fetchAnidbText(url, {
    Accept: "application/json, text/plain, */*",
    ...headers,
  });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`anidb.app returned invalid JSON for ${url}`);
  }
}

/** Plain fetch for HLS CDN hosts (hls.anidb.app is not CF-gated). */
export async function fetchAnidbCdnText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": getElectronUserAgent(),
      Referer: ANIDB_REFERER,
      Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,text/plain,*/*",
    },
  });
  if (!response.ok) {
    throw new Error(`AniDB CDN request failed (${response.status})`);
  }
  return response.text();
}

export async function ensureAnidbBrowserReady(): Promise<void> {
  await getAnidbBrowser();
}

export function isAnidbSiteUrl(url: string): boolean {
  try {
    return isAnidbHost(new URL(url).hostname);
  } catch {
    return false;
  }
}
