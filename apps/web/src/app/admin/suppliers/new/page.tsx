import Link from "next/link";
import { requirePageAccess } from "@/lib/admin-session";
import { SupplierForm } from "@/components/admin/SupplierForm";

export default async function NewSupplierPage() {
  await requirePageAccess("suppliers:manage");

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Add supplier</h1>
        <Link className="btn btn-secondary" href="/admin/suppliers">
          Back to suppliers
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <SupplierForm />
      </div>
    </div>
  );
}
