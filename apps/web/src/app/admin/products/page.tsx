import Link from "next/link";
import { prisma } from "@/lib/db";
import { deactivateSampleProductsForm, toggleProductActiveForm } from "@/lib/actions/admin";
import { requirePageAccess } from "@/lib/admin-session";
import { IconEditLink, IconToggleButton, IconPower, AddButton } from "@/components/admin/AdminIcons";

export default async function ProductsPage() {
  await requirePageAccess("products:view");

  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { category: true, supplier: true },
  });

  const sampleCount = products.filter((p) => p.sku.startsWith("SKU-") && p.isActive).length;

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Products</h1>
        <AddButton href="/admin/products/new" label="Add product" />
      </div>

      {sampleCount > 0 && (
        <div className="card" style={{ marginBottom: "1rem", background: "#fffbeb" }}>
          <p style={{ margin: 0 }}>
            {sampleCount} sample product(s) still active. Add your real products, then{" "}
            <form action={deactivateSampleProductsForm} style={{ display: "inline" }}>
              <button type="submit" className="link-button">
                deactivate all sample products
              </button>
            </form>
            .
          </p>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th align="right">Purchase</th>
              <th align="right">Sale</th>
              <th align="right">Stock</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ color: "var(--muted)" }}>
                  No products yet.{" "}
                  <Link href="/admin/products/new">Add your first product</Link>.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.category?.name ?? "—"}</td>
                  <td align="right">${(p.costCents / 100).toFixed(2)}</td>
                  <td align="right">${(p.priceCents / 100).toFixed(2)}</td>
                  <td align="right">{p.stockQty}</td>
                  <td>
                    {p.isActive ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge">Inactive</span>
                    )}
                  </td>
                  <td>
                    <div className="table-actions">
                      <IconEditLink href={`/admin/products/${p.id}/edit`} />
                      <form action={toggleProductActiveForm}>
                        <input type="hidden" name="productId" value={p.id} />
                        <IconToggleButton label={p.isActive ? "Deactivate" : "Activate"}>
                          <IconPower active={p.isActive} />
                        </IconToggleButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
