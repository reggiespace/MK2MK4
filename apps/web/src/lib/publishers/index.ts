import "server-only";
import type { Publisher } from "./types";
import { BufferPublisher } from "./buffer";
import { ZernioPublisher } from "./zernio";

export { type Publisher, type ScheduleOptions, type PublishResult } from "./types";

export function getPublisher(provider: "buffer" | "zernio"): Publisher {
  if (provider === "buffer") return new BufferPublisher();
  return new ZernioPublisher();
}
