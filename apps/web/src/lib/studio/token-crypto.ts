import { createHash, randomBytes } from "node:crypto";

/**
 * Pure token generation/hashing — no database, no `server-only`.
 *
 * sha256 rather than bcrypt/argon2 on purpose: a slow KDF exists to frustrate
 * brute-forcing low-entropy human passwords, and this is 256 bits of CSPRNG
 * output verified on every single tool call. A work factor would only add
 * latency to the hot path.
 *
 * Hashed rather than encrypted (unlike lib/crypto.ts, which must recover
 * provider keys to call fal.ai): nothing ever needs to read a token back.
 */

const TOKEN_BYTES = 32;
const PREFIX_LENGTH = 12;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface GeneratedToken {
  token: string;
  tokenHash: string;
  prefix: string;
}

/** Pure generation, separated from persistence so it is unit-testable. */
export function generateToken(): GeneratedToken {
  const token = `rss_${randomBytes(TOKEN_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, PREFIX_LENGTH) };
}
