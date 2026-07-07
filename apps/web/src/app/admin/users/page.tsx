import Link from "next/link";
import { prisma } from "@/lib/db";
import { parsePermissions } from "@/lib/permissions";
import { requirePageAccess } from "@/lib/admin-session";
import { toggleOfficeUserActiveForm } from "@/lib/actions/admin";
import { IconEditLink, IconToggleButton, IconPower, AddButton } from "@/components/admin/AdminIcons";

export default async function OfficeUsersPage() {
  const session = await requirePageAccess("users:view");

  const users = await prisma.user.findMany({
    where: { role: "OFFICE", storeId: session.user.storeId },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Office users</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Back-office users (accountant, HR, etc.) with limited admin access.
          </p>
        </div>
        <AddButton href="/admin/users/new" label="Add user" />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Privileges</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  No office users yet. <Link href="/admin/users/new">Add one</Link>.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const perms = parsePermissions(user.permissions);
                return (
                  <tr key={user.id}>
                    <td>{user.name}</td>
                    <td>{user.email}</td>
                    <td>
                      <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                        {perms.length} privilege{perms.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td>
                      {user.isActive ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge">Inactive</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <IconEditLink href={`/admin/users/${user.id}/edit`} />
                        <form action={toggleOfficeUserActiveForm}>
                          <input type="hidden" name="userId" value={user.id} />
                          <IconToggleButton label={user.isActive ? "Deactivate" : "Activate"}>
                            <IconPower active={user.isActive} />
                          </IconToggleButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
