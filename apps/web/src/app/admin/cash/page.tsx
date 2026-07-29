import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { formatMoney } from "@/lib/cash";
import { hasPermission } from "@/lib/permissions";
import { getStoreSettings } from "@/lib/store-settings";
import { IconViewLink } from "@/components/admin/AdminIcons";
import { OpenCashSessionForm } from "@/components/admin/OpenCashSessionForm";

export default async function CashPage() {
  const session = await requirePageAccess("cash:view");
  const canManage = hasPermission(session.user.role, session.user.permissions, "cash:manage");
  const settings = await getStoreSettings(session.user.storeId);

  const [sessions, terminals] = await Promise.all([
    prisma.cashSession.findMany({
      where: { storeId: session.user.storeId },
      orderBy: { openedAt: "desc" },
      take: 50,
      include: {
        terminal: { select: { name: true } },
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
      },
    }),
    prisma.terminal.findMany({
      where: { storeId: session.user.storeId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const openCount = sessions.filter((s) => s.status === "OPEN").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Cash</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            POS drawer sessions, expected cash, and end-of-day variance.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.25rem" }}>
        <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Open drawers</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{openCount}</div>
      </div>

      {canManage && (
        <section className="card" style={{ marginBottom: "1.5rem", maxWidth: 560 }}>
          <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>Open a cash session</h2>
          <OpenCashSessionForm terminals={terminals} />
        </section>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Opened</th>
              <th>Terminal</th>
              <th>Status</th>
              <th align="right">Opening</th>
              <th align="right">Expected</th>
              <th align="right">Counted</th>
              <th align="right">Variance</th>
              <th>By</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ color: "var(--muted)" }}>
                  No cash sessions yet.
                </td>
              </tr>
            ) : (
              sessions.map((s) => (
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
                    {s.expectedCents != null ? formatMoney(s.expectedCents, settings.currency) : "—"}
                  </td>
                  <td align="right">
                    {s.countedCents != null ? formatMoney(s.countedCents, settings.currency) : "—"}
                  </td>
                  <td align="right">
                    {s.varianceCents != null ? (
                      <span
                        className={
                          s.varianceCents === 0
                            ? "badge badge-success"
                            : "badge badge-warning"
                        }
                      >
                        {formatMoney(s.varianceCents, settings.currency)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{s.openedBy?.name ?? "—"}</td>
                  <td>
                    <IconViewLink href={`/admin/cash/${s.id}`} label="View" />
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
