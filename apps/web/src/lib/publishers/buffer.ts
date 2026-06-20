import "server-only";
import { env } from "@/lib/env";
import type { Publisher, ScheduleOptions, PublishResult } from "./types";

const BUFFER_API = "https://api.bufferapp.com/1";
const BUFFER_GRAPHQL = "https://graph.buffer.com/graphql";

async function gql(query: string, variables: Record<string, unknown>) {
  const key = env.bufferApiKey();
  if (!key) throw new Error("BUFFER_API_KEY not set");
  const res = await fetch(BUFFER_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Buffer API ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

export class BufferPublisher implements Publisher {
  name = "buffer";

  async getBestTime(channelId: string, _network: string): Promise<Date> {
    // Use next available slot in Buffer's posting schedule.
    try {
      const data = await gql(
        `query Channel($id: ID!) {
          channel(id: $id) {
            schedulingTimes { scheduledAt }
          }
        }`,
        { id: channelId },
      );
      const times = data?.channel?.schedulingTimes;
      if (times?.length) return new Date(times[0].scheduledAt);
    } catch {
      // Fall through to default
    }
    // Fallback: tomorrow at 10am local
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(10, 0, 0, 0);
    return t;
  }

  private assetInput(url: string) {
    const isVideo = /\.(mp4|mov|m4v)$/i.test(url);
    return isVideo ? { video: { url } } : { image: { url } };
  }

  private metadataFor(opts: ScheduleOptions | Omit<ScheduleOptions, "scheduledAt">) {
    if (!opts.firstComment) return undefined;
    if (opts.network === "instagram") return { instagram: { type: "post", firstComment: opts.firstComment } };
    if (opts.network === "facebook") return { facebook: { type: "post", firstComment: opts.firstComment } };
    return undefined;
  }

  private async createPost(input: Record<string, unknown>) {
    const data = await gql(
      `mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          __typename
          ... on PostActionSuccess { post { id dueAt } }
          ... on InvalidInputError { message }
          ... on UnauthorizedError { message }
          ... on NotFoundError { message }
          ... on LimitReachedError { message }
          ... on RestProxyError { message code }
          ... on UnexpectedError { message }
        }
      }`,
      { input },
    );
    const result = data.createPost;
    if (result.__typename !== "PostActionSuccess") {
      throw new Error(`Buffer createPost failed (${result.__typename}): ${result.message}`);
    }
    return result.post;
  }

  async schedule(opts: ScheduleOptions): Promise<PublishResult> {
    const post = await this.createPost({
      channelId: opts.channelId,
      text: [opts.caption, ...opts.hashtags].join("\n\n"),
      assets: opts.mediaUrls.map((u) => this.assetInput(u)),
      mode: "customScheduled",
      schedulingType: "automatic",
      dueAt: opts.scheduledAt.toISOString(),
      metadata: this.metadataFor(opts),
    });
    return { providerPostId: post.id, scheduledAt: new Date(post.dueAt) };
  }

  async publishNow(opts: Omit<ScheduleOptions, "scheduledAt">): Promise<PublishResult> {
    const post = await this.createPost({
      channelId: opts.channelId,
      text: [opts.caption, ...opts.hashtags].join("\n\n"),
      assets: opts.mediaUrls.map((u) => this.assetInput(u)),
      mode: "shareNow",
      schedulingType: "automatic",
      metadata: this.metadataFor(opts),
    });
    return { providerPostId: post.id, scheduledAt: new Date(post.dueAt) };
  }

  async dryRun(opts: ScheduleOptions): Promise<Record<string, unknown>> {
    return {
      provider: "buffer",
      channelId: opts.channelId,
      network: opts.network,
      scheduledAt: opts.scheduledAt.toISOString(),
      text: [opts.caption, ...opts.hashtags].join("\n\n"),
      assets: opts.mediaUrls.map((u) => this.assetInput(u)),
      metadata: this.metadataFor(opts),
    };
  }
}
