import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { listOpenCashTerminals } from "@/lib/cash-server";
import { SupplierDeliveryForm } from "@/components/admin/SupplierDeliveryForm";

export default async function NewSupplierDeliveryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("suppliers:manage");
  const { id } = await params;

  const [supplier, products, cashTerminals] = await Promise.all([
    prisma.supplier.findFirst({
      where: { id, storeId: session.user.storeId, isActive: true },
    }),
    prisma.product.findMany({
      where: { storeId: session.user.storeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, costCents: true },
    }),
    listOpenCashTerminals(session.user.storeId),
  ]);
  if (!supplier) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Record delivery — {supplier.name}</h1>
        <Link className="btn btn-secondary" href={`/admin/suppliers/${supplier.id}`}>
          Back
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <SupplierDeliveryForm
          supplierId={supplier.id}
          products={products}
          defaultDiscountPercent={supplier.discountPercent}
          cashTerminals={cashTerminals}
        />
      </div>
    </div>
  );
}
