import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { SupplierReturnForm } from "@/components/admin/SupplierReturnForm";

export default async function NewSupplierReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("suppliers:manage");
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, storeId: session.user.storeId, isActive: true },
  });
  if (!supplier) notFound();

  const products = await prisma.product.findMany({
    where: { storeId: session.user.storeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, costCents: true, stockQty: true },
  });

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Return to supplier — {supplier.name}</h1>
        <Link className="btn btn-secondary" href={`/admin/suppliers/${supplier.id}`}>
          Back
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 720 }}>
        <SupplierReturnForm supplierId={supplier.id} products={products} />
      </div>
    </div>
  );
}
