import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { OfficeUserForm } from "@/components/admin/OfficeUserForm";

export default async function EditOfficeUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageAccess("users:manage");
  const { id } = await params;

  const user = await prisma.user.findFirst({
    where: { id, role: "OFFICE" },
  });
  if (!user) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Edit user — {user.name}</h1>
        <Link className="btn btn-secondary" href="/admin/users">
          Back to users
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <OfficeUserForm user={user} />
      </div>
    </div>
  );
}
