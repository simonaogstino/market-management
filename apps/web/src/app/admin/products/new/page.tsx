import Link from "next/link";
import { prisma } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";
import { requirePageAccess } from "@/lib/admin-session";

export default async function NewProductPage() {
  const session = await requirePageAccess("products:manage");

  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const suppliers = await prisma.supplier.findMany({
    where: { storeId: session.user.storeId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Add product</h1>
        <Link className="btn btn-secondary" href="/admin/products">
          Back to products
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <ProductForm categories={categories} suppliers={suppliers} />
      </div>
    </div>
  );
}
