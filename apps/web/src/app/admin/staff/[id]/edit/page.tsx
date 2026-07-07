import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { StaffForm } from "@/components/admin/StaffForm";
import { requirePageAccess } from "@/lib/admin-session";

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("staff:manage");
  const { id } = await params;
  const staff = await prisma.user.findFirst({
    where: { id, role: "STAFF" },
  });

  if (!staff) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Edit staff — {staff.name}</h1>
        <Link className="btn btn-secondary" href="/admin/staff">
          Back to staff
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <StaffForm staff={staff} />
      </div>
    </div>
  );
}
