/**
 * Pluggable upstream fetch for the local stream proxy.
 * Providers register handlers; stream-proxy stays provider-agnostic.
 */

export interface StreamUpstreamMatchContext {
  targetUrl: string;
  referer: string | null;
}

export interface StreamUpstreamFetchContext extends StreamUpstreamMatchContext {
  headers: Record<string, string>;
  signal: AbortSignal;
}

export interface StreamUpstreamHandler {
  matches(ctx: StreamUpstreamMatchContext): boolean;
  normalizeReferer?(targetUrl: string, referer: string | null): string | null;
  fetch(ctx: StreamUpstreamFetchContext): Promise<Response>;
}

const handlers: StreamUpstreamHandler[] = [];

export function registerStreamUpstreamHandler(handler: StreamUpstreamHandler): void {
  handlers.push(handler);
}

function findHandler(ctx: StreamUpstreamMatchContext): StreamUpstreamHandler | null {
  return handlers.find((handler) => handler.matches(ctx)) ?? null;
}

export function normalizeStreamReferer(targetUrl: string, referer: string | null): string | null {
  const handler = findHandler({ targetUrl, referer });
  if (!handler?.normalizeReferer) return referer;
  return handler.normalizeReferer(targetUrl, referer);
}

export async function fetchUpstream(
  targetUrl: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<Response> {
  const referer = headers.Referer ?? null;
  const handler = findHandler({ targetUrl, referer });
  if (handler) {
    return handler.fetch({ targetUrl, referer, headers, signal });
  }
  return fetch(targetUrl, { headers, signal });
}
