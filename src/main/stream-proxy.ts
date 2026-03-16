/**
 * Local HTTP proxy that fetches stream URLs with a Referer header
 * so the renderer can play them in a <video> element.
 */
import type { IncomingMessage, ServerResponse } from "http";
import http from "http";
import { Readable } from "stream";
import { URL } from "url";

const DEFAULT_REFERER = "https://allmanga.to";
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
  const referer = parsed.searchParams.get("referer") ?? DEFAULT_REFERER;

  if (!targetUrl) {
    res.writeHead(400);
    res.end("Missing url parameter");
    return;
  }

  const range = req.headers.range;
  const headers: Record<string, string> = {
    Referer: referer,
    "User-Agent": USER_AGENT,
  };
  if (range) headers.Range = range;

  fetch(targetUrl, { headers })
    .then((fetchRes) => {
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
      if (body) {
        Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
      } else {
        res.end();
      }
    })
    .catch((err: unknown) => {
      res.writeHead(502);
      res.end(String(err instanceof Error ? err.message : "Proxy error"));
    });
}
