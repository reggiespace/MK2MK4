import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { logoutAction } from "@/app/actions/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session.operatorId) redirect("/login");

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">
          Gastric<span>IQ</span>
          <small>Studio</small>
        </div>
        <ul className="nav-links">
          <li><Link href="/" className="nav-link">Dashboard</Link></li>
          <li><Link href="/pieces" className="nav-link">Pieces</Link></li>
          <li><Link href="/ideate" className="nav-link">Ideate</Link></li>
          <li><Link href="/settings" className="nav-link">Settings</Link></li>
        </ul>
        <form action={logoutAction} className="sidebar-bottom">
          <button type="submit" className="ghost sm">Sign out</button>
        </form>
      </nav>
      <main className="app-content">
        {children}
      </main>
    </div>
  );
}
