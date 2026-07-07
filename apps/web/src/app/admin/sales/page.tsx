import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; terminal?: string }>;
}) {
  await requirePageAccess("sales:view");

  const { date, terminal } = await searchParams;
  const selectedDate = date ? new Date(date) : new Date();
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);

  const terminals = await prisma.terminal.findMany({ orderBy: { name: "asc" } });

  const sales = await prisma.sale.findMany({
    where: {
      soldAt: { gte: dayStart, lte: dayEnd },
      ...(terminal ? { terminalId: terminal } : {}),
    },
    orderBy: { soldAt: "desc" },
    include: {
      terminal: true,
      staff: true,
      lines: { include: { product: true } },
    },
  });

  const totalCents = sales.reduce((sum, s) => {
    if (s.status === "VOIDED") return sum;
    return sum + (s.kind === "RETURN" ? -s.totalCents : s.totalCents);
  }, 0);
  const dateValue = selectedDate.toISOString().slice(0, 10);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Sales</h1>

      <form className="card filters-form" method="get">
        <label>
          Date
          <input type="date" name="date" defaultValue={dateValue} />
        </label>
        <label>
          Terminal
          <select name="terminal" defaultValue={terminal ?? ""}>
            <option value="">All terminals</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn" type="submit">
          Filter
        </button>
      </form>

      <div className="card" style={{ marginBottom: "1rem" }}>
        <strong>{sales.length}</strong> sale(s) · Total{" "}
        <strong>${(totalCents / 100).toFixed(2)}</strong>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {sales.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No sales for this date.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Terminal</th>
                <th>Staff</th>
                <th>Items</th>
                <th align="right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.soldAt.toLocaleString()}</td>
                  <td>{sale.terminal.name}</td>
                  <td>{sale.staff?.name ?? "—"}</td>
                  <td>
                    {sale.lines.map((line) => (
                      <div key={line.id} style={{ fontSize: "0.875rem" }}>
                        {line.quantity}× {line.product.name}
                      </div>
                    ))}
                  </td>
                  <td align="right">
                    {sale.kind === "RETURN" ? "−" : ""}${(sale.totalCents / 100).toFixed(2)}
                  </td>
                  <td>
                    {sale.kind === "RETURN" && <span className="badge">Return</span>}{" "}
                    <SaleStatusBadge status={sale.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SaleStatusBadge({ status }: { status: string }) {
  if (status === "SYNCED") return <span className="badge badge-success">Synced</span>;
  if (status === "PENDING_SYNC") return <span className="badge badge-warning">Pending</span>;
  if (status === "CONFLICT") return <span className="badge badge-danger">Conflict</span>;
  if (status === "VOIDED") return <span className="badge">Voided</span>;
  return <span className="badge">{status}</span>;
}
