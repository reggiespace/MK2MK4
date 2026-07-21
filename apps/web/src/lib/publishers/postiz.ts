import "server-only";
import { env } from "@/lib/env";
import type { Publisher, ScheduleOptions, PublishResult } from "./types";
import { composePostText } from "./compose";

/**
 * Postiz publisher (self-hosted at postiz.reggiespace.ca).
 *
 * Public API: `${POSTIZ_BASE_URL}/public/v1`, authenticated with the raw API
 * key in the `Authorization` header (no `Bearer` prefix). Media must be pushed
 * into Postiz first (upload-from-url) and then referenced by id when creating
 * the post. Postiz calls a channel an "integration".
 */

interface PostizUpload {
  id: string;
  path?: string;
}

async function postizFetch(path: string, options: RequestInit = {}) {
  const key = env.postizApiKey();
  if (!key) throw new Error("POSTIZ_API_KEY not set");
  const base = env.postizBaseUrl();
  const res = await fetch(`${base}/public/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: key,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Postiz API ${res.status}: ${await res.text()}`);
  // Some endpoints (e.g. delete) return no body.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export class PostizPublisher implements Publisher {
  name = "postiz";

  async getBestTime(_channelId: string, _network: string): Promise<Date> {
    // Postiz has no best-time endpoint; the cadence layer decides slots.
    // Fallback: tomorrow at 9am local.
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t;
  }

  /** Push each media URL into Postiz and return the resulting upload ids. */
  private async uploadMedia(mediaUrls: string[]): Promise<PostizUpload[]> {
    const uploads: PostizUpload[] = [];
    for (const url of mediaUrls) {
      const data = await postizFetch("/upload-from-url", {
        method: "POST",
        body: JSON.stringify({ url }),
      });
      const id = data?.id ?? data?.[0]?.id;
      if (!id) throw new Error(`Postiz upload returned no id for ${url}`);
      uploads.push({ id, path: data?.path });
    }
    return uploads;
  }

  /**
   * Build the `posts` array for a single integration. Stories carry no caption
   * or hashtags on the media itself; everything else posts the composed text.
   */
  private buildPosts(
    opts: ScheduleOptions | Omit<ScheduleOptions, "scheduledAt">,
    uploads: PostizUpload[],
  ) {
    const isStory = opts.format === "story";
    const content = isStory ? "" : composePostText(opts.caption, opts.hashtags);
    return [
      {
        integration: { id: opts.channelId },
        value: [{ content, image: uploads.map((u) => ({ id: u.id })) }],
        settings: this.settingsFor(opts),
      },
    ];
  }

  private settingsFor(opts: ScheduleOptions | Omit<ScheduleOptions, "scheduledAt">) {
    // Postiz derives most per-network behaviour from the integration itself.
    // We only signal the post sub-type so Instagram routes reels/stories
    // correctly; first comments ride along when present.
    const settings: Record<string, unknown> = {};
    if (opts.network === "instagram") {
      settings.post_type = opts.format === "story" ? "story" : opts.format === "reel" ? "reel" : "post";
    }
    if (opts.firstComment && opts.format !== "story") {
      settings.__comment = opts.firstComment;
    }
    return settings;
  }

  private async createPost(
    type: "schedule" | "now",
    date: Date,
    opts: ScheduleOptions | Omit<ScheduleOptions, "scheduledAt">,
    uploads: PostizUpload[],
  ): Promise<PublishResult> {
    const data = await postizFetch("/posts", {
      method: "POST",
      body: JSON.stringify({
        type,
        shortLink: false,
        date: date.toISOString(),
        tags: [],
        posts: this.buildPosts(opts, uploads),
      }),
    });
    const providerPostId =
      data?.id ?? data?.postId ?? data?.[0]?.postId ?? data?.[0]?.id ?? "";
    return { providerPostId, scheduledAt: date };
  }

  async schedule(opts: ScheduleOptions): Promise<PublishResult> {
    const uploads = await this.uploadMedia(opts.mediaUrls);
    return this.createPost("schedule", opts.scheduledAt, opts, uploads);
  }

  async publishNow(opts: Omit<ScheduleOptions, "scheduledAt">): Promise<PublishResult> {
    const uploads = await this.uploadMedia(opts.mediaUrls);
    return this.createPost("now", new Date(), opts, uploads);
  }

  async dryRun(opts: ScheduleOptions): Promise<Record<string, unknown>> {
    // Represent uploads by their source URL so the payload is inspectable
    // without touching the network.
    const uploads: PostizUpload[] = opts.mediaUrls.map((url) => ({ id: url }));
    return {
      provider: "postiz",
      type: "schedule",
      date: opts.scheduledAt.toISOString(),
      posts: this.buildPosts(opts, uploads),
    };
  }
}
