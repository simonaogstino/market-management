import Link from "next/link";
import { requirePageAccess } from "@/lib/admin-session";
import { OfficeUserForm } from "@/components/admin/OfficeUserForm";

export default async function NewOfficeUserPage() {
  await requirePageAccess("users:manage");

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Add office user</h1>
        <Link className="btn btn-secondary" href="/admin/users">
          Back to users
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <OfficeUserForm />
      </div>
    </div>
  );
}
