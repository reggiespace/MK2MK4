import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";
import { getManifest } from "@/lib/templates/manifests";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";

/**
 * Rendering bridge.
 *
 * The worker screenshots the app's own `/render/slide` route with headless
 * Chromium, so published art comes from the same React renderer that drew the
 * preview. Still frames render synchronously (seconds); reels go through the
 * async job + callback path because ffmpeg is slow.
 */

export interface RenderedFrame {
  url: string;
  slideIndex: number;
  width: number;
  height: number;
}

/**
 * Signed token authorising the worker to render one post's slides. The render
 * route is unauthenticated (headless Chromium carries no session), so the token
 * is what proves the request came from us.
 */
export function renderToken(postId: string): string {
  const secret = env.workerSharedSecret() ?? env.sessionSecret();
  return createHmac("sha256", secret).update(`render:${postId}`).digest("hex");
}

export function verifyRenderToken(postId: string, token: string): boolean {
  const expected = renderToken(postId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function workerHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = env.workerSharedSecret();
  if (secret) headers["x-worker-secret"] = secret;
  return headers;
}

/** Render every slide of a post to a stored image, and record the urls. */
export async function renderSlides(postId: string): Promise<RenderedFrame[]> {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new Error("Post not found.");

  const doc = post.doc as unknown as PostDoc;
  const style = post.style as TemplateStyleId;
  const man = getManifest(style);

  const job = await prisma.renderJob.create({
    data: { postId, kind: "slides", status: "running" },
  });
  await prisma.post.update({ where: { id: postId }, data: { status: "rendering" } });

  try {
    const res = await fetch(`${env.workerBaseUrl()}/render/slides`, {
      method: "POST",
      headers: workerHeaders(),
      body: JSON.stringify({
        postId,
        jobId: job.id,
        workspaceId: post.workspaceId,
        slideCount: doc.slides.length,
        width: man.canvas.width,
        height: man.canvas.height,
        // The worker navigates here per slide; the token authorises it.
        baseUrl: `${env.webBaseUrl()}/render/slide`,
        token: renderToken(postId),
      }),
    });

    if (!res.ok) throw new Error(`Render worker ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { frames?: RenderedFrame[] };
    const frames = (body.frames ?? []).sort((a, b) => a.slideIndex - b.slideIndex);
    if (!frames.length) throw new Error("The render worker returned no frames.");

    await prisma.renderJob.update({
      where: { id: job.id },
      data: { status: "done", progress: 100, outputs: { frames } as unknown as Prisma.InputJsonValue },
    });
    await prisma.post.update({
      where: { id: postId },
      data: { status: "review", mediaUrls: frames.map((f) => f.url) },
    });

    return frames;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    await prisma.renderJob.update({ where: { id: job.id }, data: { status: "failed", error: message } });
    await prisma.post.update({ where: { id: postId }, data: { status: "failed" } });
    throw err;
  }
}

/**
 * Queue a reel render. The worker renders the frames, applies motion and
 * transitions, muxes the narration track, then calls back with the mp4.
 */
export async function enqueueReelRender(postId: string): Promise<{ jobId: string }> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { voiceAsset: true },
  });
  if (!post) throw new Error("Post not found.");

  const doc = post.doc as unknown as PostDoc;
  const man = getManifest(post.style as TemplateStyleId);

  const job = await prisma.renderJob.create({ data: { postId, kind: "reel", status: "queued" } });
  await prisma.post.update({ where: { id: postId }, data: { status: "rendering" } });

  const res = await fetch(`${env.workerBaseUrl()}/render/reel`, {
    method: "POST",
    headers: workerHeaders(),
    body: JSON.stringify({
      postId,
      jobId: job.id,
      workspaceId: post.workspaceId,
      slideCount: doc.slides.length,
      width: man.canvas.width,
      height: man.canvas.height,
      baseUrl: `${env.webBaseUrl()}/render/slide`,
      token: renderToken(postId),
      audioUrl: post.voiceAsset?.url ?? null,
      callbackUrl: `${env.webBaseUrl()}/api/worker/callback`,
    }),
  });

  if (!res.ok) {
    const message = `Render worker ${res.status}: ${await res.text()}`;
    await prisma.renderJob.update({ where: { id: job.id }, data: { status: "failed", error: message } });
    await prisma.post.update({ where: { id: postId }, data: { status: "failed" } });
    throw new Error(message);
  }

  return { jobId: job.id };
}
