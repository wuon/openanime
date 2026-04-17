import { createDecipheriv, createHash } from "crypto";

import { getElectronUserAgent } from "@/main/electron-user-agent";

export const ALLANIME_REFERER = "https://allmanga.to";

const ALLANIME_BASE = "allanime.day";
export const ALLANIME_API = `https://api.${ALLANIME_BASE}`;
const IS_DEV = process.env.NODE_ENV !== "production";

const TOBE_PARSED_FIELD = "tobeparsed";
const ALLANIME_AES_ALGO = "aes-256-ctr";
const ALLANIME_IV_LENGTH = 12;
const ALLANIME_AUTH_TAG_LENGTH = 16;
const ALLANIME_COUNTER_SUFFIX = Buffer.from([0x00, 0x00, 0x00, 0x02]);
const ALLANIME_SECRET = "SimtVuagFbGR2K7P";
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
  const minimumLength = ALLANIME_IV_LENGTH + ALLANIME_AUTH_TAG_LENGTH;
  if (blob.length <= minimumLength) {
    throw new Error("Encrypted payload is too short");
  }

  const iv = blob.subarray(0, ALLANIME_IV_LENGTH);
  const ciphertext = blob.subarray(ALLANIME_IV_LENGTH, blob.length - ALLANIME_AUTH_TAG_LENGTH);
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

export async function allAnimeGql<T>(variables: unknown, query: string): Promise<T> {
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
