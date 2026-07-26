import "server-only";
import { prisma } from "@/lib/db";
import { getSession, requireAuth } from "@/lib/session";

/**
 * Workspace-scoped reads. Every query here filters by the caller's workspace —
 * no route should query a tenant table without going through this module or
 * passing `workspaceId` explicitly.
 */

export type BrandAccountWithChannels = Awaited<ReturnType<typeof listAccounts>>[number];

export async function listAccounts(workspaceId: string) {
  return prisma.brandAccount.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: {
      channels: { orderBy: { platform: "asc" } },
      pillars: { orderBy: { position: "asc" } },
      logoAsset: true,
    },
  });
}

export async function getAccount(workspaceId: string, accountId: string) {
  return prisma.brandAccount.findFirst({
    where: { id: accountId, workspaceId },
    include: {
      channels: { orderBy: { platform: "asc" } },
      pillars: { orderBy: { position: "asc" } },
      logoAsset: true,
    },
  });
}

/**
 * The accounts a page renders plus the currently selected one. Falls back to
 * the first account when the session points at a deleted or foreign account.
 */
export async function loadWorkspaceContext() {
  const auth = await requireAuth();
  const session = await getSession();
  const accounts = await listAccounts(auth.workspaceId);

  const selected =
    accounts.find((a) => a.id === session.accountId) ?? accounts[0] ?? null;

  const workspace = await prisma.workspace.findUnique({ where: { id: auth.workspaceId } });

  return { auth, workspace, accounts, account: selected };
}

/** Persist the sidebar's account switch. */
export async function selectAccount(accountId: string) {
  const auth = await requireAuth();
  const account = await prisma.brandAccount.findFirst({
    where: { id: accountId, workspaceId: auth.workspaceId },
    select: { id: true },
  });
  if (!account) throw new Error("Account not found");
  const session = await getSession();
  session.accountId = account.id;
  await session.save();
}
