import { redirect } from "next/navigation";
import { StudioWizard } from "@/components/create/StudioWizard";
import { loadWorkspaceContext } from "@/lib/workspace";
import { activePublisher } from "@/lib/integrations";

const PROVIDER_LABEL: Record<string, string> = {
  postiz: "Postiz",
  buffer: "Buffer",
  zernio: "Zernio",
};

export default async function CreatePage() {
  const { auth, accounts, account } = await loadWorkspaceContext();
  if (!account) redirect("/settings");

  const provider = await activePublisher(auth.workspaceId);

  return (
    <StudioWizard
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        locale: a.locale,
        handle: a.handle,
        initials: a.initials,
        mark: a.mark,
        accent: a.accent,
        channels: a.channels.map((c) => ({
          id: c.id,
          platform: c.platform,
          handle: c.handle,
          externalId: c.externalId,
        })),
        pillars: a.pillars.map((p) => ({ id: p.id, name: p.name })),
      }))}
      initialAccountId={account.id}
      publisherName={provider ? (PROVIDER_LABEL[provider] ?? provider) : "no provider"}
    />
  );
}
