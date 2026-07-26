import "server-only";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireCredential } from "@/lib/integrations";
import { assetKey, saveAsset } from "@/lib/storage";
import { Provider } from "@/generated/prisma/enums";
import { getManifest } from "@/lib/templates/manifests";
import type { TemplateStyleId } from "@/lib/templates/types";

/**
 * fal.ai image generation for template image slots.
 *
 * Results are copied into our own storage and saved to the workspace's Assets
 * library, so a generated image is reusable rather than a one-off — the design
 * calls for auto-save on generate.
 */

const FAL_QUEUE = "https://queue.fal.run";

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

/** Aspect the slot expects, so the generation matches its frame. */
function imageSize(style: TemplateStyleId): { width: number; height: number } {
  const { canvas } = getManifest(style);
  return { width: canvas.width, height: canvas.height };
}

async function falRequest(apiKey: string, model: string, input: Record<string, unknown>) {
  const submit = await fetch(`${FAL_QUEUE}/${model}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify(input),
  });
  if (!submit.ok) throw new Error(`fal.ai ${submit.status}: ${await submit.text()}`);
  const queued = (await submit.json()) as { status_url?: string; response_url?: string };

  const statusUrl = queued.status_url;
  const responseUrl = queued.response_url;
  if (!statusUrl || !responseUrl) throw new Error("fal.ai did not return a queue handle");

  // Poll until the queue reports completion. fal jobs are seconds, not minutes.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } });
    if (!res.ok) throw new Error(`fal.ai status ${res.status}: ${await res.text()}`);
    const status = (await res.json()) as { status?: string };
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED") throw new Error("fal.ai generation failed");
    await new Promise((r) => setTimeout(r, 1500));
  }

  const final = await fetch(responseUrl, { headers: { Authorization: `Key ${apiKey}` } });
  if (!final.ok) throw new Error(`fal.ai result ${final.status}: ${await final.text()}`);
  return (await final.json()) as { images?: FalImage[] };
}

export interface GenerateImageInput {
  workspaceId: string;
  accountId: string;
  prompt: string;
  style: TemplateStyleId;
}

export interface GeneratedAsset {
  id: string;
  name: string;
  url: string;
  ai: true;
  kind: "photo";
}

/** Generate one image, store it, and add it to the Assets library. */
export async function generateImage(input: GenerateImageInput): Promise<GeneratedAsset> {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("Describe the image before generating.");

  const cred = await requireCredential(input.workspaceId, Provider.fal);
  const { width, height } = imageSize(input.style);

  const result = await falRequest(cred.apiKey, env.falImageModel(), {
    prompt,
    image_size: { width, height },
    num_images: 1,
  });

  const image = result.images?.[0];
  if (!image?.url) throw new Error("fal.ai returned no image.");

  // Copy off fal's CDN — their URLs expire, ours don't.
  const download = await fetch(image.url);
  if (!download.ok) throw new Error(`Could not download the generated image (${download.status}).`);
  const bytes = Buffer.from(await download.arrayBuffer());
  const contentType = image.content_type ?? "image/png";
  const ext = contentType.includes("jpeg") ? "jpg" : "png";

  const key = assetKey(input.workspaceId, "generated", `${crypto.randomUUID()}.${ext}`);
  const url = await saveAsset(key, bytes, contentType);

  const name = prompt.replace(/\s+/g, " ").slice(0, 48);
  const asset = await prisma.asset.create({
    data: {
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      name,
      kind: "photo",
      url,
      storageKey: key,
      mimeType: contentType,
      width: image.width ?? width,
      height: image.height ?? height,
      bytes: bytes.byteLength,
      ai: true,
      prompt,
    },
  });

  return { id: asset.id, name: asset.name, url: asset.url, ai: true, kind: "photo" };
}
