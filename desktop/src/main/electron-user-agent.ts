import { app, session } from "electron";

let cached: string | null = null;

function normalizeUserAgent(raw: string): string {
  let ua = raw.replace(/\s*Electron\/[^\s]+/g, "");
  const product = app.getName();
  if (product.length > 0) {
    const escaped = product.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    ua = ua.replace(new RegExp(`\\s*${escaped}/[^\\s]+`, "g"), "");
  }
  return ua.replace(/\s{2,}/g, " ").trim();
}

/**
 * Chromium-based User-Agent aligned with the default session, with Electron-
 * specific tokens removed so outbound requests resemble a normal Chrome browser.
 */
export function getElectronUserAgent(): string {
  if (cached === null) {
    cached = normalizeUserAgent(session.defaultSession.getUserAgent());
  }
  return cached;
}
