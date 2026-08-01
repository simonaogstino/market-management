import { requirePageAccess } from "@/lib/admin-session";
import { formatMoney } from "@/lib/cash";
import { listOpenCashTerminals } from "@/lib/cash-server";
import { hasPermission } from "@/lib/permissions";
import { getSafeSummary, safeMovementLabel, safeMovementSignedCents } from "@/lib/safe-server";
import { getStoreSettings } from "@/lib/store-settings";
import { prisma } from "@/lib/db";
import {
  SafeAdjustForm,
  SafeBankDepositForm,
  SafeTransferForm,
} from "@/components/admin/SafeForms";

export default async function SafePage() {
  const session = await requirePageAccess("safe:view");
  const canManage = hasPermission(session.user.role, session.user.permissions, "safe:manage");
  const settings = await getStoreSettings(session.user.storeId);

  const [summary, openTerminals, movements] = await Promise.all([
    getSafeSummary(session.user.storeId),
    listOpenCashTerminals(session.user.storeId),
    prisma.safeMovement.findMany({
      where: { storeId: session.user.storeId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        terminal: { select: { name: true } },
        recordedBy: { select: { name: true } },
      },
    }),
  ]);

  const drawers = openTerminals.map((t) => ({
    sessionId: t.sessionId,
    terminalName: t.name,
    cashInBoxCents: t.cashInBoxCents,
  }));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Safe / vault</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Cash collected from POS terminals, waiting for bank deposit.
          </p>
        </div>
      </div>

      <div className="balance-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Safe balance</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatMoney(summary.balanceCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Collected from terminals</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatMoney(summary.fromTerminalCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Banked</div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatMoney(summary.bankDepositCents, settings.currency)}
          </div>
        </div>
      </div>

      {canManage && (
        <div
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            marginBottom: "1.5rem",
          }}
        >
          <section className="card">
            <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Collect from terminal</h2>
            <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.875rem" }}>
              Removes cash from the POS drawer and adds it to the safe.
            </p>
            <SafeTransferForm drawers={drawers} />
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Bank deposit</h2>
            <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.875rem" }}>
              Move money from the safe to the bank.
            </p>
            <SafeBankDepositForm />
          </section>
          <section className="card">
            <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Adjustment</h2>
            <p style={{ color: "var(--muted)", marginTop: 0, fontSize: "0.875rem" }}>
              Rare corrections only — always leave a reason.
            </p>
            <SafeAdjustForm />
          </section>
        </div>
      )}

      {!canManage && (
        <p style={{ color: "var(--muted)" }}>You have view-only access to the safe.</p>
      )}

      <section className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Recent movements</h2>
        {movements.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No safe movements yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Terminal</th>
                <th align="right">Amount</th>
                <th>Reference / note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => {
                const signed = safeMovementSignedCents(m.type, m.amountCents);
                return (
                  <tr key={m.id}>
                    <td>{m.createdAt.toLocaleString()}</td>
                    <td>{safeMovementLabel(m.type)}</td>
                    <td>{m.terminal?.name ?? "—"}</td>
                    <td align="right">
                      <strong style={{ color: signed < 0 ? "#b91c1c" : undefined }}>
                        {signed < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(signed), settings.currency)}
                      </strong>
                    </td>
                    <td>
                      {[m.reference, m.note].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td>{m.recordedBy?.name ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
