"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { uploadAsset, type UploadedAsset } from "@/lib/assets";
import type { ActionResult } from "./create";

/**
 * Asset library mutations — upload, and setting a brand's logo.
 *
 * Uploads arrive as `FormData` because a `File` can't cross the Server Action
 * boundary as a plain field; the whole form is the argument.
 */

function fail(err: unknown): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error("[assets]", err);
  return { ok: false, error: message };
}

const kindSchema = z.enum(["photo", "screen", "logo"]);

export async function uploadAssetAction(form: FormData): Promise<ActionResult<UploadedAsset>> {
  try {
    const auth = await requireAuth();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Choose a file to upload.");

    const kind = kindSchema.parse(form.get("kind") ?? "photo");
    const accountId = typeof form.get("accountId") === "string" ? String(form.get("accountId")) : "";

    // An asset may be workspace-wide (accountId null) or scoped to one brand.
    // Scoping is only honoured for an account the caller actually owns.
    let scoped: string | null = null;
    if (accountId) {
      const account = await prisma.brandAccount.findFirst({
        where: { id: accountId, workspaceId: auth.workspaceId },
        select: { id: true },
      });
      scoped = account?.id ?? null;
    }

    const asset = await uploadAsset({
      workspaceId: auth.workspaceId,
      accountId: scoped,
      kind,
      file,
    });

    revalidatePath("/assets");
    return { ok: true, data: asset };
  } catch (err) {
    return fail(err);
  }
}

/**
 * Point a brand at a logo asset, or clear it with `null`.
 *
 * The asset must already be in the caller's workspace — this never uploads, so
 * the picker can offer anything in the library rather than forcing a re-upload
 * of a mark that is already there.
 */
export async function setBrandLogoAction(
  accountId: string,
  assetId: string | null,
): Promise<ActionResult<{ logoUrl: string | null }>> {
  try {
    const auth = await requireAuth();
    const account = await prisma.brandAccount.findFirst({
      where: { id: accountId, workspaceId: auth.workspaceId },
      select: { id: true },
    });
    if (!account) throw new Error("Account not found.");

    if (!assetId) {
      await prisma.brandAccount.update({ where: { id: account.id }, data: { logoAssetId: null } });
      revalidatePath("/settings");
      return { ok: true, data: { logoUrl: null } };
    }

    const asset = await prisma.asset.findFirst({
      where: { id: assetId, workspaceId: auth.workspaceId },
      select: { id: true, url: true, kind: true },
    });
    if (!asset) throw new Error("That asset isn't in this workspace.");
    if (asset.kind !== "logo") throw new Error("Pick an asset filed under Logo.");

    await prisma.brandAccount.update({
      where: { id: account.id },
      data: { logoAssetId: asset.id },
    });
    revalidatePath("/settings");
    revalidatePath("/create");
    return { ok: true, data: { logoUrl: asset.url } };
  } catch (err) {
    return fail(err);
  }
}

/** Logo candidates for the Settings picker: workspace-wide plus this brand's. */
export async function listLogoAssetsAction(
  accountId: string,
): Promise<ActionResult<{ id: string; name: string; url: string }[]>> {
  try {
    const auth = await requireAuth();
    const assets = await prisma.asset.findMany({
      where: {
        workspaceId: auth.workspaceId,
        kind: "logo",
        OR: [{ accountId }, { accountId: null }],
      },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, name: true, url: true },
    });
    return { ok: true, data: assets };
  } catch (err) {
    return fail(err);
  }
}
