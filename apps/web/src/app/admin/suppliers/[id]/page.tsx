import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { computeSupplierBalance, formatMoney } from "@/lib/suppliers";
import { hasPermission } from "@/lib/permissions";
import { IconEditButton } from "@/components/admin/AdminIcons";

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("suppliers:view");
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, storeId: session.user.storeId },
    include: {
      deliveries: {
        orderBy: { deliveredAt: "desc" },
        include: {
          lines: { include: { product: { select: { sku: true, name: true } } } },
        },
      },
      returns: {
        orderBy: { returnedAt: "desc" },
        include: {
          recordedBy: { select: { name: true, role: true } },
          lines: { include: { product: { select: { sku: true, name: true } } } },
        },
      },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!supplier) notFound();

  const balance = computeSupplierBalance({
    openingBalanceCents: supplier.openingBalanceCents,
    deliveries: supplier.deliveries,
    returns: supplier.returns,
    payments: supplier.payments,
  });

  const canManage = hasPermission(session.user.role, session.user.permissions, "suppliers:manage");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>{supplier.name}</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            {supplier.contactPerson ?? supplier.phone ?? supplier.email ?? "No contact"}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {canManage && (
            <>
              <Link className="btn" href={`/admin/suppliers/${supplier.id}/deliveries/new`}>
                Record delivery
              </Link>
              <Link className="btn btn-secondary" href={`/admin/suppliers/${supplier.id}/payments/new`}>
                Record payment / credit
              </Link>
              <Link className="btn btn-secondary" href={`/admin/suppliers/${supplier.id}/returns/new`}>
                Record return
              </Link>
              <IconEditButton
                href={`/admin/suppliers/${supplier.id}/edit`}
                label="Edit supplier"
              />
            </>
          )}
          <Link className="btn btn-secondary" href="/admin/suppliers">
            All suppliers
          </Link>
        </div>
      </div>

      <div className="balance-grid">
        <BalanceCard label="Total delivered" value={formatMoney(balance.totalDelivered)} />
        <BalanceCard label="Returns to supplier" value={formatMoney(balance.totalReturned)} />
        <BalanceCard label="Net purchases" value={formatMoney(balance.netPurchases)} />
        <BalanceCard label="Total paid" value={formatMoney(balance.totalPaid)} />
        <BalanceCard label="Credits received" value={formatMoney(balance.creditsReceived)} />
        <BalanceCard
          label="Remaining to pay"
          value={formatMoney(balance.remainingToPayCents)}
          highlight={balance.remainingToPayCents > 0}
        />
        {balance.prepaidCreditCents > 0 && (
          <BalanceCard
            label="Supplier credit (prepaid)"
            value={formatMoney(balance.prepaidCreditCents)}
          />
        )}
        {supplier.openingBalanceCents > 0 && (
          <BalanceCard
            label="Opening balance"
            value={formatMoney(supplier.openingBalanceCents)}
          />
        )}
      </div>

      {supplier.notes && (
        <section className="card" style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Notes</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>{supplier.notes}</p>
        </section>
      )}

      <section className="card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Deliveries</h2>
        {supplier.deliveries.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No deliveries recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Items</th>
                <th>Total</th>
                <th>Paid on delivery</th>
                <th>Outstanding</th>
                <th>Stock</th>
              </tr>
            </thead>
            <tbody>
              {supplier.deliveries.map((delivery) => {
                const outstanding = delivery.totalCostCents - delivery.paidAtDeliveryCents;
                return (
                  <tr key={delivery.id}>
                    <td>{delivery.deliveredAt.toLocaleDateString()}</td>
                    <td>{delivery.referenceNumber ?? "—"}</td>
                    <td>
                      <ul className="delivery-items-list">
                        {delivery.lines.map((line) => (
                          <li key={line.id}>
                            {line.product.sku} × {line.quantity} @ {formatMoney(line.unitCostCents)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>{formatMoney(delivery.totalCostCents)}</td>
                    <td>{formatMoney(delivery.paidAtDeliveryCents)}</td>
                    <td>
                      {outstanding > 0 ? (
                        <span className="badge badge-warning">{formatMoney(outstanding)}</span>
                      ) : (
                        <span className="badge badge-success">Paid</span>
                      )}
                    </td>
                    <td>{delivery.updateStock ? "Updated" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Returns to supplier</h2>
        {supplier.returns.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No returns recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Recorded by</th>
                <th>Items</th>
                <th>Total (purchase price)</th>
              </tr>
            </thead>
            <tbody>
              {supplier.returns.map((ret) => (
                <tr key={ret.id}>
                  <td>{ret.returnedAt.toLocaleDateString()}</td>
                  <td>{ret.referenceNumber ?? "—"}</td>
                  <td>{formatRecordedBy(ret.recordedBy)}</td>
                  <td>
                    <ul className="delivery-items-list">
                      {ret.lines.map((line) => (
                        <li key={line.id}>
                          {line.product.sku} × {line.quantity} @ {formatMoney(line.unitCostCents)}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td>{formatMoney(ret.totalCostCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Payments & credits</h2>
        {supplier.payments.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No payments or credits recorded yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Reference</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {supplier.payments.map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.paidAt.toLocaleDateString()}</td>
                  <td>
                    {payment.type === "PAYMENT" ? (
                      <span className="badge badge-success">Payment</span>
                    ) : (
                      <span className="badge">Credit</span>
                    )}
                  </td>
                  <td>{formatMoney(payment.amountCents)}</td>
                  <td>{payment.reference ?? "—"}</td>
                  <td>{payment.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function formatRecordedBy(user: { name: string; role: string } | null) {
  if (!user) return "—";
  if (user.role === "STAFF") return `POS · ${user.name}`;
  if (user.role === "ADMIN") return `Admin · ${user.name}`;
  if (user.role === "OFFICE") return `Office · ${user.name}`;
  return user.name;
}

function BalanceCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="card balance-card">
      <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{label}</div>
      <div
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          color: highlight ? "var(--danger)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}
