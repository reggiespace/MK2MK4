import "server-only";
import type { Publisher, PublisherCredentials, PublisherKey } from "./types";
import { BufferPublisher } from "./buffer";
import { ZernioPublisher } from "./zernio";
import { PostizPublisher } from "./postiz";
import { requireCredential } from "@/lib/integrations";
import { Provider } from "@/generated/prisma/enums";

export {
  type Publisher,
  type PublisherKey,
  type PublisherCredentials,
  type PostFormat,
  type Network,
  type ScheduleOptions,
  type PublishResult,
} from "./types";

export function getPublisher(provider: PublisherKey, credentials: PublisherCredentials): Publisher {
  if (provider === "buffer") return new BufferPublisher(credentials);
  if (provider === "zernio") return new ZernioPublisher(credentials);
  return new PostizPublisher(credentials);
}

const PROVIDER_KEYS: Record<PublisherKey, Provider> = {
  postiz: Provider.postiz,
  buffer: Provider.buffer,
  zernio: Provider.zernio,
};

/**
 * Build a publisher from the workspace's stored credentials. Throws with a
 * user-facing message when the workspace hasn't connected that provider.
 */
export async function getPublisherForWorkspace(
  workspaceId: string,
  provider: PublisherKey,
): Promise<Publisher> {
  const cred = await requireCredential(workspaceId, PROVIDER_KEYS[provider]);
  const orgId = cred.meta?.orgId;
  return getPublisher(provider, {
    apiKey: cred.apiKey,
    baseUrl: cred.baseUrl,
    orgId: typeof orgId === "string" ? orgId : undefined,
  });
}
