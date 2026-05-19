import { session } from "electron";

import type {
  StreamUpstreamFetchContext,
  StreamUpstreamHandler,
  StreamUpstreamMatchContext,
} from "@/main/stream-proxy-upstream";

import {
  FLIXCLOUD_PARTITION,
  FLIXCLOUD_REFERER,
  isFlixcloudHost,
  isReanimeCdnUrl,
} from "./constants";
import { fetchFlixcloudViaBrowser } from "./flixcloud-browser-upstream";

const IS_DEV = process.env.NODE_ENV !== "production";

function normalizeReanimeReferer(targetUrl: string, referer: string | null): string | null {
  if (!referer?.trim()) return referer;
  try {
    const target = new URL(targetUrl);
    const ref = new URL(referer);
    if (
      isFlixcloudHost(target.hostname) &&
      isFlixcloudHost(ref.hostname) &&
      ref.origin !== target.origin
    ) {
      return FLIXCLOUD_REFERER;
    }
    if (isFlixcloudHost(target.hostname) && ref.pathname.startsWith("/e/")) {
      return FLIXCLOUD_REFERER;
    }
  } catch {
    // keep original referer
  }
  return referer;
}

async function fetchReanimeUpstream(ctx: StreamUpstreamFetchContext): Promise<Response> {
  const { targetUrl, headers, signal } = ctx;
  let sessionResponse: Response | null = null;

  try {
    sessionResponse = await session
      .fromPartition(FLIXCLOUD_PARTITION)
      .fetch(targetUrl, { headers, signal });
    if (sessionResponse.status < 400) {
      return sessionResponse;
    }
    if (IS_DEV) {
      console.warn("[reanime-upstream] session fetch non-OK, trying browser fallback", {
        status: sessionResponse.status,
        targetUrl: targetUrl.slice(0, 96),
      });
    }
  } catch (err: unknown) {
    if (IS_DEV) {
      console.warn("[reanime-upstream] session fetch failed, trying browser fallback", {
        targetUrl: targetUrl.slice(0, 96),
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (sessionResponse?.body) {
    try {
      await sessionResponse.body.cancel();
    } catch {
      // ignore
    }
  }

  return fetchFlixcloudViaBrowser(targetUrl, headers, signal);
}

export const reanimeStreamUpstreamHandler: StreamUpstreamHandler = {
  matches(ctx: StreamUpstreamMatchContext): boolean {
    return isReanimeCdnUrl(ctx.targetUrl, ctx.referer);
  },
  normalizeReferer: normalizeReanimeReferer,
  fetch: fetchReanimeUpstream,
};
