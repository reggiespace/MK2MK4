"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Icon } from "@/components/ui/Icon";

export interface SidebarAccount {
  id: string;
  name: string;
  initials: string;
  mark: string;
}

/** Nav order matches the design's sidebar exactly. */
const NAV = [
  { label: "Dashboard", icon: "dash", href: "/" },
  { label: "Create", icon: "sparkles", href: "/create" },
  { label: "Pieces", icon: "layers", href: "/pieces" },
  { label: "Assets", icon: "image", href: "/assets" },
  { label: "Algorithm", icon: "cal", href: "/algorithm" },
  { label: "Settings", icon: "sliders", href: "/settings" },
] as const;

export function Sidebar({
  accounts,
  activeAccountId,
  onSelectAccount,
  onSignOut,
}: {
  accounts: SidebarAccount[];
  activeAccountId: string | null;
  onSelectAccount: (id: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <nav
      style={{
        width: "236px",
        flexShrink: 0,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "22px 16px",
        gap: "22px",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "19px",
            fontWeight: 700,
            lineHeight: 1,
            color: "var(--ink)",
          }}
        >
          Reggie<span style={{ color: "var(--moss)" }}>Space</span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Social Studio
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        {NAV.map((n) => {
          const active = isActive(n.href);
          return (
            <button
              key={n.href}
              onClick={() => router.push(n.href)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "11px",
                padding: "9px 11px",
                borderRadius: "10px",
                border: "none",
                fontSize: "13.5px",
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                textAlign: "left",
                color: active ? "#f4efe0" : "var(--ink)",
                background: active ? "var(--moss)" : "transparent",
              }}
            >
              <Icon name={n.icon} size={17} strokeWidth={active ? 2.7 : 2.4} />
              <span>{n.label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--brass)",
            padding: "0 4px",
          }}
        >
          Accounts
        </div>
        {accounts.map((c) => {
          const selected = c.id === activeAccountId;
          return (
            <button
              key={c.id}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await onSelectAccount(c.id);
                  router.refresh();
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
                padding: "7px 8px",
                borderRadius: "9px",
                border: "none",
                fontSize: "13px",
                cursor: "pointer",
                textAlign: "left",
                color: "var(--ink)",
                background: selected ? "#e5ddc6" : "transparent",
              }}
            >
              <span
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "7px",
                  background: c.mark,
                  color: "#f4efe0",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: "11px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {c.initials}
              </span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </span>
              <span
                style={{
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: "var(--moss)",
                  flexShrink: 0,
                }}
              />
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: "auto" }}>
        <button
          className="hover-surface"
          onClick={() => startTransition(async () => void (await onSignOut()))}
          style={{
            width: "100%",
            background: "transparent",
            color: "var(--muted)",
            border: "1px solid var(--border)",
            borderRadius: "9px",
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
