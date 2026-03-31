/**
 * Local HTTP proxy that fetches stream URLs with a Referer header
 * so the renderer can play them in a <video> element.
 */
import type { IncomingMessage, ServerResponse } from "http";
import http from "http";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { URL } from "url";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0";

let server: http.Server | null = null;
let proxyPort = 0;

export function startStreamProxy(): Promise<number> {
  if (server) return Promise.resolve(proxyPort);

  return new Promise((resolve) => {
    server = http.createServer(handleStreamRequest);
    server.listen(0, "127.0.0.1", () => {
      const addr = server?.address();
      proxyPort = typeof addr === "object" && addr ? addr.port : 0;
      resolve(proxyPort);
    });
  });
}

export function getStreamProxyPort(): number {
  return proxyPort;
}

export function getStreamProxyBaseUrl(): string {
  return `http://127.0.0.1:${proxyPort}`;
}

function handleStreamRequest(req: IncomingMessage, res: ServerResponse): void {
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end();
    return;
  }

  const parsed = new URL(req.url ?? "", `http://127.0.0.1`);
  const targetUrl = parsed.searchParams.get("url");
  const referer = parsed.searchParams.get("referer");

  if (!targetUrl) {
    res.writeHead(400);
    res.end("Missing url parameter");
    return;
  }

  const range = req.headers.range;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  if (referer && referer.trim().length > 0) {
    headers.Referer = referer;
  }
  if (range) headers.Range = range;

  const ac = new AbortController();
  const onClientGone = () => ac.abort();
  req.once("aborted", onClientGone);
  res.once("close", onClientGone);

  fetch(targetUrl, { headers, signal: ac.signal })
    .then(async (fetchRes) => {
      const status = fetchRes.status;
      const resHeaders: Record<string, string> = {};
      fetchRes.headers.forEach((v, k) => {
        const lower = k.toLowerCase();
        if (lower !== "transfer-encoding" && lower !== "connection") {
          resHeaders[k] = v;
        }
      });
      res.writeHead(status === 206 ? 206 : status, resHeaders);
      const body = fetchRes.body;
      if (!body) {
        res.end();
        return;
      }
      const nodeStream = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
      try {
        await pipeline(nodeStream, res);
      } catch (err: unknown) {
        // Client closed (seek, buffer trim, new Range) or upstream ended early — not fatal.
        if (isBenignStreamError(err)) return;
        if (!res.headersSent) {
          res.writeHead(502);
          res.end(String(err instanceof Error ? err.message : "Proxy error"));
        } else if (!res.writableEnded) {
          res.destroy();
        }
      }
    })
    .catch((err: unknown) => {
      if (ac.signal.aborted || isBenignStreamError(err)) return;
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(String(err instanceof Error ? err.message : "Proxy error"));
      } else if (!res.writableEnded) {
        res.destroy();
      }
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBenignStreamError(err: unknown): boolean {
  if (!isRecord(err)) return false;
  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : "";
  const code = typeof err.code === "string" ? err.code : "";
  if (name === "AbortError") return true;
  if (code === "ERR_STREAM_PREMATURE_CLOSE") return true;
  if (message === "terminated") return true;
  return false;
}
