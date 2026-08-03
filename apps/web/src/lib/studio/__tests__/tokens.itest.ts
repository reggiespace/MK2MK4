import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { StudioError } from "../errors";
import { listTokens, mintToken, requireScope, revokeToken, verifyToken } from "../tokens";
import { withTestWorkspace } from "./helpers";

/**
 * The auth path's negative cases matter more than the happy one: every rejection
 * here is a door someone could otherwise walk through.
 */
describe("verifyToken", () => {
  it("resolves a fresh token to its workspace, user and scopes", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "Hermes cron",
        scopes: ["draft", "media"],
      });

      const caller = await verifyToken(`Bearer ${token}`);
      expect(caller).toEqual({
        workspaceId: f.workspaceId,
        userId: f.userId,
        tokenId: id,
        scopes: ["draft", "media"],
      });
    }));

  it("accepts the raw value as well as the Bearer form", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await expect(verifyToken(token)).resolves.toMatchObject({ workspaceId: f.workspaceId });
    }));

  it("never stores the plaintext", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      const row = await prisma.apiToken.findUniqueOrThrow({ where: { id } });
      expect(JSON.stringify(row)).not.toContain(token.slice(4));
    }));

  it("rejects an absent header", async () => {
    await expect(verifyToken(null)).rejects.toBeInstanceOf(StudioError);
  });

  it("rejects a well-formed token that was never issued", async () => {
    await expect(verifyToken("Bearer rss_notarealtokenatall")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects a value without the rss_ prefix without touching the database", async () => {
    await expect(verifyToken("Bearer hunter2")).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a revoked token", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await revokeToken(f.workspaceId, id);
      await expect(verifyToken(token)).rejects.toMatchObject({ code: "forbidden" });
    }));

  it("rejects an expired token", () =>
    withTestWorkspace(async (f) => {
      const { token } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(verifyToken(token)).rejects.toMatchObject({ code: "forbidden" });
    }));

  it("records lastUsedAt so the operator can see which agent actually ran", () =>
    withTestWorkspace(async (f) => {
      const { token, id } = await mintToken({
        workspaceId: f.workspaceId,
        userId: f.userId,
        name: "t",
        scopes: ["draft"],
      });
      await verifyToken(token);
      // The touch is fire-and-forget, so poll briefly rather than assume ordering.
      let lastUsedAt: Date | null = null;
      for (let i = 0; i < 20 && !lastUsedAt; i++) {
        await new Promise((r) => setTimeout(r, 25));
        lastUsedAt = (await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt;
      }
      expect(lastUsedAt).toBeInstanceOf(Date);
    }));
});

describe("mintToken", () => {
  it("refuses an unknown scope", () =>
    withTestWorkspace(async (f) => {
      await expect(
        mintToken({
          workspaceId: f.workspaceId,
          userId: f.userId,
          name: "t",
          scopes: ["publish"],
        }),
      ).rejects.toMatchObject({ code: "bad_request" });
    }));

  it("refuses an empty name and an empty scope list", () =>
    withTestWorkspace(async (f) => {
      await expect(
        mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "  ", scopes: ["draft"] }),
      ).rejects.toMatchObject({ code: "bad_request" });
      await expect(
        mintToken({ workspaceId: f.workspaceId, userId: f.userId, name: "t", scopes: [] }),
      ).rejects.toMatchObject({ code: "bad_request" });
    }));
});

describe("listTokens and revokeToken", () => {
  it("lists prefixes but no hashes, and will not revoke another workspace's token", () =>
    withTestWorkspace(async (f) =>
      withTestWorkspace(async (other) => {
        const { id, prefix } = await mintToken({
          workspaceId: f.workspaceId,
          userId: f.userId,
          name: "Hermes cron",
          scopes: ["draft"],
        });

        const rows = await listTokens(f.workspaceId);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ name: "Hermes cron", prefix });
        expect(rows[0]).not.toHaveProperty("tokenHash");

        await expect(revokeToken(other.workspaceId, id)).rejects.toMatchObject({
          code: "not_found",
        });
      }),
    ));
});

describe("requireScope", () => {
  it("throws forbidden when the scope is absent", () => {
    const caller = { workspaceId: "w", userId: "u", tokenId: "t", scopes: ["draft"] };
    expect(() => requireScope(caller, "draft")).not.toThrow();
    expect(() => requireScope(caller, "media")).toThrow(StudioError);
  });
});
