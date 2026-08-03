import { redirect } from "next/navigation";
import { StudioWizard } from "@/components/create/StudioWizard";
import { loadWorkspaceContext } from "@/lib/workspace";
import { activePublisher } from "@/lib/integrations";
import { prisma } from "@/lib/db";
import { toInitialDraft } from "@/lib/create/resolve-draft";
import type { InitialDraft } from "@/components/create/types";

const PROVIDER_LABEL: Record<string, string> = {
  postiz: "Postiz",
  buffer: "Buffer",
  zernio: "Zernio",
};

export default async function CreatePage(props: {
  searchParams: Promise<{ postId?: string }>;
}) {
  const { auth, accounts, account } = await loadWorkspaceContext();
  if (!account) redirect("/settings");

  const provider = await activePublisher(auth.workspaceId);

  const { postId } = await props.searchParams;
  let initialDraft: InitialDraft | undefined;
  if (postId) {
    // Only a still-editable draft in this workspace may seed the wizard;
    // anything else (missing, another workspace's, already scheduled) is
    // ignored silently so /create falls back to a normal fresh session.
    const draftPost = await prisma.post.findFirst({
      where: { id: postId, workspaceId: auth.workspaceId, status: "draft" },
      include: { pillar: true },
    });
    if (draftPost) {
      initialDraft = toInitialDraft(draftPost, draftPost.pillar?.name ?? null);
    }
  }

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
        logoUrl: a.logoAsset?.url ?? null,
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
      initialDraft={initialDraft}
    />
  );
}
