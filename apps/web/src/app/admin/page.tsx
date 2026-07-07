import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { formatStoreMoney, getStoreSettings } from "@/lib/store-settings";

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function AdminDashboardPage() {
  const session = await requirePageAccess("dashboard");
  const settings = await getStoreSettings(session.user.storeId);

  const todayStart = startOfDay(new Date());  const todayEnd = endOfDay(new Date());

  const [productCount, terminalCount, pendingSales, conflicts, todaySalesRows] =
    await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.terminal.count({ where: { isActive: true } }),
    prisma.sale.count({ where: { status: "PENDING_SYNC" } }),
    prisma.syncConflict.count({ where: { status: "OPEN" } }),
    prisma.sale.findMany({
      where: { soldAt: { gte: todayStart, lte: todayEnd }, status: { not: "VOIDED" } },
      select: { totalCents: true, kind: true },
    }),
  ]);

  const todaySales = todaySalesRows.length;
  const todayNetCents = todaySalesRows.reduce(
    (sum, s) => sum + (s.kind === "RETURN" ? -s.totalCents : s.totalCents),
    0,
  );

  const lowStock = await prisma.product.findMany({
    where: { stockQty: { lte: settings.lowStockThreshold }, isActive: true },
    orderBy: { stockQty: "asc" },
    take: 5,
  });
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Dashboard</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <StatCard label="Products" value={productCount} />
        <StatCard label="Today's sales" value={todaySales} />
        <StatCard label="Active POS" value={terminalCount} />
        <StatCard label="Pending sync" value={pendingSales} />
        <StatCard label="Open conflicts" value={conflicts} highlight={conflicts > 0} />
      </div>

      <section className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem" }}>Today&apos;s revenue</h2>
            <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
              {formatStoreMoney(todayNetCents, settings)}
            </p>          </div>
          <Link className="btn btn-secondary" href="/admin/sales">
            View sales
          </Link>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>
          Low stock (≤ {settings.lowStockThreshold})
        </h2>        {lowStock.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No low-stock items.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">SKU</th>
                <th align="left">Name</th>
                <th align="right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.map((p) => (
                <tr key={p.id}>
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td align="right">
                    <span className="badge badge-warning">{p.stockQty}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="card">
      <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{label}</div>
      <div
        style={{
          fontSize: "2rem",
          fontWeight: 700,
          color: highlight ? "var(--danger)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
