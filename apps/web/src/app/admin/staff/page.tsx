import Link from "next/link";
import { prisma } from "@/lib/db";
import { toggleStaffActiveForm } from "@/lib/actions/admin";
import { requirePageAccess } from "@/lib/admin-session";
import { IconEditLink, IconToggleButton, IconPower, AddButton } from "@/components/admin/AdminIcons";
export default async function StaffPage() {
  await requirePageAccess("staff:view");

  const staff = await prisma.user.findMany({
    where: { role: "STAFF" },
    orderBy: { name: "asc" },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Staff</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Manage POS login PINs for your team.
          </p>
        </div>
        <AddButton href="/admin/staff/new" label="Add staff" />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>POS PIN</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ color: "var(--muted)" }}>
                  No staff yet. <Link href="/admin/staff/new">Add your first staff member</Link>.
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.email ?? "—"}</td>
                  <td>{member.pinHash ? "••••••" : <span className="badge badge-warning">Not set</span>}</td>
                  <td>
                    {member.isActive ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge">Inactive</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconEditLink
                        href={`/admin/staff/${member.id}/edit`}
                        label="Edit / reset PIN"
                      />
                      <form action={toggleStaffActiveForm}>
                        <input type="hidden" name="userId" value={member.id} />
                        <IconToggleButton label={member.isActive ? "Deactivate" : "Activate"}>
                          <IconPower active={member.isActive} />
                        </IconToggleButton>
                      </form>
                    </div>                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
