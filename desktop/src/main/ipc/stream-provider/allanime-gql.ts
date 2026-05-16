import { createDecipheriv, createHash } from "crypto";

import { getElectronUserAgent } from "@/main/electron-user-agent";

export const ALLANIME_REFERER = "https://youtu-chan.com";

const ALLANIME_BASE = "allanime.day";
export const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const IS_DEV = process.env.NODE_ENV !== "production";

const TOBE_PARSED_FIELD = "tobeparsed";
const ALLANIME_AES_ALGO = "aes-256-ctr";
const ALLANIME_BLOB_VERSION = 0x01;
const ALLANIME_VERSION_LENGTH = 1;
const ALLANIME_IV_LENGTH = 12;
const ALLANIME_AUTH_TAG_LENGTH = 16;
const ALLANIME_COUNTER_SUFFIX = Buffer.from([0x00, 0x00, 0x00, 0x02]);
const ALLANIME_SECRET = "Xot36i3lK3:v1";
const ALLANIME_KEY = createHash("sha256").update(ALLANIME_SECRET).digest();

function parseDecryptedPayload(payload: string): unknown {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function decryptTobeparsed(blobBase64: string): unknown {
  const blob = Buffer.from(blobBase64, "base64");
  const minimumLength = ALLANIME_VERSION_LENGTH + ALLANIME_IV_LENGTH + ALLANIME_AUTH_TAG_LENGTH;
  if (blob.length < minimumLength) {
    throw new Error("Encrypted payload is too short");
  }
  const version = blob[0];
  if (version !== ALLANIME_BLOB_VERSION) {
    throw new Error(`Unsupported Allanime blob version: ${version}`);
  }

  const ivStart = ALLANIME_VERSION_LENGTH;
  const ivEnd = ivStart + ALLANIME_IV_LENGTH;
  const ciphertextStart = ivEnd;
  const ciphertextEnd = blob.length - ALLANIME_AUTH_TAG_LENGTH;
  if (ciphertextEnd < ciphertextStart) {
    throw new Error("Encrypted payload has invalid ciphertext boundaries");
  }

  const iv = blob.subarray(ivStart, ivEnd);
  const ciphertext = blob.subarray(ciphertextStart, ciphertextEnd);
  const ctrIv = Buffer.concat([iv, ALLANIME_COUNTER_SUFFIX]);

  const decipher = createDecipheriv(ALLANIME_AES_ALGO, ALLANIME_KEY, ctrIv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return parseDecryptedPayload(decrypted.toString("utf8"));
}

function normalizeTobeparsed(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeTobeparsed(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    normalized[key] = normalizeTobeparsed(entry);
  }

  const encrypted =
    typeof normalized[TOBE_PARSED_FIELD] === "string" ? normalized[TOBE_PARSED_FIELD] : null;
  if (encrypted) {
    try {
      const decrypted = normalizeTobeparsed(decryptTobeparsed(encrypted));
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
  persistedQueryHash: string
): Promise<unknown | null> {
  const extensions = {
    persistedQuery: { version: 1, sha256Hash: persistedQueryHash },
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
  if (persistedQueryHash) {
    const getResult = await tryPersistedQueryGet(variables, persistedQueryHash);
    if (getResult) {
      return normalizeTobeparsed(getResult) as T;
    }
  }

  // POST path intentionally omits the Origin header. ani-cli only sets Origin on the
  // persisted-query GET, and AllAnime's gateway rejects POST bodies for `shows` queries
  // (search / recent uploads) when an Origin that doesn't match an allowed origin is sent.
  const res = await fetch(`${ALLANIME_API}/api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: ALLANIME_REFERER,
      "User-Agent": getElectronUserAgent(),
    },
    body: JSON.stringify({ variables, query }),
  });

  if (!res.ok) {
    throw new Error(`allanime request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as unknown;
  return normalizeTobeparsed(json) as T;
}
