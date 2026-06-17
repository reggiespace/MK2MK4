export interface ScheduleOptions {
  caption: string;
  hashtags: string[];
  mediaUrls: string[];
  format: "single" | "carousel" | "reel";
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
