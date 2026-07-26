import "server-only";
import { prisma } from "@/lib/db";
import { imageMeta } from "@/lib/image-meta";
import { assetKey, saveAsset } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, UPLOADABLE_KINDS, UPLOAD_MIME } from "@/lib/upload";
import type { AssetKind } from "@/generated/prisma/enums";

/**
 * Uploads into the Assets library.
 *
 * fal.ai covers imagery the model can invent, but two things it can't: a brand's
 * own logo, and a real product screenshot. Both have to come off the user's
 * disk, so the library needs an ingest path of its own that lands in the same
 * table generated assets do — one library, two sources.
 */

export interface UploadInput {
  workspaceId: string;
  accountId: string | null;
  kind: AssetKind;
  file: File;
}

export interface UploadedAsset {
  id: string;
  name: string;
  url: string;
  kind: AssetKind;
  width: number | null;
  height: number | null;
}

/**
 * Strip a filename down to something safe to show. Users paste in names with
 * slashes, quotes and emoji; the storage key is generated separately so nothing
 * here reaches the filesystem, but the display name still shouldn't carry
 * separators or control characters.
 */
function cleanName(raw: string): string {
  const base = raw.replace(/\.[^.]+$/, "").replace(/[\p{C}\\/]+/gu, " ");
  return base.trim().slice(0, 64) || "Untitled";
}

export async function uploadAsset(input: UploadInput): Promise<UploadedAsset> {
  if (!(UPLOADABLE_KINDS as readonly string[]).includes(input.kind)) {
    throw new Error("That asset kind can't be uploaded.");
  }

  const { file } = input;
  if (!file || file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
  }

  const ext = UPLOAD_MIME[file.type];
  if (!ext) throw new Error("Upload a PNG, JPEG, WebP, GIF or SVG.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const meta = imageMeta(bytes);
  // A declared MIME type is just a claim from the browser. If the header does
  // not parse as any image we recognise, the file isn't what it says it is.
  if (!meta) throw new Error("That file isn't a readable image.");

  const key = assetKey(input.workspaceId, "uploads", `${crypto.randomUUID()}.${ext}`);
  const url = await saveAsset(key, bytes, file.type);

  const asset = await prisma.asset.create({
    data: {
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      name: cleanName(file.name),
      kind: input.kind,
      url,
      storageKey: key,
      mimeType: file.type,
      width: meta.width,
      height: meta.height,
      bytes: bytes.byteLength,
      ai: false,
    },
  });

  return {
    id: asset.id,
    name: asset.name,
    url: asset.url,
    kind: asset.kind,
    width: asset.width,
    height: asset.height,
  };
}
