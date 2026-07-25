"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { connectIntegration, disconnectIntegration, resolveCredential } from "@/lib/integrations";
import { PostizPublisher } from "@/lib/publishers/postiz";
import { Provider } from "@/generated/prisma/enums";
import type { ActionResult } from "./create";

/** Settings mutations. Each re-checks auth and scopes to the caller's workspace. */

function fail(err: unknown): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error("[settings]", err);
  return { ok: false, error: message };
}

const providerSchema = z.enum([
  Provider.postiz,
  Provider.buffer,
  Provider.zernio,
  Provider.fal,
  Provider.elevenlabs,
  Provider.openai,
]);

export async function connectIntegrationAction(input: {
  provider: string;
  apiKey: string;
  baseUrl?: string;
}): Promise<ActionResult<{ connected: true }>> {
  try {
    const auth = await requireAuth();
    const provider = providerSchema.parse(input.provider);
    if (!input.apiKey.trim()) throw new Error("Paste an API key first.");

    await connectIntegration(auth.workspaceId, provider, input.apiKey, input.baseUrl?.trim() || undefined);
    revalidatePath("/settings");
    return { ok: true, data: { connected: true } };
  } catch (err) {
    return fail(err);
  }
}

export async function disconnectIntegrationAction(provider: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const auth = await requireAuth();
    await disconnectIntegration(auth.workspaceId, providerSchema.parse(provider));
    revalidatePath("/settings");
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Verify a publishing key really works and report the channels it exposes, so
 * a wrong key fails here rather than at publish time.
 */
export async function testIntegrationAction(
  provider: string,
): Promise<ActionResult<{ message: string; channels: { id: string; name: string }[] }>> {
  try {
    const auth = await requireAuth();
    const p = providerSchema.parse(provider);
    const cred = await resolveCredential(auth.workspaceId, p);
    if (!cred) throw new Error("Nothing connected for this provider yet.");

    if (p !== Provider.postiz) {
      return { ok: true, data: { message: "Key stored. No connection test available for this provider.", channels: [] } };
    }

    const publisher = new PostizPublisher({ apiKey: cred.apiKey, baseUrl: cred.baseUrl });
    const integrations = await publisher.listIntegrations();

    await prisma.integration.updateMany({
      where: { workspaceId: auth.workspaceId, provider: p },
      data: { lastSyncAt: new Date() },
    });
    revalidatePath("/settings");

    return {
      ok: true,
      data: {
        message: `Connected · ${integrations.length} channel${integrations.length === 1 ? "" : "s"} available`,
        channels: integrations.map((i) => ({ id: i.id, name: i.name })),
      },
    };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Brand account
// ---------------------------------------------------------------------------

async function ownedAccount(accountId: string) {
  const auth = await requireAuth();
  const account = await prisma.brandAccount.findFirst({
    where: { id: accountId, workspaceId: auth.workspaceId },
  });
  if (!account) throw new Error("Account not found.");
  return { auth, account };
}

export async function updateVoiceAction(input: {
  accountId: string;
  voiceDescription: string;
  tones: string[];
  readingLevel: string;
  claimsGuardrail: boolean;
  downloadUrl: string;
}): Promise<ActionResult<{ saved: true }>> {
  try {
    const { account } = await ownedAccount(input.accountId);
    await prisma.brandAccount.update({
      where: { id: account.id },
      data: {
        voiceDescription: input.voiceDescription,
        tones: input.tones,
        readingLevel: input.readingLevel as "grade7",
        claimsGuardrail: input.claimsGuardrail,
        downloadUrl: input.downloadUrl.trim() || null,
      },
    });
    revalidatePath("/settings");
    return { ok: true, data: { saved: true } };
  } catch (err) {
    return fail(err);
  }
}

export async function addPillarAction(accountId: string, name: string): Promise<ActionResult<{ id: string }>> {
  try {
    const { account } = await ownedAccount(accountId);
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Give the pillar a name.");

    const count = await prisma.pillar.count({ where: { accountId: account.id } });
    const pillar = await prisma.pillar.upsert({
      where: { accountId_name: { accountId: account.id, name: trimmed } },
      create: { accountId: account.id, name: trimmed, position: count },
      update: {},
    });
    revalidatePath("/settings");
    return { ok: true, data: { id: pillar.id } };
  } catch (err) {
    return fail(err);
  }
}

export async function removePillarAction(accountId: string, pillarId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const { account } = await ownedAccount(accountId);
    await prisma.pillar.deleteMany({ where: { id: pillarId, accountId: account.id } });
    revalidatePath("/settings");
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

const platformSchema = z.enum(["instagram", "facebook", "tiktok", "youtube", "linkedin", "x"]);

export async function upsertChannelAction(input: {
  accountId: string;
  platform: string;
  handle: string;
  externalId: string;
}): Promise<ActionResult<{ ok: true }>> {
  try {
    const { account } = await ownedAccount(input.accountId);
    const platform = platformSchema.parse(input.platform);
    await prisma.channel.upsert({
      where: { accountId_platform: { accountId: account.id, platform } },
      create: {
        accountId: account.id,
        platform,
        handle: input.handle.trim() || account.handle,
        externalId: input.externalId.trim() || null,
      },
      update: {
        handle: input.handle.trim() || account.handle,
        externalId: input.externalId.trim() || null,
      },
    });
    revalidatePath("/settings");
    revalidatePath("/create");
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}

export async function removeChannelAction(accountId: string, channelId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const { account } = await ownedAccount(accountId);
    await prisma.channel.deleteMany({ where: { id: channelId, accountId: account.id } });
    revalidatePath("/settings");
    revalidatePath("/create");
    return { ok: true, data: { ok: true } };
  } catch (err) {
    return fail(err);
  }
}
