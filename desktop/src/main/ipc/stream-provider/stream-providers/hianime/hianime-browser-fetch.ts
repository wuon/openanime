/**
 * hianime.at sits behind Cloudflare. Plain Node fetch gets the JS challenge page;
 * a warmed Electron session (Chromium TLS + cookies) clears it for API/HTML calls.
 */
import { BrowserWindow, type Session } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";

import { HIANIME_PARTITION, HIANIME_REFERER, isHianimeHost } from "./constants";

const IS_DEV = process.env.NODE_ENV !== "production";
const CHALLENGE_TIMEOUT_MS = 70_000;

let browserWindow: BrowserWindow | null = null;
let warmSessionPromise: Promise<BrowserWindow> | null = null;
let fetchQueue: Promise<unknown> = Promise.resolve();
let browserClosed = false;

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[hianime-browser] ${event}${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function discardBrowserWindow(win: BrowserWindow | null): void {
  if (win && !win.isDestroyed()) {
    win.destroy();
  }
}

function throwIfBrowserClosed(): void {
  if (browserClosed) {
    throw new Error("hianime browser session was closed");
  }
}

/** Destroy the warmed hidden window so closing the app is not blocked. */
export function destroyHianimeBrowser(): void {
  browserClosed = true;
  const win = browserWindow;
  browserWindow = null;
  warmSessionPromise = null;
  discardBrowserWindow(win);
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
    if (win.isDestroyed() || browserClosed) {
      throw new Error("hianime browser session was closed");
    }
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
  throw new Error("hianime.at Cloudflare challenge timed out");
}

async function warmHianimeBrowser(): Promise<BrowserWindow> {
  if (browserWindow && !browserWindow.isDestroyed()) {
    return browserWindow;
  }

  throwIfBrowserClosed();
  const startedAt = Date.now();
  const userAgent = getElectronUserAgent();
  log("browser:warm:start");

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: HIANIME_PARTITION,
      sandbox: false,
    },
  });

  if (browserClosed) {
    discardBrowserWindow(win);
    throwIfBrowserClosed();
  }

  await win.loadURL(HIANIME_REFERER, {
    userAgent,
    httpReferrer: HIANIME_REFERER,
  });
  await waitChallenge(win);
  if (browserClosed) {
    discardBrowserWindow(win);
    throwIfBrowserClosed();
  }
  browserWindow = win;
  log("browser:warm:done", { ms: Date.now() - startedAt });
  return win;
}

async function getHianimeBrowser(): Promise<BrowserWindow> {
  const existing = browserWindow;
  if (existing && !existing.isDestroyed()) {
    return existing;
  }
  throwIfBrowserClosed();

  const inFlight = warmSessionPromise;
  if (inFlight !== null) {
    return inFlight;
  }

  const warming = warmHianimeBrowser().finally(() => {
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
    Referer: HIANIME_REFERER,
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
 * Fetch text via the warmed Chromium session (hianime.at HTML/API, embeds, HLS).
 * Serializes requests so CF cookie handshake stays consistent.
 */
export async function fetchHianimeText(
  url: string,
  headers?: Record<string, string>
): Promise<string> {
  return enqueueFetch(async () => {
    const startedAt = Date.now();
    const win = await getHianimeBrowser();
    const session = win.webContents.session;
    const reqHeaders = sanitizeHeaders(headers);

    log("fetch:start", { url: url.slice(0, 120) });

    let result = await sessionFetchText(session, url, reqHeaders);
    if (result.status === 403 || looksLikeCfBlock(result.text)) {
      log("fetch:cf-retry", { status: result.status });
      await win.loadURL(HIANIME_REFERER, {
        userAgent: getElectronUserAgent(),
        httpReferrer: HIANIME_REFERER,
      });
      await waitChallenge(win);
      result = await sessionFetchText(session, url, reqHeaders);
    }

    if (!result.status || result.status >= 400) {
      throw new Error(`hianime.at request failed (${result.status}): ${url}`);
    }
    if (looksLikeCfBlock(result.text)) {
      throw new Error("hianime.at still blocked by Cloudflare");
    }

    log("fetch:done", {
      url: url.slice(0, 120),
      status: result.status,
      ms: Date.now() - startedAt,
    });
    return result.text;
  });
}

export async function ensureHianimeBrowserReady(): Promise<void> {
  await getHianimeBrowser();
}

export function isHianimeSiteUrl(url: string): boolean {
  try {
    return isHianimeHost(new URL(url).hostname);
  } catch {
    return false;
  }
}
