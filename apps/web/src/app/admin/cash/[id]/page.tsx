import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { formatMoney } from "@/lib/cash";
import { computeExpectedCashCents } from "@/lib/cash-server";
import { hasPermission } from "@/lib/permissions";
import { getStoreSettings } from "@/lib/store-settings";
import { CashSessionActions } from "@/components/admin/CashSessionActions";
import { TransferToSafeFromSessionForm } from "@/components/admin/SafeForms";

export default async function CashSessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("cash:view");
  const canManage = hasPermission(session.user.role, session.user.permissions, "cash:manage");
  const canSafe = hasPermission(session.user.role, session.user.permissions, "safe:manage");
  const { id } = await params;
  const settings = await getStoreSettings(session.user.storeId);

  const cashSession = await prisma.cashSession.findFirst({
    where: { id, storeId: session.user.storeId },
    include: {
      terminal: { select: { name: true } },
      openedBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      movements: {
        orderBy: { createdAt: "desc" },
        include: { recordedBy: { select: { name: true } } },
      },
    },
  });
  if (!cashSession) notFound();

  const summary =
    cashSession.status === "OPEN"
      ? await computeExpectedCashCents({
          terminalId: cashSession.terminalId,
          openingCents: cashSession.openingCents,
          openedAt: cashSession.openedAt,
          sessionId: cashSession.id,
        })
      : {
          openingCents: cashSession.openingCents,
          cashSalesCents: 0,
          cashReturnsCents: 0,
          payInCents: 0,
          payOutCents: 0,
          expectedCents: cashSession.expectedCents ?? 0,
        };

  // For closed sessions, recompute sales breakdown for display
  const live =
    cashSession.status === "CLOSED"
      ? await computeExpectedCashCents({
          terminalId: cashSession.terminalId,
          openingCents: cashSession.openingCents,
          openedAt: cashSession.openedAt,
          closedAt: cashSession.closedAt,
          sessionId: cashSession.id,
        })
      : summary;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Cash — {cashSession.terminal.name}</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Opened {cashSession.openedAt.toLocaleString()}
            {cashSession.openedBy ? ` by ${cashSession.openedBy.name}` : ""}
            {cashSession.status === "CLOSED" && cashSession.closedAt
              ? ` · Closed ${cashSession.closedAt.toLocaleString()}`
              : ""}
          </p>
        </div>
        <Link className="btn btn-secondary" href="/admin/cash">
          All sessions
        </Link>
      </div>

      <div className="balance-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Opening float</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {formatMoney(live.openingCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Cash sales</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {formatMoney(live.cashSalesCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Cash returns</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {formatMoney(live.cashReturnsCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Pay in / out</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {formatMoney(live.payInCents - live.payOutCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Expected</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {formatMoney(
              cashSession.expectedCents ?? live.expectedCents,
              settings.currency,
            )}
          </div>
        </div>
        {cashSession.countedCents != null && (
          <div className="card balance-card">
            <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Counted</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              {formatMoney(cashSession.countedCents, settings.currency)}
            </div>
          </div>
        )}
        {cashSession.varianceCents != null && (
          <div className="card balance-card">
            <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Variance</div>
            <div
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: cashSession.varianceCents === 0 ? undefined : "var(--danger)",
              }}
            >
              {formatMoney(cashSession.varianceCents, settings.currency)}
            </div>
          </div>
        )}
      </div>

      {canSafe && cashSession.status === "OPEN" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <TransferToSafeFromSessionForm
            sessionId={cashSession.id}
            maxCents={live.expectedCents}
          />
        </div>
      )}

      {canManage && cashSession.status === "OPEN" && (
        <div style={{ marginBottom: "1.5rem" }}>
          <CashSessionActions sessionId={cashSession.id} expectedCents={live.expectedCents} />
        </div>
      )}

      <section className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Movements</h2>
        {cashSession.movements.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No pay-in / pay-out movements.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th align="right">Amount</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {cashSession.movements.map((m) => (
                <tr key={m.id}>
                  <td>{m.createdAt.toLocaleString()}</td>
                  <td>{m.type === "PAY_IN" ? "Pay in" : "Pay out"}</td>
                  <td align="right">{formatMoney(m.amountCents, settings.currency)}</td>
                  <td>{m.reason ?? "—"}</td>
                  <td>{m.recordedBy?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
