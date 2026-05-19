/**
 * Reanime-only upstream fetch for flixcloud CDN URLs.
 * Programmatic session.fetch often fails TLS to fetch.flixcloud.cc; page-context fetch works.
 */
import { BrowserWindow } from "electron";

import { getElectronUserAgent } from "@/main/electron-user-agent";

import { FLIXCLOUD_PARTITION, FLIXCLOUD_REFERER } from "./constants";

const IS_DEV = process.env.NODE_ENV !== "production";
const CHALLENGE_TIMEOUT_MS = 45_000;

interface BrowserFetchResult {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

let browserWindow: BrowserWindow | null = null;
let warmSessionPromise: Promise<BrowserWindow> | null = null;
let fetchQueue: Promise<unknown> = Promise.resolve();

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
            b.includes("checking your browser") ||
            b.includes("ddos-guard") ||
            b.includes("captcha")
        };
      })()`,
      true
    )) as { blocked: boolean };
    if (!state.blocked) return;
    await sleep(1500);
  }
  throw new Error("Flixcloud challenge timed out");
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

function enqueueBrowserFetch<T>(fn: () => Promise<T>): Promise<T> {
  const task = fetchQueue.then(fn, fn);
  fetchQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

async function fetchViaBrowserContext(
  win: BrowserWindow,
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<BrowserFetchResult> {
  throwIfAborted(signal);

  const onAbort = () => {
    void win.webContents.executeJavaScript(
      "window.__openanimeFlixAbort?.abort?.(); delete window.__openanimeFlixAbort;",
      true
    );
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const result = (await win.webContents.executeJavaScript(
      `(async () => {
        const controller = new AbortController();
        window.__openanimeFlixAbort = controller;

        const headers = ${JSON.stringify(headers)};
        const init = {
          method: "GET",
          credentials: "include",
          headers,
          signal: controller.signal,
        };

        const response = await fetch(${JSON.stringify(targetUrl)}, init);
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        let binary = "";
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }

        const headerObj = {};
        response.headers.forEach((value, key) => {
          headerObj[key] = value;
        });

        delete window.__openanimeFlixAbort;
        return {
          status: response.status,
          statusText: response.statusText,
          headers: headerObj,
          bodyBase64: btoa(binary),
        };
      })()`,
      true
    )) as BrowserFetchResult;

    throwIfAborted(signal);
    return result;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function browserResultToResponse(result: BrowserFetchResult): Response {
  const body = Buffer.from(result.bodyBase64, "base64");
  const headers = new Headers(result.headers);
  return new Response(body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}

/**
 * Fetch a flixcloud URL from a warmed hidden browser (reanime CDN path only).
 */
export async function fetchFlixcloudViaBrowser(
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const startedAt = Date.now();
  log("browser:fetch:start", { targetUrl: targetUrl.slice(0, 96) });

  const response = await enqueueBrowserFetch(async () => {
    const win = await getFlixcloudBrowser();
    if (win.isDestroyed()) {
      browserWindow = null;
      throw new Error("Flixcloud browser session was destroyed");
    }
    const result = await fetchViaBrowserContext(win, targetUrl, headers, signal);
    return browserResultToResponse(result);
  });

  if (IS_DEV && response.status >= 400) {
    log("browser:fetch:non-ok", {
      status: response.status,
      targetUrl: targetUrl.slice(0, 96),
      ms: Date.now() - startedAt,
    });
  } else {
    log("browser:fetch:done", {
      status: response.status,
      targetUrl: targetUrl.slice(0, 96),
      ms: Date.now() - startedAt,
    });
  }

  return response;
}
