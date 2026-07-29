import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { formatStoreMoney, getStoreSettings } from "@/lib/store-settings";
import { resolveDateRange, startOfDay, endOfDay } from "@/lib/reports/date-range";
import {
  getHourlySales,
  getMonthlySalesTrend,
  getSalesByTerminal,
  getTopProducts,
} from "@/lib/reports/queries";
import {
  ReportBarChart,
  ReportLineChart,
} from "@/components/admin/reports/ReportCharts";

export default async function AdminDashboardPage() {
  const session = await requirePageAccess("dashboard");
  const settings = await getStoreSettings(session.user.storeId);

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const { range: monthRange } = resolveDateRange({ preset: "month" });
  const todayRange = { from: todayStart, to: todayEnd };

  const [
    productCount,
    terminalCount,
    pendingSales,
    conflicts,
    todaySalesRows,
    monthlyTrend,
    hourlyToday,
    byTerminal,
    topProducts,
    lowStock,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.terminal.count({ where: { isActive: true } }),
    prisma.sale.count({ where: { status: "PENDING_SYNC" } }),
    prisma.syncConflict.count({ where: { status: "OPEN" } }),
    prisma.sale.findMany({
      where: { soldAt: { gte: todayStart, lte: todayEnd }, status: { not: "VOIDED" } },
      select: { totalCents: true, kind: true },
    }),
    getMonthlySalesTrend(12),
    getHourlySales(todayRange),
    getSalesByTerminal(monthRange),
    getTopProducts(monthRange, 10),
    prisma.product.findMany({
      where: { stockQty: { lte: settings.lowStockThreshold }, isActive: true },
      orderBy: { stockQty: "asc" },
      take: 5,
    }),
  ]);

  const todayRetail = todaySalesRows.filter((s) => s.kind !== "OWNER");
  const todaySales = todayRetail.length;
  const todayNetCents = todayRetail.reduce(
    (sum, s) => sum + (s.kind === "RETURN" ? -s.totalCents : s.totalCents),
    0,
  );
  const todayOwnerCents = todaySalesRows
    .filter((s) => s.kind === "OWNER")
    .reduce((sum, s) => sum + s.totalCents, 0);

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
            <h2 style={{ margin: "0 0 0.25rem", fontSize: "1.125rem" }}>Today&apos;s retail revenue</h2>
            <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
              {formatStoreMoney(todayNetCents, settings)}
            </p>
            {todayOwnerCents > 0 && (
              <p style={{ margin: "0.35rem 0 0", color: "var(--muted)", fontSize: "0.875rem" }}>
                Owner / family at cost: {formatStoreMoney(todayOwnerCents, settings)}
              </p>
            )}
          </div>
          <Link className="btn btn-secondary" href="/admin/sales">
            View sales
          </Link>
        </div>
      </section>

      <section className="dashboard-charts" style={{ marginBottom: "1.5rem" }}>
        <h2 className="dashboard-charts-heading">Sales overview</h2>
        <div className="dashboard-charts-grid">
          <ReportLineChart
            title="Monthly sales (last 12 months)"
            data={monthlyTrend.map((m) => ({ name: m.name, net: m.value }))}
            series={[{ key: "net", label: "Net retail", color: "#2563eb" }]}
          />
          <ReportBarChart
            title="Sales by hour (today)"
            data={hourlyToday.hours.map((h) => ({ name: h.label, value: h.netCents }))}
          />
          <ReportBarChart
            title="Sales by terminal (this month)"
            data={byTerminal.map((t) => ({ name: t.name, value: t.netCents }))}
          />
          <ReportBarChart
            title="Top products (this month)"
            layout="horizontal"
            data={topProducts
              .map((p) => ({ name: p.name, value: p.revenueCents }))
              .slice(0, 10)}
            color="#16a34a"
          />
        </div>
        <p className="dashboard-charts-note">
          Charts use retail sales (excluding owner / family). Open{" "}
          <Link href="/admin/reports">Reports</Link> for full date ranges and CSV export.
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>
          Low stock (≤ {settings.lowStockThreshold})
        </h2>
        {lowStock.length === 0 ? (
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
