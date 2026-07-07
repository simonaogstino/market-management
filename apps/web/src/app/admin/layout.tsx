import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { hasPermission, NAV_ITEMS } from "@/lib/permissions";
import { AdminNavLink } from "@/components/admin/AdminIcons";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "OFFICE")) {
    redirect("/login");
  }

  const perms = session.user.permissions;
  const visibleNav = NAV_ITEMS.filter((item) =>
    hasPermission(session.user.role, perms, item.permission),
  );
  const canOpenPos =
    session.user.role === "ADMIN" ||
    hasPermission(session.user.role, perms, "staff:view");

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <strong className="admin-brand">Market Admin</strong>
        {session.user.role === "OFFICE" && (
          <div className="admin-sidebar-note">Limited access</div>
        )}
        <nav className="admin-nav">
          {visibleNav.map((item) => (
            <AdminNavLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
          ))}
          {canOpenPos && <AdminNavLink href="/pos" label="Open POS" icon="pos" />}
        </nav>
        <p className="admin-user-meta">
          {session.user.name}
          {session.user.email && (
            <>
              <br />
              {session.user.email}
            </>
          )}
        </p>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
