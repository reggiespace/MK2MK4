import "server-only";
import type { Publisher, PublisherKey } from "./types";
import { BufferPublisher } from "./buffer";
import { ZernioPublisher } from "./zernio";
import { PostizPublisher } from "./postiz";

export {
  type Publisher,
  type PublisherKey,
  type PostFormat,
  type ScheduleOptions,
  type PublishResult,
} from "./types";

export function getPublisher(provider: PublisherKey): Publisher {
  if (provider === "buffer") return new BufferPublisher();
  if (provider === "zernio") return new ZernioPublisher();
  return new PostizPublisher();
}
