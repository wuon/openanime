import { createCipheriv, createDecipheriv, createHash } from "crypto";

import { getElectronUserAgent } from "@/main/electron-user-agent";

export const ALLANIME_REFERER = "https://youtu-chan.com";
// anipy-cli uses mkissa as Origin on the episode source GET (aaReq path).
const ALLANIME_ORIGIN = "https://mkissa.to";

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
// Persisted-query SHA-256 for the episode embed query (ani-cli legacy hash).
const FALLBACK_EPISODE_QUERY_HASH =
  "d405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec";
const FALLBACK_EPISODE_QUERY =
  "query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }";

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
  queryHash: string;
  episodeQuery: string;
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

/**
 * Port of anipy-cli keygen.py `source_query_hash`: reconstruct the episode
 * sourceUrls GraphQL query from CDN chunk template literals and SHA-256 it.
 */
function sourceQueryFromChunk(chunkJs: string): { query: string; hash: string } | null {
  const templates = [...chunkJs.matchAll(/(\nquery\([^`]*)`/g)].map((m) => m[1]!);
  const template = templates.find((t) => t.includes("sourceUrls") && t.includes("episode("));
  if (!template) return null;

  const resolve = (tmpl: string, depth = 0): string => {
    if (depth > 6) return tmpl;
    let resolved = tmpl;
    const interpolators = [...tmpl.matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]!);
    for (const interpolator of interpolators) {
      let repl = "";
      if (interpolator.endsWith("()")) {
        // helper = e => e ? `...` : `...`
        const fnName = interpolator.slice(0, -2);
        const fn = chunkJs.match(
          new RegExp(
            `\\b${escapeRegExp(fnName)}\\s*=\\s*\\w+\\s*=>\\s*\\w+\\s*\\?\\s*\`[^\`]*\`\\s*:\\s*\`([^\`]*)\``
          )
        );
        repl = fn?.[1] ?? "";
      } else {
        const varMatch = chunkJs.match(
          new RegExp(`\\b${escapeRegExp(interpolator)}\\s*=\\s*\`([^\`]*)\``)
        );
        repl = varMatch?.[1] != null ? resolve(varMatch[1], depth + 1) : "";
      }
      resolved = resolved.replaceAll(`\${${interpolator}}`, repl);
    }
    return resolved;
  };

  const query = resolve(template);
  if (query.includes("${")) return null;
  return { query, hash: createHash("sha256").update(query).digest("hex") };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    // SvelteKit lists route chunks in a deps array, not only as import/from statements.
    // Match anipy-cli keygen.py: any "../chunks/*.js" string reference.
    const imports = [
      ...appJs.matchAll(/["']\.\.\/(chunks\/[A-Za-z0-9_-]+\.js)["']/g),
    ].map((m) => m[1]!);

    for (const chunk of imports) {
      const js = await fetchText(`${CDN_IMMUTABLE}${chunk}`);
      if (!js.includes("__aaCrypto")) continue;

      const masks = js.match(/[0-9a-f]{64}/g) ?? [];
      if (masks.length !== 1) continue;

      // buildId is inlined near the mask as a short numeric string fallback
      // (currently "19"). Prefer that when present; otherwise use the last known value.
      const buildIdMatch = js.match(new RegExp(`${masks[0]}["']?[\\s\\S]{0,80}?"(\\d{1,4})"`));
      const sourced = sourceQueryFromChunk(js);

      return {
        expiresMs,
        epoch: aa.epoch,
        buildId: buildIdMatch?.[1] ?? FALLBACK_BUILD_ID,
        key: xorKey(masks[0]!, aa.partB),
        mask: masks[0]!,
        queryHash: sourced?.hash ?? FALLBACK_EPISODE_QUERY_HASH,
        episodeQuery: sourced?.query ?? FALLBACK_EPISODE_QUERY,
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
    queryHash: FALLBACK_EPISODE_QUERY_HASH,
    episodeQuery: FALLBACK_EPISODE_QUERY,
  };
}

async function loadAaCrypto(): Promise<AaCrypto> {
  const fetched = await fetchAaCryptoFromSite();
  if (fetched) {
    cryptoCache = fetched;
    if (IS_DEV) {
      console.info(
        `[allanime-gql] fetched aaReq crypto (epoch ${fetched.epoch}, mask ${fetched.mask.slice(0, 8)}, buildId ${fetched.buildId}, queryHash ${fetched.queryHash})`
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
}

async function ensureAaCrypto(): Promise<AaCrypto> {
  if (cryptoCache && cryptoCache.expiresMs > Date.now()) {
    return cryptoCache;
  }
  if (cryptoInflight) return cryptoInflight;

  cryptoInflight = loadAaCrypto();

  try {
    return await cryptoInflight;
  } finally {
    cryptoInflight = null;
  }
}

/** Force-refresh aaReq crypto (used when AllAnime becomes the active provider). */
export async function refreshAaCrypto(): Promise<AaCrypto> {
  cryptoCache = null;
  if (cryptoInflight) return cryptoInflight;
  cryptoInflight = loadAaCrypto();
  try {
    return await cryptoInflight;
  } finally {
    cryptoInflight = null;
  }
}

export async function getEpisodeEmbedQueryHash(): Promise<string> {
  const crypto = await ensureAaCrypto();
  return crypto.queryHash;
}

export async function getEpisodeEmbedPersistedQuery(): Promise<{
  hash: string;
  query: string;
}> {
  const crypto = await ensureAaCrypto();
  return { hash: crypto.queryHash, query: crypto.episodeQuery };
}

/**
 * Match anipy-cli `build_source_request`: payload is `{v,ts,epoch,qh}` only
 * (no buildId), and IV material is `epoch:qh:ts`.
 */
function buildAaReq(persistedQueryHash: string, crypto: AaCrypto): string {
  const ts = Math.floor(Date.now() / ALLANIME_TS_BUCKET_MS) * ALLANIME_TS_BUCKET_MS;
  const aaReqBase = {
    v: 1,
    ts,
    epoch: crypto.epoch,
    qh: persistedQueryHash,
  };
  const ivMaterial = `${crypto.epoch}:${persistedQueryHash}:${ts}`;
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

function isPersistedQueryNotFound(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  const errors = (parsed as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return false;
  return errors.some((error) => {
    if (!error || typeof error !== "object") return false;
    const record = error as { message?: unknown; extensions?: { code?: unknown } };
    return (
      record.extensions?.code === "PERSISTED_QUERY_NOT_FOUND" ||
      record.message === "PersistedQueryNotFound"
    );
  });
}

async function tryPersistedQueryGet(
  variables: unknown,
  persistedQueryHash: string,
  crypto: AaCrypto,
  queryText?: string
): Promise<{ parsed: unknown | null; persistedQueryNotFound: boolean }> {
  const extensions: Record<string, unknown> = {
    persistedQuery: { version: 1, sha256Hash: persistedQueryHash },
    aaReq: buildAaReq(persistedQueryHash, crypto),
  };
  const url = new URL(`${ALLANIME_API}/api`);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("extensions", JSON.stringify(extensions));
  if (queryText) {
    url.searchParams.set("query", queryText);
  }

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Referer: `${ALLANIME_REFERER}/`,
        Origin: ALLANIME_ORIGIN,
        "User-Agent": getElectronUserAgent(),
      },
    });

    if (!res.ok) return { parsed: null, persistedQueryNotFound: false };

    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { parsed: null, persistedQueryNotFound: false };
    }

    if (isPersistedQueryNotFound(parsed)) {
      return { parsed: null, persistedQueryNotFound: true };
    }

    // Accept any well-formed GraphQL response that carries `data` and no `errors`.
    // This covers both the encrypted episode sourceUrls (tobeparsed) payload and the
    // plain `shows` payload used by search / recent uploads.
    if (!isAcceptableGetResponse(parsed)) return { parsed: null, persistedQueryNotFound: false };
    return { parsed, persistedQueryNotFound: false };
  } catch (error: unknown) {
    if (IS_DEV) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn(`[allanime-gql] persisted query GET failed, falling back to POST: ${message}`);
    }
    return { parsed: null, persistedQueryNotFound: false };
  }
}

export async function allAnimeGql<T>(
  variables: unknown,
  query: string,
  persistedQueryHash?: string
): Promise<T> {
  const crypto = persistedQueryHash ? await ensureAaCrypto() : null;
  const episodeQuery =
    persistedQueryHash && crypto && crypto.queryHash === persistedQueryHash
      ? crypto.episodeQuery
      : query;

  if (persistedQueryHash && crypto) {
    const hashOnly = await tryPersistedQueryGet(variables, persistedQueryHash, crypto);
    if (hashOnly.parsed) {
      return normalizeAllAnimePayload(hashOnly.parsed, crypto.key) as T;
    }

    // Apollo APQ / Cloudflare: hash-only can 520 or return PersistedQueryNotFound.
    // Retry with the full site query text that produces the hash (anipy-compatible).
    if (IS_DEV) {
      console.info(
        `[allanime-gql] hash-only GET missed (${
          hashOnly.persistedQueryNotFound ? "PersistedQueryNotFound" : "no data"
        }); retrying with full episode query (${episodeQuery.length} chars)`
      );
    }
    const withQuery = await tryPersistedQueryGet(
      variables,
      persistedQueryHash,
      crypto,
      episodeQuery
    );
    if (withQuery.parsed) {
      return normalizeAllAnimePayload(withQuery.parsed, crypto.key) as T;
    }
  }

  // POST path intentionally omits the Origin header. ani-cli only sets Origin on the
  // persisted-query GET, and AllAnime's gateway rejects POST bodies for `shows` queries
  // (search / recent uploads) when an Origin that doesn't match an allowed origin is sent.
  const body: Record<string, unknown> = {
    variables,
    query: persistedQueryHash ? episodeQuery : query,
  };
  if (persistedQueryHash && crypto) {
    body.extensions = {
      persistedQuery: { version: 1, sha256Hash: persistedQueryHash },
      aaReq: buildAaReq(persistedQueryHash, crypto),
    };
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
  if (IS_DEV && persistedQueryHash) {
    const record = json as { errors?: Array<{ message?: string }>; data?: { episode?: unknown } };
    if (Array.isArray(record.errors) && record.errors.length > 0) {
      console.warn(
        `[allanime-gql] episode POST errors: ${record.errors.map((e) => e.message).join("; ")}`
      );
    } else if (record.data && "tobeparsed" in (record.data as object)) {
      console.info("[allanime-gql] episode response has root tobeparsed");
    } else if (record.data?.episode == null) {
      console.warn("[allanime-gql] episode POST returned null episode");
    }
  }
  return normalizeAllAnimePayload(json, crypto?.key) as T;
}
