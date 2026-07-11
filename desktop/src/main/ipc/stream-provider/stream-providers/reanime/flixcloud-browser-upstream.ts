/**
 * Reanime CDN upstream fetch via a hidden Electron session.
 * Use session.fetch (Chromium TLS, no CORS) — page-context fetch fails cross-origin
 * to lock*.stronghole.site and similar segment hosts, and curl is WAF-blocked there.
 */
import { BrowserWindow, type Session } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";

import { FLIXCLOUD_PARTITION, FLIXCLOUD_REFERER, isFlixcloudHost } from "./constants";

const IS_DEV = process.env.NODE_ENV !== "production";
const CHALLENGE_TIMEOUT_MS = 45_000;

let browserWindow: BrowserWindow | null = null;
let warmSessionPromise: Promise<BrowserWindow> | null = null;
let warmQueue: Promise<unknown> = Promise.resolve();
const warmedOrigins = new Set<string>();
const warmingOrigins = new Map<string, Promise<void>>();

function log(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  const suffix = meta ? ` ${JSON.stringify(meta)}` : "";
  console.info(`[reanime-flix-upstream] ${event}${suffix}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new Error("Aborted");
  }
}

function looksLikeCfBlockHtml(bytes: Buffer): boolean {
  const head = bytes.subarray(0, Math.min(800, bytes.length)).toString("utf8").toLowerCase();
  return (
    head.includes("attention required") ||
    head.includes("just a moment") ||
    head.includes("cf-error-details") ||
    head.includes("checking your browser") ||
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
    if (!state.blocked) return;
    await sleep(1500);
  }
  throw new Error("CDN challenge timed out");
}

async function warmFlixcloudBrowser(): Promise<BrowserWindow> {
  if (browserWindow && !browserWindow.isDestroyed()) {
    return browserWindow;
  }

  const startedAt = Date.now();
  const userAgent = getElectronUserAgent();
  log("browser:warm:start");

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      partition: FLIXCLOUD_PARTITION,
      sandbox: false,
    },
  });

  await win.loadURL(FLIXCLOUD_REFERER, {
    userAgent,
    httpReferrer: FLIXCLOUD_REFERER,
  });
  await waitChallenge(win);
  browserWindow = win;
  warmedOrigins.add(new URL(FLIXCLOUD_REFERER).origin);
  log("browser:warm:done", { ms: Date.now() - startedAt });
  return win;
}

async function getFlixcloudBrowser(): Promise<BrowserWindow> {
  const existing = browserWindow;
  if (existing && !existing.isDestroyed()) {
    return existing;
  }

  const inFlight = warmSessionPromise;
  if (inFlight !== null) {
    return inFlight;
  }

  const warming = warmFlixcloudBrowser().finally(() => {
    warmSessionPromise = null;
  });
  warmSessionPromise = warming;
  return warming;
}

function enqueueWarm<T>(fn: () => Promise<T>): Promise<T> {
  const task = warmQueue.then(fn, fn);
  warmQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

function sanitizeFetchHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") continue;
    out[key] = value;
  }
  if (!out["User-Agent"] && !out["user-agent"]) {
    out["User-Agent"] = getElectronUserAgent();
  }
  if (!out.Referer && !out.referer) {
    out.Referer = FLIXCLOUD_REFERER;
  }
  return out;
}

async function ensureOriginWarmed(win: BrowserWindow, targetUrl: string): Promise<void> {
  let origin: string;
  try {
    origin = new URL(targetUrl).origin;
  } catch {
    return;
  }
  if (warmedOrigins.has(origin)) return;
  if (isFlixcloudHost(new URL(origin).hostname)) {
    warmedOrigins.add(origin);
    return;
  }

  const inFlight = warmingOrigins.get(origin);
  if (inFlight) {
    await inFlight;
    return;
  }

  const warming = enqueueWarm(async () => {
    if (warmedOrigins.has(origin)) return;
    const startedAt = Date.now();
    log("browser:cdn-warm:start", { origin });
    const userAgent = getElectronUserAgent();
    try {
      // Hit the CDN origin so Chromium can complete any cookie/challenge handshake.
      // Root often 404s; that's fine as long as CF isn't serving a block interstitial.
      await win.loadURL(`${origin}/`, {
        userAgent,
        httpReferrer: FLIXCLOUD_REFERER,
      });
      await waitChallenge(win).catch(() => undefined);
      warmedOrigins.add(origin);
      log("browser:cdn-warm:done", { origin, ms: Date.now() - startedAt });
    } catch (error: unknown) {
      log("browser:cdn-warm:failed", {
        origin,
        message: error instanceof Error ? error.message : String(error),
        ms: Date.now() - startedAt,
      });
      // Still mark warmed so we don't loop; session.fetch may work without nav warm.
      warmedOrigins.add(origin);
    }
  }).finally(() => {
    warmingOrigins.delete(origin);
  });

  warmingOrigins.set(origin, warming);
  await warming;
}

async function fetchViaSession(
  session: Session,
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  throwIfAborted(signal);
  const response = await session.fetch(targetUrl, {
    method: "GET",
    headers: sanitizeFetchHeaders(headers),
    signal,
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const headerObj: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headerObj[key] = value;
  });
  return new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: headerObj,
  });
}

/**
 * Fetch a flixcloud / segment-CDN URL using Chromium's network stack.
 * Warm-up navigations are serialized; segment fetches run concurrently.
 */
export async function fetchFlixcloudViaBrowser(
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const startedAt = Date.now();
  const win = await getFlixcloudBrowser();
  if (win.isDestroyed()) {
    browserWindow = null;
    throw new Error("Flixcloud browser session was destroyed");
  }

  await ensureOriginWarmed(win, targetUrl);
  throwIfAborted(signal);

  let result = await fetchViaSession(win.webContents.session, targetUrl, headers, signal);

  // If CF served a block/challenge page, re-warm that origin via navigation and retry once.
  const body = Buffer.from(await result.clone().arrayBuffer());
  if ((result.status === 403 || result.status === 503) && looksLikeCfBlockHtml(body)) {
    let origin = "";
    try {
      origin = new URL(targetUrl).origin;
    } catch {
      origin = "";
    }
    if (origin) {
      warmedOrigins.delete(origin);
      log("browser:fetch:cf-block-retry", { origin, status: result.status });
      await ensureOriginWarmed(win, targetUrl);
      result = await fetchViaSession(win.webContents.session, targetUrl, headers, signal);
    }
  }

  if (IS_DEV && result.status >= 400) {
    log("browser:fetch:non-ok", {
      status: result.status,
      targetUrl: targetUrl.slice(0, 96),
      ms: Date.now() - startedAt,
    });
  }

  return result;
}

/** Ensure the hidden Chromium session exists (flixcloud.cc warm). */
export async function ensureFlixcloudBrowserReady(): Promise<void> {
  await getFlixcloudBrowser();
}

/** Warm a segment/subtitle CDN origin early so the first real fetch is not blocked. */
export async function warmFlixcloudCdnOrigin(targetUrlOrOrigin: string): Promise<void> {
  const win = await getFlixcloudBrowser();
  if (win.isDestroyed()) {
    browserWindow = null;
    throw new Error("Flixcloud browser session was destroyed");
  }
  await ensureOriginWarmed(win, targetUrlOrOrigin);
}
