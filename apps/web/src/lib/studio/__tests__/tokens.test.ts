import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { generateToken, hashToken } from "../tokens";

/**
 * The pure half of tokens.ts. The DB-backed half is in tokens.itest.ts.
 *
 * These assert the two properties the auth path depends on: that the hash is a
 * plain sha256 of the whole token (so lookup is a single indexed query), and
 * that the prefix leaks only what the UI needs to identify a row.
 */
describe("generateToken", () => {
  it("produces an rss_-prefixed token with 256 bits of entropy", () => {
    const { token } = generateToken();
    expect(token.startsWith("rss_")).toBe(true);
    // 32 bytes base64url encodes to 43 chars, no padding.
    expect(token.slice(4)).toHaveLength(43);
    expect(token.slice(4)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateToken().token));
    expect(seen.size).toBe(200);
  });

  it("derives a 12-char prefix that is not enough to reconstruct the token", () => {
    const { token, prefix } = generateToken();
    expect(prefix).toBe(token.slice(0, 12));
    expect(token.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(token.length);
  });

  it("hashes the full token with sha256", () => {
    const { token, tokenHash } = generateToken();
    expect(tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(tokenHash).toHaveLength(64);
  });
});

describe("hashToken", () => {
  it("is deterministic, so an incoming bearer resolves by equality", () => {
    expect(hashToken("rss_abc")).toBe(hashToken("rss_abc"));
  });

  it("differs for different tokens", () => {
    expect(hashToken("rss_abc")).not.toBe(hashToken("rss_abd"));
  });
});
