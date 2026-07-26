import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

/**
 * Media persistence. Mirrors the worker's storage module: a local volume in
 * development, Garage S3 in production, chosen by STORAGE_BACKEND.
 */

function storageRoot(): string {
  return path.resolve(env.storageDir());
}

/** Absolute path for a storage-relative key, or null if it escapes the root. */
export function resolveStoragePath(relative: string): string | null {
  const root = storageRoot();
  const full = path.resolve(root, relative);
  // `path.resolve` collapses traversal, so compare the result to the root.
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

let s3: S3Client | null = null;
function s3Client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: env.mediaS3Region(),
      endpoint: env.mediaS3Endpoint(),
      forcePathStyle: true,
    });
  }
  return s3;
}

/** Persist bytes and return a publicly fetchable URL. */
export async function saveAsset(
  relativePath: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  if (env.storageBackend() === "s3") {
    const bucket = env.mediaS3Bucket();
    if (!bucket) throw new Error("MEDIA_S3_BUCKET not set");
    await s3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: relativePath,
        Body: data,
        ContentType: contentType,
      }),
    );
    const base = env.mediaPublicBaseUrl();
    return base
      ? `${base.replace(/\/+$/, "")}/${relativePath}`
      : `${env.mediaS3Endpoint()?.replace(/\/+$/, "")}/${bucket}/${relativePath}`;
  }

  const full = resolveStoragePath(relativePath);
  if (!full) throw new Error("Invalid storage path");
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
  return `${env.publicMediaBaseUrl().replace(/\/+$/, "")}/${relativePath}`;
}

/** Storage key for a generated asset, namespaced by workspace and date. */
export function assetKey(workspaceId: string, kind: string, filename: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `workspaces/${workspaceId}/${kind}/${day}/${filename}`;
}
