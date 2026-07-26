import "server-only";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";
import { env } from "@/lib/env";
import { Provider } from "@/generated/prisma/enums";

/**
 * Credential resolution.
 *
 * Publishing providers (Postiz/Buffer/Zernio) are bring-your-own: a workspace
 * must connect its own key. AI providers (OpenAI/fal/ElevenLabs) are hosted by
 * ReggieSpace, so a workspace key is an optional override on top of the
 * platform env key.
 */

export const PUBLISHING_PROVIDERS = [Provider.postiz, Provider.buffer, Provider.zernio] as const;
export const AI_PROVIDERS = [Provider.fal, Provider.elevenlabs, Provider.openai] as const;

export interface ResolvedCredential {
  apiKey: string;
  baseUrl?: string;
  /** Provider-specific extras, e.g. Buffer's organisation id. */
  meta?: Record<string, unknown>;
  /** Where the key came from — workspace-connected or the platform's own. */
  source: "workspace" | "platform";
}

const PLATFORM_FALLBACK: Partial<Record<Provider, () => ResolvedCredential | null>> = {
  [Provider.openai]: () => {
    const k = env.openaiApiKey();
    return k ? { apiKey: k, source: "platform" } : null;
  },
  [Provider.fal]: () => {
    const k = env.falKey();
    return k ? { apiKey: k, source: "platform" } : null;
  },
  [Provider.elevenlabs]: () => {
    const k = env.elevenLabsApiKey();
    return k ? { apiKey: k, source: "platform" } : null;
  },
};

/** Resolve a usable credential, or null when the provider isn't available. */
export async function resolveCredential(
  workspaceId: string,
  provider: Provider,
): Promise<ResolvedCredential | null> {
  const row = await prisma.integration.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });

  if (row?.connected && row.apiKey) {
    return {
      apiKey: decryptSecret(row.apiKey),
      baseUrl: row.baseUrl ?? undefined,
      meta: (row.meta ?? undefined) as Record<string, unknown> | undefined,
      source: "workspace",
    };
  }
  return PLATFORM_FALLBACK[provider]?.() ?? null;
}

export async function requireCredential(
  workspaceId: string,
  provider: Provider,
): Promise<ResolvedCredential> {
  const cred = await resolveCredential(workspaceId, provider);
  if (!cred) {
    throw new Error(
      `${provider} is not connected. Add its API key in Settings → Integrations.`,
    );
  }
  return cred;
}

export async function connectIntegration(
  workspaceId: string,
  provider: Provider,
  apiKey: string,
  baseUrl?: string,
) {
  const encrypted = encryptSecret(apiKey.trim());
  return prisma.integration.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: { workspaceId, provider, apiKey: encrypted, baseUrl, connected: true, lastSyncAt: new Date() },
    update: { apiKey: encrypted, baseUrl, connected: true, lastSyncAt: new Date() },
  });
}

export async function disconnectIntegration(workspaceId: string, provider: Provider) {
  await prisma.integration.deleteMany({ where: { workspaceId, provider } });
}

export interface IntegrationStatus {
  provider: Provider;
  connected: boolean;
  /** Masked for display; never the real key. */
  maskedKey?: string;
  baseUrl?: string;
  lastSyncAt?: Date;
  /** True when usable only because the platform supplies the key. */
  usingPlatformKey: boolean;
}

/** Connection state for the Settings screen. */
export async function listIntegrationStatus(workspaceId: string): Promise<IntegrationStatus[]> {
  const rows = await prisma.integration.findMany({ where: { workspaceId } });
  const byProvider = new Map(rows.map((r) => [r.provider, r]));

  return [...PUBLISHING_PROVIDERS, ...AI_PROVIDERS].map((provider) => {
    const row = byProvider.get(provider);
    if (row?.connected) {
      return {
        provider,
        connected: true,
        maskedKey: maskKey(decryptSecret(row.apiKey)),
        baseUrl: row.baseUrl ?? undefined,
        lastSyncAt: row.lastSyncAt ?? undefined,
        usingPlatformKey: false,
      };
    }
    const platform = PLATFORM_FALLBACK[provider]?.();
    return {
      provider,
      connected: Boolean(platform),
      maskedKey: platform ? maskKey(platform.apiKey) : undefined,
      usingPlatformKey: Boolean(platform),
    };
  });
}

/** The publishing provider a workspace posts through (first connected wins). */
export async function activePublisher(workspaceId: string): Promise<Provider | null> {
  const rows = await prisma.integration.findMany({
    where: { workspaceId, connected: true, provider: { in: [...PUBLISHING_PROVIDERS] } },
  });
  for (const p of PUBLISHING_PROVIDERS) {
    if (rows.some((r) => r.provider === p)) return p;
  }
  // Fall back to the platform's own Postiz key so a fresh install can publish.
  return env.postizApiKey() ? Provider.postiz : null;
}
