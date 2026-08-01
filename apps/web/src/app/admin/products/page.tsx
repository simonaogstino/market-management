import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  deactivateSampleProductsForm,
  toggleProductActiveForm,
  toggleProductShowOnAppsForm,
  toggleProductShowOnPosForm,
} from "@/lib/actions/admin";
import { requirePageAccess } from "@/lib/admin-session";
import { formatMoney } from "@/lib/store-settings";
import { IconEditLink, IconToggleButton, IconPower, AddButton } from "@/components/admin/AdminIcons";
import { Monitor, Smartphone } from "lucide-react";

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
          <div style={{ margin: 0 }}>
            {sampleCount} sample product(s) still active. Add your real products, then{" "}
            <form action={deactivateSampleProductsForm} style={{ display: "inline" }}>
              <button type="submit" className="link-button">
                deactivate all sample products
              </button>
            </form>
            .
          </div>
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
              <th align="right">POS price</th>
              <th align="right">Apps price</th>
              <th align="right">Stock</th>
              <th>Status</th>
              <th>POS</th>
              <th>Apps</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ color: "var(--muted)" }}>
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
                  <td align="right">{formatMoney(p.costCents)}</td>
                  <td align="right">
                    {formatMoney(p.priceCents)}
                    {p.discountPriceCents != null && p.discountQtyLeft > 0 && (
                      <div style={{ fontSize: "0.75rem", color: "#b45309" }}>
                        Promo {formatMoney(p.discountPriceCents)} · {p.discountQtyLeft} left
                      </div>
                    )}
                  </td>
                  <td align="right">
                    {p.showOnApps || p.appPriceCents > 0 ? formatMoney(p.appPriceCents) : "—"}
                  </td>
                  <td align="right">{p.stockQty}</td>
                  <td>
                    {p.isActive ? (
                      <span className="badge badge-success">Active</span>
                    ) : (
                      <span className="badge">Inactive</span>
                    )}
                  </td>
                  <td>
                    <form action={toggleProductShowOnPosForm}>
                      <input type="hidden" name="productId" value={p.id} />
                      <IconToggleButton
                        label={p.showOnPos ? "Hide from POS" : "Show on POS"}
                      >
                        <Monitor
                          size={16}
                          strokeWidth={2}
                          color={p.showOnPos ? "#16a34a" : "#94a3b8"}
                          aria-hidden
                        />
                      </IconToggleButton>
                    </form>
                  </td>
                  <td>
                    <form action={toggleProductShowOnAppsForm}>
                      <input type="hidden" name="productId" value={p.id} />
                      <IconToggleButton
                        label={p.showOnApps ? "Hide from apps" : "Show on apps"}
                      >
                        <Smartphone
                          size={16}
                          strokeWidth={2}
                          color={p.showOnApps ? "#16a34a" : "#94a3b8"}
                          aria-hidden
                        />
                      </IconToggleButton>
                    </form>
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
