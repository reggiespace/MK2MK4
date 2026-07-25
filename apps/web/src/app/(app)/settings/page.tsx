import { SettingsClient } from "@/components/settings/SettingsClient";
import { listIntegrationStatus } from "@/lib/integrations";
import { loadWorkspaceContext } from "@/lib/workspace";

export default async function SettingsPage() {
  const { auth, accounts, account } = await loadWorkspaceContext();
  const integrations = await listIntegrationStatus(auth.workspaceId);

  return (
    <SettingsClient
      integrations={integrations.map((i) => ({
        provider: i.provider,
        connected: i.connected,
        maskedKey: i.maskedKey,
        baseUrl: i.baseUrl,
        lastSyncAt: i.lastSyncAt?.toISOString(),
        usingPlatformKey: i.usingPlatformKey,
      }))}
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        initials: a.initials,
        mark: a.mark,
        handle: a.handle,
        voiceDescription: a.voiceDescription,
        tones: a.tones,
        readingLevel: a.readingLevel,
        claimsGuardrail: a.claimsGuardrail,
        downloadUrl: a.downloadUrl ?? "",
        channels: a.channels.map((c) => ({
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          externalId: c.externalId,
        })),
        pillars: a.pillars.map((p) => ({ id: p.id, name: p.name })),
      }))}
      initialAccountId={account?.id ?? ""}
    />
  );
}
