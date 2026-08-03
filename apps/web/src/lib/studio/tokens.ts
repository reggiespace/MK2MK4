import "server-only";
import { prisma } from "@/lib/db";
import { StudioError } from "./errors";
import { ALL_SCOPES, type StudioCaller } from "./types";
import { generateToken, hashToken } from "./token-crypto";

/**
 * Agent bearer tokens — the database-backed half. Pure generation/hashing
 * lives in ./token-crypto so it can be unit-tested without a DATABASE_URL.
 */

// Re-exported so existing importers of `hashToken`/`generateToken` from this
// module keep working after the split.
export { generateToken, hashToken };

export interface MintTokenInput {
  workspaceId: string;
  userId: string;
  name: string;
  scopes: string[];
  dailyCapCents?: number;
  dailyDraftCap?: number;
  expiresAt?: Date | null;
}

/**
 * Mint a token. The plaintext is returned exactly once and never stored — the
 * caller must show it to the operator immediately or lose it.
 */
export async function mintToken(
  input: MintTokenInput,
): Promise<{ token: string; id: string; prefix: string }> {
  const name = input.name.trim();
  if (!name) throw new StudioError("bad_request", "Give the token a name.");

  const unknown = input.scopes.filter((s) => !ALL_SCOPES.includes(s as never));
  if (unknown.length) {
    throw new StudioError("bad_request", `Unknown scope: ${unknown.join(", ")}`);
  }
  if (!input.scopes.length) {
    throw new StudioError("bad_request", "Grant the token at least one scope.");
  }

  const { token, tokenHash, prefix } = generateToken();
  const row = await prisma.apiToken.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId,
      name,
      tokenHash,
      prefix,
      scopes: input.scopes,
      ...(input.dailyCapCents !== undefined ? { dailyCapCents: input.dailyCapCents } : {}),
      ...(input.dailyDraftCap !== undefined ? { dailyDraftCap: input.dailyDraftCap } : {}),
      expiresAt: input.expiresAt ?? null,
    },
    select: { id: true },
  });

  return { token, id: row.id, prefix };
}

/**
 * Resolve an `Authorization: Bearer …` value to a caller.
 *
 * One indexed lookup on the hash — no scan, and no comparison of secrets.
 * Every rejection is the same shape so a caller cannot distinguish "no such
 * token" from "revoked" by the error alone.
 */
export async function verifyToken(bearer: string | null): Promise<StudioCaller> {
  const denied = () => new StudioError("forbidden", "Invalid or expired token.");

  if (!bearer) throw denied();
  const value = bearer.startsWith("Bearer ") ? bearer.slice(7).trim() : bearer.trim();
  if (!value.startsWith("rss_")) throw denied();

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(value) },
    select: {
      id: true,
      workspaceId: true,
      userId: true,
      scopes: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!row) throw denied();
  if (row.revokedAt) throw denied();
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) throw denied();

  // Best-effort; a failed touch must not fail the request.
  void prisma.apiToken
    .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    workspaceId: row.workspaceId,
    userId: row.userId,
    tokenId: row.id,
    scopes: row.scopes,
  };
}

export function requireScope(caller: StudioCaller, scope: string): void {
  if (!caller.scopes.includes(scope)) {
    throw new StudioError("forbidden", `This token lacks the "${scope}" scope.`);
  }
}

export interface TokenSummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  dailyCapCents: number;
  dailyDraftCap: number;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export async function listTokens(workspaceId: string): Promise<TokenSummary[]> {
  return prisma.apiToken.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      dailyCapCents: true,
      dailyDraftCap: true,
      lastUsedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });
}

/** Revoke keeps the row for audit; rotation is mint-new-then-revoke-old. */
export async function revokeToken(workspaceId: string, id: string): Promise<void> {
  const { count } = await prisma.apiToken.updateMany({
    where: { id, workspaceId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!count) throw new StudioError("not_found", "Token not found.");
}
