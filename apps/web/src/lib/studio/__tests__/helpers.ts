import { prisma } from "@/lib/db";
import { uiCaller, type StudioCaller } from "../types";

/**
 * A throwaway workspace, user and brand account per test.
 *
 * Cascade deletes do the cleanup: every tenant table hangs off Workspace with
 * onDelete: Cascade, so removing the workspace removes the rows the test made
 * even when it failed partway through.
 */
export interface TestFixture {
  workspaceId: string;
  userId: string;
  accountId: string;
  caller: StudioCaller;
}

let counter = 0;

export async function withTestWorkspace<T>(fn: (f: TestFixture) => Promise<T>): Promise<T> {
  const tag = `itest-${process.pid}-${counter++}`;

  const workspace = await prisma.workspace.create({
    data: { name: tag, slug: tag },
    select: { id: true },
  });

  const user = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: `${tag}@example.test`,
      passwordHash: "not-a-real-hash",
    },
    select: { id: true },
  });

  const account = await prisma.brandAccount.create({
    data: {
      workspaceId: workspace.id,
      key: tag,
      name: "Test Brand",
      locale: "en",
      handle: "@testbrand",
      initials: "TB",
      voiceDescription: "Plain, calm, evidence-led.",
      tones: ["calm"],
      readingLevel: "grade7",
      claimsGuardrail: true,
    },
    select: { id: true },
  });

  try {
    return await fn({
      workspaceId: workspace.id,
      userId: user.id,
      accountId: account.id,
      caller: uiCaller(workspace.id, user.id),
    });
  } finally {
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => {});
  }
}
