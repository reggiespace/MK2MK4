import { redirect } from "next/navigation";
import { Sidebar } from "@/components/shell/Sidebar";
import { selectAccountAction, signOutAction } from "@/app/actions/session";
import { getSession } from "@/lib/session";
import { listAccounts } from "@/lib/workspace";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.userId || !session.workspaceId) redirect("/login");

  const accounts = await listAccounts(session.workspaceId);
  const active = accounts.find((a) => a.id === session.accountId) ?? accounts[0] ?? null;

  return (
    <div
      style={{
        // Every page inherits the selected brand's accent.
        ["--accent" as string]: active?.accent ?? "#5c7556",
        display: "flex",
        minHeight: "100vh",
        background: "var(--bg)",
      }}
    >
      <Sidebar
        accounts={accounts.map((a) => ({
          id: a.id,
          name: a.name,
          initials: a.initials,
          mark: a.mark,
        }))}
        activeAccountId={active?.id ?? null}
        onSelectAccount={selectAccountAction}
        onSignOut={signOutAction}
      />
      <main style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>{children}</main>
    </div>
  );
}
