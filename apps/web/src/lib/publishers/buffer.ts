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

  async schedule(opts: ScheduleOptions): Promise<PublishResult> {
    const data = await gql(
      `mutation CreatePost($input: PostInput!) {
        createPost(input: $input) {
          post { id scheduledAt }
        }
      }`,
      {
        input: {
          channelId: opts.channelId,
          text: [opts.caption, ...opts.hashtags].join("\n\n"),
          mediaUrls: opts.mediaUrls,
          scheduledAt: opts.scheduledAt.toISOString(),
          isCustomScheduled: true,
          idempotencyKey: opts.idempotencyKey,
        },
      },
    );
    const post = data.createPost.post;
    return { providerPostId: post.id, scheduledAt: new Date(post.scheduledAt) };
  }

  async publishNow(opts: Omit<ScheduleOptions, "scheduledAt">): Promise<PublishResult> {
    const data = await gql(
      `mutation CreatePost($input: PostInput!) {
        createPost(input: $input) {
          post { id scheduledAt }
        }
      }`,
      {
        input: {
          channelId: opts.channelId,
          text: [opts.caption, ...opts.hashtags].join("\n\n"),
          mediaUrls: opts.mediaUrls,
          isNow: true,
          idempotencyKey: opts.idempotencyKey,
        },
      },
    );
    const post = data.createPost.post;
    return { providerPostId: post.id, scheduledAt: new Date(post.scheduledAt) };
  }

  async dryRun(opts: ScheduleOptions): Promise<Record<string, unknown>> {
    return {
      provider: "buffer",
      channelId: opts.channelId,
      network: opts.network,
      scheduledAt: opts.scheduledAt.toISOString(),
      text: [opts.caption, ...opts.hashtags].join("\n\n"),
      mediaUrls: opts.mediaUrls,
      idempotencyKey: opts.idempotencyKey,
    };
  }
}
