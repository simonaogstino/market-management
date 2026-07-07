import { prisma } from "@/lib/db";
import { StockAdjustForm } from "@/components/admin/StockAdjustForm";
import { requirePageAccess } from "@/lib/admin-session";

export default async function StockPage() {
  await requirePageAccess("stock:view");

  const [products, movements] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockMovement.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        product: true,
        user: true,
      },
    }),
  ]);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Stock</h1>
      <p style={{ color: "var(--muted)" }}>
        Receive new stock from suppliers or make manual corrections (e.g. damaged goods).
      </p>

      <div className="card" style={{ maxWidth: 560, marginBottom: "2rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Adjust stock</h2>
        <StockAdjustForm products={products} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Recent movements</h2>
        {movements.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No stock movements yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th>Type</th>
                <th align="right">Qty</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.createdAt.toLocaleString()}</td>
                  <td>
                    {m.product.name}
                    <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{m.product.sku}</div>
                  </td>
                  <td>
                    <span className={`badge ${m.type === "RECEIVE" ? "badge-success" : "badge-warning"}`}>
                      {m.type === "RECEIVE" ? "Receive" : "Adjustment"}
                    </span>
                  </td>
                  <td align="right" style={{ color: m.quantity >= 0 ? "var(--success)" : "var(--danger)" }}>
                    {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td>{m.note ?? "—"}</td>
                  <td>{m.user?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
