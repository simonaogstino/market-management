import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProductForm } from "@/components/admin/ProductForm";
import { requirePageAccess } from "@/lib/admin-session";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("products:manage");
  const { id } = await params;
  const [product, categories, suppliers] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.supplier.findMany({
      where: { storeId: session.user.storeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!product) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Edit product</h1>
        <Link className="btn btn-secondary" href="/admin/products">
          Back to products
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <ProductForm categories={categories} suppliers={suppliers} product={product} />
      </div>
    </div>
  );
}
