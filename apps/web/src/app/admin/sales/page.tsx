import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { SalesList, type AdminSaleRow } from "@/components/admin/SalesList";
import { formatStoreMoney, getStoreSettings } from "@/lib/store-settings";

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
  searchParams: Promise<{ date?: string; terminal?: string; receipt?: string }>;
}) {
  const session = await requirePageAccess("sales:view");
  const settings = await getStoreSettings(session.user.storeId);

  const { date, terminal, receipt } = await searchParams;
  const receiptQuery = receipt?.trim() ?? "";
  const selectedDate = date ? new Date(date) : new Date();
  const dayStart = startOfDay(selectedDate);
  const dayEnd = endOfDay(selectedDate);
  const dateValue = selectedDate.toISOString().slice(0, 10);

  const terminals = await prisma.terminal.findMany({ orderBy: { name: "asc" } });

  const sales = await prisma.sale.findMany({
    where: {
      ...(receiptQuery
        ? { receiptNumber: { contains: receiptQuery } }
        : { soldAt: { gte: dayStart, lte: dayEnd } }),
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

  const rows: AdminSaleRow[] = sales.map((sale) => ({
    id: sale.id,
    receiptNumber: sale.receiptNumber,
    soldAt: sale.soldAt.toISOString(),
    terminalName: sale.terminal.name,
    staffName: sale.staff?.name ?? null,
    kind: sale.kind,
    totalCents: sale.totalCents,
    status: sale.status,
    lines: sale.lines.map((line) => ({
      productName: line.product.name,
      sku: line.product.sku,
      quantity: line.quantity,
      unitCents: line.unitCents,
      lineCents: line.lineCents,
    })),
  }));

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Sales</h1>
      <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.875rem" }}>
        Times shown in {settings.timezone}. Click a row to view receipt details.
      </p>

      <form className="card filters-form" method="get">
        <label>
          Receipt #
          <input
            type="search"
            name="receipt"
            defaultValue={receiptQuery}
            placeholder="e.g. RCP-00001"
          />
        </label>
        <label>
          Date
          <input type="date" name="date" defaultValue={dateValue} disabled={Boolean(receiptQuery)} />
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
          Search
        </button>
      </form>

      {receiptQuery && (
        <p style={{ fontSize: "0.875rem", color: "var(--muted)", margin: "0 0 1rem" }}>
          Searching all dates for receipt matching &ldquo;{receiptQuery}&rdquo;
        </p>
      )}

      <div className="card" style={{ marginBottom: "1rem" }}>
        <strong>{sales.length}</strong> sale(s) · Total{" "}
        <strong>{formatStoreMoney(totalCents, settings)}</strong>
      </div>

      <SalesList sales={rows} currency={settings.currency} timezone={settings.timezone} />
    </div>
  );
}
