import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { listOpenCashTerminals } from "@/lib/cash-server";
import { SupplierPaymentForm } from "@/components/admin/SupplierPaymentForm";

export default async function NewSupplierPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("suppliers:manage");
  const { id } = await params;

  const [supplier, cashTerminals] = await Promise.all([
    prisma.supplier.findFirst({
      where: { id, storeId: session.user.storeId, isActive: true },
    }),
    listOpenCashTerminals(session.user.storeId),
  ]);
  if (!supplier) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Payment / credit — {supplier.name}</h1>
        <Link className="btn btn-secondary" href={`/admin/suppliers/${supplier.id}`}>
          Back
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 480 }}>
        <SupplierPaymentForm supplierId={supplier.id} cashTerminals={cashTerminals} />
      </div>
    </div>
  );
}
