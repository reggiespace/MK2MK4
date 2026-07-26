export type PublisherKey = "buffer" | "zernio" | "postiz";

export type PostFormat = "single" | "carousel" | "reel" | "story" | "photo";

/** Every platform the design's channel picker can connect. */
export type Network = "instagram" | "facebook" | "tiktok" | "youtube" | "linkedin" | "x";

/** Credentials resolved per workspace — publishers never read env directly. */
export interface PublisherCredentials {
  apiKey: string;
  baseUrl?: string;
  /** Buffer needs an org id alongside the key. */
  orgId?: string;
}

export interface ScheduleOptions {
  caption: string;
  firstComment?: string;
  hashtags: string[];
  mediaUrls: string[];
  format: PostFormat;
  scheduledAt: Date;
  channelId: string;
  network: Network;
  idempotencyKey: string;
}

export interface PublishResult {
  providerPostId: string;
  scheduledAt: Date;
}

export interface Publisher {
  name: string;
  getBestTime(channelId: string, network: string): Promise<Date>;
  schedule(opts: ScheduleOptions): Promise<PublishResult>;
  publishNow(opts: Omit<ScheduleOptions, "scheduledAt">): Promise<PublishResult>;
  dryRun(opts: ScheduleOptions): Promise<Record<string, unknown>>;
}
