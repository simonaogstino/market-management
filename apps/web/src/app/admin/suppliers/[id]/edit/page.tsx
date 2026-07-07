import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { SupplierForm } from "@/components/admin/SupplierForm";

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("suppliers:manage");
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, storeId: session.user.storeId },
  });
  if (!supplier) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Edit supplier — {supplier.name}</h1>
        <Link className="btn btn-secondary" href={`/admin/suppliers/${supplier.id}`}>
          Back
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <SupplierForm supplier={supplier} />
      </div>
    </div>
  );
}
