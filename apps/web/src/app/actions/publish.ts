"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { activePublisher } from "@/lib/integrations";
import { getPublisherForWorkspace, type Network, type PostFormat } from "@/lib/publishers";
import { renderSlides } from "@/lib/render";
import { validateDoc } from "@/lib/templates/doc";
import type { PostDoc, TemplateStyleId } from "@/lib/templates/types";
import type { ActionResult } from "./create";
import { Provider } from "@/generated/prisma/enums";

/**
 * Publishing. Renders the post's art through the shared renderer, then hands it
 * to the workspace's publishing provider — one scheduled row per channel, each
 * with its own idempotency key so a retry can't double-post.
 */

function fail(err: unknown): { ok: false; error: string } {
  const message = err instanceof Error ? err.message : "Something went wrong.";
  console.error("[publish]", err);
  return { ok: false, error: message };
}

const PROVIDER_TO_KEY: Record<string, "postiz" | "buffer" | "zernio"> = {
  [Provider.postiz]: "postiz",
  [Provider.buffer]: "buffer",
  [Provider.zernio]: "zernio",
};

export interface PublishOutcome {
  scheduledAt: string;
  channels: string[];
}

export async function publishPostAction(input: {
  postId: string;
  /** Platform keys chosen in step 1. */
  platforms: string[];
  mode: "schedule" | "now";
  /** ISO string when the user picked a custom time. */
  at?: string | null;
}): Promise<ActionResult<PublishOutcome>> {
  try {
    const auth = await requireAuth();
    const post = await prisma.post.findFirst({
      where: { id: input.postId, workspaceId: auth.workspaceId },
      include: { account: { include: { channels: true } } },
    });
    if (!post) throw new Error("Post not found.");

    const doc = post.doc as unknown as PostDoc;
    const style = post.style as TemplateStyleId;

    // Don't publish a draft with empty required slots.
    const issues = validateDoc(style, doc);
    if (issues.length) {
      throw new Error(
        `Fix ${issues.length} thing${issues.length === 1 ? "" : "s"} before publishing: ${issues
          .slice(0, 3)
          .map((i) => i.label)
          .join(", ")}`,
      );
    }

    const channels = post.account.channels.filter(
      (c) => input.platforms.includes(c.platform) && c.enabled,
    );
    if (!channels.length) throw new Error("Select at least one channel to publish to.");

    const missing = channels.filter((c) => !c.externalId);
    if (missing.length) {
      throw new Error(
        `These channels aren't linked to your publisher yet: ${missing.map((c) => c.platform).join(", ")}. Add their channel ids in Settings.`,
      );
    }

    const providerEnum = await activePublisher(auth.workspaceId);
    if (!providerEnum) {
      throw new Error("No publishing provider connected. Add one in Settings → Integrations.");
    }
    const providerKey = PROVIDER_TO_KEY[providerEnum];
    const publisher = await getPublisherForWorkspace(auth.workspaceId, providerKey);

    // Render through the shared renderer if we haven't already.
    let mediaUrls = post.mediaUrls;
    if (!mediaUrls.length) {
      const frames = await renderSlides(post.id);
      mediaUrls = frames.map((f) => f.url);
    }

    const when =
      input.mode === "now"
        ? new Date()
        : input.at
          ? new Date(input.at)
          : await publisher.getBestTime(channels[0].externalId!, channels[0].platform);

    if (Number.isNaN(when.getTime())) throw new Error("That scheduled time isn't valid.");

    const results: string[] = [];
    for (const channel of channels) {
      const idempotencyKey = `${post.id}:${channel.id}:${when.toISOString()}`;

      // A retry of an already-sent row must not post twice.
      const existing = await prisma.scheduledPost.findUnique({ where: { idempotencyKey } });
      if (existing && existing.status !== "failed") {
        results.push(channel.platform);
        continue;
      }

      const row = await prisma.scheduledPost.upsert({
        where: { idempotencyKey },
        create: {
          postId: post.id,
          channelId: channel.id,
          scheduledAt: when,
          provider: providerEnum,
          idempotencyKey,
          status: "pending",
        },
        update: { status: "pending", error: null },
      });

      try {
        const opts = {
          caption: post.caption,
          firstComment: post.firstComment || undefined,
          hashtags: post.hashtags,
          mediaUrls,
          format: style as PostFormat,
          channelId: channel.externalId!,
          network: channel.platform as Network,
          idempotencyKey,
        };

        const result =
          input.mode === "now"
            ? await publisher.publishNow(opts)
            : await publisher.schedule({ ...opts, scheduledAt: when });

        await prisma.scheduledPost.update({
          where: { id: row.id },
          data: {
            status: input.mode === "now" ? "published" : "scheduled",
            providerPostId: result.providerPostId,
            scheduledAt: result.scheduledAt,
          },
        });
        results.push(channel.platform);
      } catch (err) {
        await prisma.scheduledPost.update({
          where: { id: row.id },
          data: { status: "failed", error: err instanceof Error ? err.message : "Publish failed" },
        });
        throw err;
      }
    }

    await prisma.post.update({
      where: { id: post.id },
      data: { status: input.mode === "now" ? "published" : "scheduled" },
    });

    revalidatePath("/");
    revalidatePath("/pieces");

    return { ok: true, data: { scheduledAt: when.toISOString(), channels: results } };
  } catch (err) {
    return fail(err);
  }
}
