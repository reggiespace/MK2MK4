import "server-only";
import type {
  Publisher,
  PublisherCredentials,
  ScheduleOptions,
  PublishResult,
} from "./types";
import { composePostText } from "./compose";

const DEFAULT_BASE_URL = "https://api.zernio.com";

/** Credentials are injected per workspace; this class never reads env. */
export class ZernioPublisher implements Publisher {
  name = "zernio";

  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(credentials: PublisherCredentials) {
    if (!credentials.apiKey) throw new Error("Zernio API key missing");
    this.apiKey = credentials.apiKey;
    this.baseUrl = (credentials.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private async request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...(options.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`Zernio API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async getBestTime(_channelId: string, _network: string): Promise<Date> {
    // Zernio best-time suggestion: POST /v1/insights/best-time (if available)
    try {
      const data = await this.request("/v1/insights/best-time", {
        method: "POST",
        body: JSON.stringify({ accountId: _channelId }),
      });
      if (data?.bestTime) return new Date(data.bestTime);
    } catch {
      // Fall through
    }
    // Fallback: tomorrow at 9am
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return t;
  }

  async schedule(opts: ScheduleOptions): Promise<PublishResult> {
    const data = await this.request("/v1/posts", {
      method: "POST",
      body: JSON.stringify({
        accountId: opts.channelId,
        network: opts.network,
        caption: composePostText(opts.caption, opts.hashtags),
        mediaUrls: opts.mediaUrls,
        scheduledAt: opts.scheduledAt.toISOString(),
        idempotencyKey: opts.idempotencyKey,
        ...(opts.firstComment ? { platformSpecificData: { firstComment: opts.firstComment } } : {}),
      }),
    });
    return {
      providerPostId: data.id ?? data.postId,
      scheduledAt: new Date(data.scheduledAt ?? opts.scheduledAt),
    };
  }

  async publishNow(opts: Omit<ScheduleOptions, "scheduledAt">): Promise<PublishResult> {
    const data = await this.request("/v1/posts/publish", {
      method: "POST",
      body: JSON.stringify({
        accountId: opts.channelId,
        network: opts.network,
        caption: composePostText(opts.caption, opts.hashtags),
        mediaUrls: opts.mediaUrls,
        idempotencyKey: opts.idempotencyKey,
        ...(opts.firstComment ? { platformSpecificData: { firstComment: opts.firstComment } } : {}),
      }),
    });
    return {
      providerPostId: data.id ?? data.postId,
      scheduledAt: new Date(data.publishedAt ?? Date.now()),
    };
  }

  async dryRun(opts: ScheduleOptions): Promise<Record<string, unknown>> {
    return {
      provider: "zernio",
      accountId: opts.channelId,
      network: opts.network,
      caption: composePostText(opts.caption, opts.hashtags),
      mediaUrls: opts.mediaUrls,
      scheduledAt: opts.scheduledAt.toISOString(),
      idempotencyKey: opts.idempotencyKey,
      ...(opts.firstComment ? { platformSpecificData: { firstComment: opts.firstComment } } : {}),
    };
  }
}
