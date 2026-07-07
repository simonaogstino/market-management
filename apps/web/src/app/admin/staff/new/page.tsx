import Link from "next/link";
import { StaffForm } from "@/components/admin/StaffForm";
import { requirePageAccess } from "@/lib/admin-session";

export default async function NewStaffPage() {
  await requirePageAccess("staff:manage");

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Add staff member</h1>
        <Link className="btn btn-secondary" href="/admin/staff">
          Back to staff
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <StaffForm />
      </div>
    </div>
  );
}
