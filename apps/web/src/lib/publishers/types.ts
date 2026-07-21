export type PublisherKey = "buffer" | "zernio" | "postiz";

export type PostFormat = "single" | "carousel" | "reel" | "story";

export interface ScheduleOptions {
  caption: string;
  firstComment?: string;
  hashtags: string[];
  mediaUrls: string[];
  format: PostFormat;
  scheduledAt: Date;
  channelId: string;
  network: "facebook" | "instagram";
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
