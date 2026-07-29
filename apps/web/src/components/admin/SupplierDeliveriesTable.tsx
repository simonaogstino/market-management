"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/suppliers";

export type SupplierDeliveryRow = {
  id: string;
  deliveredAt: string;
  referenceNumber: string | null;
  listTotalCents: number;
  discountPercent: number;
  discountCents: number;
  totalCostCents: number;
  paidAtDeliveryCents: number;
  updateStock: boolean;
  lines: Array<{
    id: string;
    quantity: number;
    unitCostCents: number;
    product: { sku: string; name: string };
  }>;
};

function startOfDay(isoDate: string) {
  const d = new Date(`${isoDate}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endOfDay(isoDate: string) {
  const d = new Date(`${isoDate}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function SupplierDeliveriesTable({ deliveries }: { deliveries: SupplierDeliveryRow[] }) {
  const [dateFilterOpen, setDateFilterOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filtered = useMemo(() => {
    const from = fromDate ? startOfDay(fromDate) : null;
    const to = toDate ? endOfDay(toDate) : null;
    if (!from && !to) return deliveries;

    return deliveries.filter((delivery) => {
      const at = new Date(delivery.deliveredAt);
      if (Number.isNaN(at.getTime())) return false;
      if (from && at < from) return false;
      if (to && at > to) return false;
      return true;
    });
  }, [deliveries, fromDate, toDate]);

  const hasActiveFilter = Boolean(fromDate || toDate);

  function clearFilter() {
    setFromDate("");
    setToDate("");
  }

  if (deliveries.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No deliveries recorded yet.</p>;
  }

  return (
    <div>
      {dateFilterOpen && (
        <div className="filters-form" style={{ marginBottom: "1rem" }}>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          {hasActiveFilter && (
            <button type="button" className="btn btn-secondary" onClick={clearFilter}>
              Clear
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>
          No deliveries in this date range.
          {hasActiveFilter && (
            <>
              {" "}
              <button type="button" className="link-button" onClick={clearFilter}>
                Clear filter
              </button>
            </>
          )}
        </p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>
                <button
                  type="button"
                  className="table-filter-trigger"
                  aria-expanded={dateFilterOpen}
                  onClick={() => setDateFilterOpen((open) => !open)}
                >
                  Date{hasActiveFilter ? " · filtered" : ""}
                  <span aria-hidden>{dateFilterOpen ? " ▴" : " ▾"}</span>
                </button>
              </th>
              <th>Reference</th>
              <th>Items</th>
              <th>Subtotal</th>
              <th>Discount</th>
              <th>Net total</th>
              <th>Paid on delivery</th>
              <th>Outstanding</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((delivery) => {
              const outstanding = delivery.totalCostCents - delivery.paidAtDeliveryCents;
              const listTotal =
                delivery.listTotalCents > 0 ? delivery.listTotalCents : delivery.totalCostCents;
              return (
                <tr key={delivery.id}>
                  <td>{new Date(delivery.deliveredAt).toLocaleDateString()}</td>
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
                  <td>{formatMoney(listTotal)}</td>
                  <td>
                    {delivery.discountPercent > 0
                      ? `${delivery.discountPercent}% (−${formatMoney(delivery.discountCents)})`
                      : "—"}
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
    </div>
  );
}
