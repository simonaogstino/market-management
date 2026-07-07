import Link from "next/link";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { toggleSupplierActiveForm } from "@/lib/actions/suppliers";
import { computeSupplierBalance, formatMoney } from "@/lib/suppliers";
import { hasPermission } from "@/lib/permissions";
import { IconEditLink, IconViewLink, IconToggleButton, IconPower, AddButton } from "@/components/admin/AdminIcons";

export default async function SuppliersPage() {
  const session = await requirePageAccess("suppliers:view");
  const canManage = hasPermission(session.user.role, session.user.permissions, "suppliers:manage");

  const suppliers = await prisma.supplier.findMany({
    where: { storeId: session.user.storeId },
    orderBy: { name: "asc" },
    include: {
      deliveries: { select: { totalCostCents: true, paidAtDeliveryCents: true } },
      returns: { select: { totalCostCents: true } },
      payments: { select: { type: true, amountCents: true } },
    },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Suppliers</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Track deliveries, payments, credits, and amounts still owed.
          </p>
        </div>
        {canManage && (
          <AddButton href="/admin/suppliers/new" label="Add supplier" />
        )}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Supplier</th>
              <th>Contact</th>
              <th>Total delivered</th>
              <th>Total paid</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ color: "var(--muted)" }}>
                  No suppliers yet. <Link href="/admin/suppliers/new">Add one</Link>.
                </td>
              </tr>
            ) : (
              suppliers.map((supplier) => {
                const balance = computeSupplierBalance({
                  openingBalanceCents: supplier.openingBalanceCents,
                  deliveries: supplier.deliveries,
                  returns: supplier.returns,
                  payments: supplier.payments,
                });

                return (
                  <tr key={supplier.id}>
                    <td>
                      <Link href={`/admin/suppliers/${supplier.id}`}>{supplier.name}</Link>
                    </td>
                    <td>
                      {supplier.contactPerson ?? supplier.phone ?? supplier.email ?? "—"}
                    </td>
                    <td>{formatMoney(balance.totalDelivered)}</td>
                    <td>{formatMoney(balance.totalPaid)}</td>
                    <td>
                      {balance.remainingToPayCents > 0 ? (
                        <span className="badge badge-warning">
                          {formatMoney(balance.remainingToPayCents)}
                        </span>
                      ) : balance.prepaidCreditCents > 0 ? (
                        <span className="badge badge-success">
                          Credit {formatMoney(balance.prepaidCreditCents)}
                        </span>
                      ) : (
                        <span className="badge badge-success">Paid up</span>
                      )}
                    </td>
                    <td>
                      {supplier.isActive ? (
                        <span className="badge badge-success">Active</span>
                      ) : (
                        <span className="badge">Inactive</span>
                      )}
                    </td>
                    <td>
                      <div className="table-actions">
                        <IconViewLink href={`/admin/suppliers/${supplier.id}`} />
                        {canManage && (
                          <>
                            <IconEditLink href={`/admin/suppliers/${supplier.id}/edit`} />
                            <form action={toggleSupplierActiveForm}>
                              <input type="hidden" name="supplierId" value={supplier.id} />
                              <IconToggleButton
                                label={supplier.isActive ? "Deactivate" : "Activate"}
                              >
                                <IconPower active={supplier.isActive} />
                              </IconToggleButton>
                            </form>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
