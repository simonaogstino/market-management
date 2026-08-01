import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { formatMoney } from "@/lib/cash";
import { getStoreCashBoxes } from "@/lib/cash-server";
import { hasPermission } from "@/lib/permissions";
import { getStoreSettings } from "@/lib/store-settings";
import { IconViewLink } from "@/components/admin/AdminIcons";
import { OpenCashSessionForm } from "@/components/admin/OpenCashSessionForm";

export default async function CashPage() {
  const session = await requirePageAccess("cash:view");
  const canManage = hasPermission(session.user.role, session.user.permissions, "cash:manage");
  const settings = await getStoreSettings(session.user.storeId);

  const [{ boxes, totalCashCents, totalPaidOutCents }, terminals, recentSessions] =
    await Promise.all([
      getStoreCashBoxes(session.user.storeId),
      prisma.terminal.findMany({
        where: { storeId: session.user.storeId, isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.cashSession.findMany({
        where: { storeId: session.user.storeId },
        orderBy: { openedAt: "desc" },
        take: 20,
        include: {
          terminal: { select: { name: true } },
          openedBy: { select: { name: true } },
        },
      }),
    ]);

  const openTerminalIds = new Set(
    boxes.filter((b) => b.status === "OPEN").map((b) => b.terminalId),
  );
  const terminalsNeedingOpen = terminals.filter((t) => !openTerminalIds.has(t.id));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Cash box</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Cash in each POS terminal. Paying suppliers or expenses from cash reduces that box.
            Collect cash into the{" "}
            <Link href="/admin/safe">store safe</Link> when the accountant picks it up.
          </p>
        </div>
      </div>

      <div className="balance-grid" style={{ marginBottom: "1.5rem" }}>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            Total cash (all terminals)
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatMoney(totalCashCents, settings.currency)}
          </div>
        </div>
        <div className="card balance-card">
          <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
            Total paid out (open sessions)
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>
            {formatMoney(totalPaidOutCents, settings.currency)}
          </div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: "1.5rem", overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Cash by terminal</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Terminal</th>
              <th>Drawer</th>
              <th align="right">Cash in box</th>
              <th align="right">Paid out</th>
              <th align="right">Cash sales</th>
              <th align="right">Cash returns</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {boxes.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
                  No POS terminals yet.
                </td>
              </tr>
            ) : (
              boxes.map((box) => (
                <tr key={box.terminalId}>
                  <td>
                    <strong>{box.terminalName}</strong>
                  </td>
                  <td>
                    {box.status === "OPEN" ? (
                      <span className="badge badge-success">Open</span>
                    ) : (
                      <span className="badge badge-warning">Closed</span>
                    )}
                  </td>
                  <td align="right">
                    <strong>{formatMoney(box.cashInBoxCents, settings.currency)}</strong>
                  </td>
                  <td align="right">{formatMoney(box.paidOutCents, settings.currency)}</td>
                  <td align="right">{formatMoney(box.cashSalesCents, settings.currency)}</td>
                  <td align="right">{formatMoney(box.cashReturnsCents, settings.currency)}</td>
                  <td>
                    {box.sessionId ? (
                      <IconViewLink href={`/admin/cash/${box.sessionId}`} label="Details" />
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
                        Open drawer to start
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
            <tr>
              <td colSpan={2}>
                <strong>All terminals</strong>
              </td>
              <td align="right">
                <strong>{formatMoney(totalCashCents, settings.currency)}</strong>
              </td>
              <td align="right">
                <strong>{formatMoney(totalPaidOutCents, settings.currency)}</strong>
              </td>
              <td colSpan={3}></td>
            </tr>
          </tbody>
        </table>
      </section>

      {canManage && terminalsNeedingOpen.length > 0 && (
        <section className="card" style={{ marginBottom: "1.5rem", maxWidth: 560 }}>
          <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Open a cash drawer</h2>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>
            Start with an opening float. Cash sales add to the box; pay-outs, supplier payments,
            and expenses paid from cash reduce it.
          </p>
          <OpenCashSessionForm terminals={terminalsNeedingOpen} />
        </section>
      )}

      <section className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Recent sessions</h2>
        {recentSessions.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No sessions yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Opened</th>
                <th>Terminal</th>
                <th>Status</th>
                <th align="right">Opening</th>
                <th align="right">Expected / counted</th>
                <th>By</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentSessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.openedAt.toLocaleString()}</td>
                  <td>{s.terminal.name}</td>
                  <td>
                    {s.status === "OPEN" ? (
                      <span className="badge badge-warning">Open</span>
                    ) : (
                      <span className="badge badge-success">Closed</span>
                    )}
                  </td>
                  <td align="right">{formatMoney(s.openingCents, settings.currency)}</td>
                  <td align="right">
                    {s.status === "CLOSED" && s.expectedCents != null && s.countedCents != null
                      ? `${formatMoney(s.expectedCents)} / ${formatMoney(s.countedCents)}`
                      : "—"}
                  </td>
                  <td>{s.openedBy?.name ?? "—"}</td>
                  <td>
                    <IconViewLink href={`/admin/cash/${s.id}`} />
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
