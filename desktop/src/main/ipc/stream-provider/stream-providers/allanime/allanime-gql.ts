import { createCipheriv, createDecipheriv, createHash } from "crypto";

import { getElectronUserAgent } from "@/main/electron-user-agent";

export const ALLANIME_REFERER = "https://youtu-chan.com";

const ALLANIME_BASE = "allanime.day";
export const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const IS_DEV = process.env.NODE_ENV !== "production";

const TOBE_PARSED_FIELD = "tobeparsed";
const ALLANIME_AES_ALGO = "aes-256-gcm";
const ALLANIME_BLOB_VERSION = 0x01;
const ALLANIME_VERSION_LENGTH = 1;
const ALLANIME_IV_LENGTH = 12;
const ALLANIME_AUTH_TAG_LENGTH = 16;
const ALLANIME_TS_BUCKET_MS = 300_000;
const MKISSA_URL = "https://mkissa.to/";
const CDN_IMMUTABLE = "https://cdn.allanime.day/all/mk/_app/immutable/";

const FALLBACK_EPOCH = 4128;
const FALLBACK_BUILD_ID = "19";
const FALLBACK_MASK = "bb8080c5940a4ea9be1f7b893eb3e9794b7af13674cce8b1ae4992481b4ba1b8";
const FALLBACK_PART_B = "SVtSJQv/t+/zw7e4KL4gdyfKDe92l52fuMIAObotBWs=";

// Site still accepts (and currently encrypts tobeparsed with) the legacy
// static key as a decrypt fallback when the XOR key fails auth.
const LEGACY_SECRET = "Xot36i3lK3:v1";
const LEGACY_KEY = createHash("sha256").update(LEGACY_SECRET).digest();

type AaCrypto = {
  expiresMs: number;
  epoch: number;
  buildId: string;
  key: Buffer;
  mask: string;
};

let cryptoCache: AaCrypto | null = null;
let cryptoInflight: Promise<AaCrypto> | null = null;

function xorKey(maskHex: string, partB: string): Buffer {
  const mask = Buffer.from(maskHex, "hex");
  const part = Buffer.from(partB, "base64");
  const key = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) {
    key[i] = part[i]! ^ mask[i % mask.length]!;
  }
  return key;
}

function browserHeaders(): Record<string, string> {
  return { "User-Agent": getElectronUserAgent() };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: browserHeaders() });
  if (!res.ok) {
    throw new Error(`fetch ${url} failed: ${res.status}`);
  }
  return res.text();
}

async function fetchAaCryptoFromSite(): Promise<AaCrypto | null> {
  try {
    const html = await fetchText(MKISSA_URL);
    const aaMatch = html.match(/window\.__aaCrypto\s*=\s*(\{.*?\})/);
    if (!aaMatch?.[1]) return null;

    const aa = JSON.parse(aaMatch[1]) as {
      epoch?: number;
      partB?: string;
      switchAt?: number;
      graceMs?: number;
    };
    if (typeof aa.epoch !== "number" || typeof aa.partB !== "string") return null;

    const expiresMs = Math.max((aa.switchAt ?? 0) + (aa.graceMs ?? 0), Date.now() + 3_600_000);

    const appMatch = html.match(/_app\/immutable\/(entry\/app\.[^"']+\.js)/);
    if (!appMatch?.[1]) return null;

    const appJs = await fetchText(`${CDN_IMMUTABLE}${appMatch[1]}`);
    const imports = [
      ...appJs.matchAll(/(?:import|from)\s*["']\.\.\/(chunks\/[A-Za-z0-9_-]+\.js)["']/g),
    ].map((m) => m[1]!);

    for (const chunk of imports) {
      const js = await fetchText(`${CDN_IMMUTABLE}${chunk}`);
      if (!js.includes("__aaCrypto")) continue;

      const masks = js.match(/[0-9a-f]{64}/g) ?? [];
      if (masks.length !== 1) continue;

      // buildId is inlined near the mask as a short numeric string fallback
      // (currently "19"). Prefer that when present; otherwise use the last known value.
      const buildIdMatch = js.match(new RegExp(`${masks[0]}["']?[\\s\\S]{0,80}?"(\\d{1,4})"`));

      return {
        expiresMs,
        epoch: aa.epoch,
        buildId: buildIdMatch?.[1] ?? FALLBACK_BUILD_ID,
        key: xorKey(masks[0]!, aa.partB),
        mask: masks[0]!,
      };
    }
    return null;
  } catch (error: unknown) {
    if (IS_DEV) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[allanime-gql] aaReq crypto fetch failed: ${message}`);
    }
    return null;
  }
}

function fallbackCrypto(): AaCrypto {
  return {
    expiresMs: Date.now() + 3_600_000,
    epoch: FALLBACK_EPOCH,
    buildId: FALLBACK_BUILD_ID,
    key: xorKey(FALLBACK_MASK, FALLBACK_PART_B),
    mask: FALLBACK_MASK,
  };
}

async function ensureAaCrypto(): Promise<AaCrypto> {
  if (cryptoCache && cryptoCache.expiresMs > Date.now()) {
    return cryptoCache;
  }
  if (cryptoInflight) return cryptoInflight;

  cryptoInflight = (async () => {
    const fetched = await fetchAaCryptoFromSite();
    if (fetched) {
      cryptoCache = fetched;
      if (IS_DEV) {
        console.info(
          `[allanime-gql] fetched aaReq crypto (epoch ${fetched.epoch}, mask ${fetched.mask.slice(0, 8)}, buildId ${fetched.buildId})`
        );
      }
      return fetched;
    }
    if (IS_DEV) {
      console.warn("[allanime-gql] could not fetch aaReq crypto, using fallback values");
    }
    const fallback = fallbackCrypto();
    // Don't cache a long-lived failure; retry next request after a short window.
    cryptoCache = { ...fallback, expiresMs: Date.now() + 60_000 };
    return fallback;
  })();

  try {
    return await cryptoInflight;
  } finally {
    cryptoInflight = null;
  }
}

function buildAaReq(persistedQueryHash: string, crypto: AaCrypto): string {
  const ts = Math.floor(Date.now() / ALLANIME_TS_BUCKET_MS) * ALLANIME_TS_BUCKET_MS;
  const aaReqBase = {
    v: 1,
    ts,
    epoch: crypto.epoch,
    buildId: crypto.buildId,
    qh: persistedQueryHash,
  };
  const ivMaterial = `${crypto.epoch}:${crypto.buildId}:${persistedQueryHash}:${ts}`;
  const iv = createHash("sha256").update(ivMaterial).digest().subarray(0, ALLANIME_IV_LENGTH);
  const jsonBlob = JSON.stringify(aaReqBase);
  const cipher = createCipheriv(ALLANIME_AES_ALGO, crypto.key, iv);
  const ciphertext = Buffer.concat([cipher.update(jsonBlob, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([ALLANIME_BLOB_VERSION]), iv, ciphertext, tag]).toString(
    "base64"
  );
}

function parseDecryptedPayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function decryptWithKey(blob: Buffer, key: Buffer): unknown {
  const ivStart = ALLANIME_VERSION_LENGTH;
  const ivEnd = ivStart + ALLANIME_IV_LENGTH;
  const ciphertextStart = ivEnd;
  const ciphertextEnd = blob.length - ALLANIME_AUTH_TAG_LENGTH;
  if (ciphertextEnd < ciphertextStart) {
    throw new Error("Encrypted payload has invalid ciphertext boundaries");
  }

  const iv = blob.subarray(ivStart, ivEnd);
  const ciphertext = blob.subarray(ciphertextStart, ciphertextEnd);
  const tag = blob.subarray(ciphertextEnd);

  const decipher = createDecipheriv(ALLANIME_AES_ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return parseDecryptedPayload(decrypted.toString("utf8"));
}

function decryptTobeparsed(blobBase64: string, cryptoKey: Buffer): unknown {
  const blob = Buffer.from(blobBase64, "base64");
  const minimumLength = ALLANIME_VERSION_LENGTH + ALLANIME_IV_LENGTH + ALLANIME_AUTH_TAG_LENGTH;
  if (blob.length < minimumLength) {
    throw new Error("Encrypted payload is too short");
  }
  const version = blob[0];
  if (version !== ALLANIME_BLOB_VERSION) {
    throw new Error(`Unsupported Allanime blob version: ${version}`);
  }

  // Match the site: try the epoch XOR key first, then the legacy static key.
  try {
    return decryptWithKey(blob, cryptoKey);
  } catch {
    return decryptWithKey(blob, LEGACY_KEY);
  }
}

export function normalizeAllAnimePayload(
  value: unknown,
  cryptoKey: Buffer = cryptoCache?.key ?? xorKey(FALLBACK_MASK, FALLBACK_PART_B)
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeAllAnimePayload(item, cryptoKey));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = normalizeAllAnimePayload(entry, cryptoKey);
  }

  const encrypted =
    typeof normalized[TOBE_PARSED_FIELD] === "string" ? normalized[TOBE_PARSED_FIELD] : null;
  if (encrypted) {
    try {
      const decrypted = normalizeAllAnimePayload(
        decryptTobeparsed(encrypted, cryptoKey),
        cryptoKey
      );
      delete normalized[TOBE_PARSED_FIELD];

      if (decrypted && typeof decrypted === "object" && !Array.isArray(decrypted)) {
        return {
          ...normalized,
          ...(decrypted as Record<string, unknown>),
        };
      }

      normalized.data = decrypted;
    } catch (error: unknown) {
      if (IS_DEV) {
        const message = error instanceof Error ? error.message : "unknown decryption error";
        const preview = encrypted.slice(0, 24);
        console.warn(
          `[allanime-gql] Failed to decrypt tobeparsed payload: ${message} | blob=${preview}...`
        );
      }
    }
  }

  return normalized;
}

function isAcceptableGetResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const record = parsed as { data?: unknown; errors?: unknown };

  if (Array.isArray(record.errors) && record.errors.length > 0) return false;
  if (record.data == null) return false;
  return true;
}

async function tryPersistedQueryGet(
  variables: unknown,
  persistedQueryHash: string,
  crypto: AaCrypto
): Promise<unknown | null> {
  const extensions = {
    persistedQuery: { version: 1, sha256Hash: persistedQueryHash },
    aaReq: buildAaReq(persistedQueryHash, crypto),
  };
  const url = new URL(`${ALLANIME_API}/api`);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("extensions", JSON.stringify(extensions));

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Referer: ALLANIME_REFERER,
        Origin: ALLANIME_REFERER,
        "User-Agent": getElectronUserAgent(),
      },
    });

    if (!res.ok) return null;

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    // Accept any well-formed GraphQL response that carries `data` and no `errors`.
    // This covers both the encrypted episode sourceUrls (tobeparsed) payload and the
    // plain `shows` payload used by search / recent uploads.
    if (!isAcceptableGetResponse(parsed)) return null;
    return parsed;
  } catch (error: unknown) {
    if (IS_DEV) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[allanime-gql] persisted query GET failed, falling back to POST: ${message}`);
    }
    return null;
  }
}

export async function allAnimeGql<T>(
  variables: unknown,
  query: string,
  persistedQueryHash?: string
): Promise<T> {
  const crypto = persistedQueryHash ? await ensureAaCrypto() : null;

  if (persistedQueryHash && crypto) {
    const getResult = await tryPersistedQueryGet(variables, persistedQueryHash, crypto);
    if (getResult) {
      return normalizeAllAnimePayload(getResult, crypto.key) as T;
    }
  }

  // POST path intentionally omits the Origin header. ani-cli only sets Origin on the
  // persisted-query GET, and AllAnime's gateway rejects POST bodies for `shows` queries
  // (search / recent uploads) when an Origin that doesn't match an allowed origin is sent.
  const body: Record<string, unknown> = { variables, query };
  if (persistedQueryHash && crypto) {
    body.extensions = { aaReq: buildAaReq(persistedQueryHash, crypto) };
  }

  const res = await fetch(`${ALLANIME_API}/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: ALLANIME_REFERER,
      "User-Agent": getElectronUserAgent(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`allanime request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as unknown;
  return normalizeAllAnimePayload(json, crypto?.key) as T;
}
