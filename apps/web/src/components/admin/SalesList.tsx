"use client";

import { useState } from "react";
import { formatMoney } from "@market/shared";

export type AdminSaleRow = {
  id: string;
  receiptNumber: string | null;
  soldAt: string;
  terminalName: string;
  staffName: string | null;
  kind: string;
  totalCents: number;
  status: string;
  lines: Array<{
    productName: string;
    sku: string;
    quantity: number;
    unitCents: number;
    lineCents: number;
  }>;
};

function SaleStatusBadge({ status }: { status: string }) {
  if (status === "SYNCED") return <span className="badge badge-success">Synced</span>;
  if (status === "PENDING_SYNC") return <span className="badge badge-warning">Pending</span>;
  if (status === "CONFLICT") return <span className="badge badge-danger">Conflict</span>;
  if (status === "VOIDED") return <span className="badge">Voided</span>;
  return <span className="badge">{status}</span>;
}

function SaleDetailModal({
  sale,
  currency,
  timezone,
  onClose,
}: {
  sale: AdminSaleRow;
  currency: string;
  timezone: string;
  onClose: () => void;
}) {
  const soldAtLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(sale.soldAt));

  return (
    <div className="admin-modal-overlay" onClick={onClose} role="presentation">
      <div
        className="admin-modal card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="sale-detail-title"
      >
        <div className="admin-modal-header">
          <h2 id="sale-detail-title" style={{ margin: 0 }}>
            {sale.receiptNumber ?? "Sale details"}
          </h2>
          <button type="button" className="icon-action" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="admin-modal-meta">
          <div>
            <span className="admin-modal-label">Date</span>
            <span>{soldAtLabel}</span>
          </div>
          <div>
            <span className="admin-modal-label">Terminal</span>
            <span>{sale.terminalName}</span>
          </div>
          <div>
            <span className="admin-modal-label">Cashier</span>
            <span>{sale.staffName ?? "—"}</span>
          </div>
          <div>
            <span className="admin-modal-label">Type</span>
            <span>{sale.kind === "RETURN" ? "Customer return" : "Sale"}</span>
          </div>
          <div>
            <span className="admin-modal-label">Status</span>
            <SaleStatusBadge status={sale.status} />
          </div>
        </div>

        <table className="data-table" style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th align="right">Qty</th>
              <th align="right">Unit</th>
              <th align="right">Line</th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((line, i) => (
              <tr key={i}>
                <td>{line.sku}</td>
                <td>{line.productName}</td>
                <td align="right">{line.quantity}</td>
                <td align="right">{formatMoney(line.unitCents, currency)}</td>
                <td align="right">{formatMoney(line.lineCents, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="admin-modal-total">
          <span>{sale.kind === "RETURN" ? "Refund total" : "Total"}</span>
          <strong>
            {sale.kind === "RETURN" ? "−" : ""}
            {formatMoney(sale.totalCents, currency)}
          </strong>
        </div>

        <div className="admin-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function SalesList({
  sales,
  currency,
  timezone,
}: {
  sales: AdminSaleRow[];
  currency: string;
  timezone: string;
}) {
  const [selected, setSelected] = useState<AdminSaleRow | null>(null);

  if (sales.length === 0) {
    return (
      <div className="card">
        <p style={{ color: "var(--muted)", margin: 0 }}>No sales found.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table sales-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Time</th>
              <th>Terminal</th>
              <th>Staff</th>
              <th align="right">Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((sale) => (
              <tr key={sale.id}>
                <td>
                  <button
                    type="button"
                    className="link-button sales-receipt-link"
                    onClick={() => setSelected(sale)}
                  >
                    {sale.receiptNumber ?? "—"}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button sales-row-link"
                    onClick={() => setSelected(sale)}
                  >
                    {new Intl.DateTimeFormat(undefined, {
                      timeZone: timezone,
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(sale.soldAt))}
                  </button>
                </td>
                <td>
                  <button
                    type="button"
                    className="link-button sales-row-link"
                    onClick={() => setSelected(sale)}
                  >
                    {sale.terminalName}
                  </button>
                </td>
                <td>{sale.staffName ?? "—"}</td>
                <td align="right">
                  {sale.kind === "RETURN" ? "−" : ""}
                  {formatMoney(sale.totalCents, currency)}
                </td>
                <td>
                  {sale.kind === "RETURN" && <span className="badge">Return</span>}{" "}
                  <SaleStatusBadge status={sale.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <SaleDetailModal
          sale={selected}
          currency={currency}
          timezone={timezone}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
