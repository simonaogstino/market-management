"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { formatMoney } from "@market/shared";
import { paymentMethodLabel } from "@/lib/cash";
import {
  getTodaysSales,
  toCompletedSale,
  type CompletedSale,
  type SaleOutbox,
} from "@/lib/pos-db";

function kindLabel(kind: SaleOutbox["kind"]) {
  if (kind === "RETURN") return "Return";
  if (kind === "OWNER") return "Owner / family";
  return "Sale";
}

export function PosHistoryPanel({
  open,
  timezone,
  onClose,
  onReprint,
}: {
  open: boolean;
  timezone?: string;
  onClose: () => void;
  onReprint: (sale: CompletedSale) => void;
}) {
  const [sales, setSales] = useState<SaleOutbox[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setSales(await getTodaysSales(timezone || "UTC"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) void load();
  }, [open, timezone]);

  if (!open) return null;

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pos-sync-panel-header">
          <h2>Today&apos;s sales</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="pos-muted" style={{ marginTop: 0 }}>
          Transactions on this terminal today. Reprint a receipt if the customer needs another copy.
        </p>
        {loading ? (
          <p className="pos-muted">Loading…</p>
        ) : sales.length === 0 ? (
          <p className="pos-muted">No sales recorded on this terminal today.</p>
        ) : (
          <div className="pos-history-list">
            {sales.map((sale) => (
              <div key={sale.localId} className="pos-history-item">
                <div className="pos-history-item-main">
                  <div className="pos-history-item-title">
                    <strong>{kindLabel(sale.kind)}</strong>
                    <span className="pos-muted">
                      {new Date(sale.soldAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="pos-muted">
                    {sale.receiptNumber
                      ? `Receipt ${sale.receiptNumber}`
                      : `Ref #${sale.localId.slice(0, 8).toUpperCase()}`}
                    {sale.staffName ? ` · ${sale.staffName}` : ""}
                    {sale.paymentMethod && sale.kind !== "OWNER"
                      ? ` · ${paymentMethodLabel(sale.paymentMethod)}`
                      : ""}
                  </div>
                  <div className="pos-history-item-amount">
                    {sale.kind === "RETURN" ? "−" : ""}
                    {formatMoney(sale.totalCents)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={async () => {
                    onReprint(await toCompletedSale(sale));
                  }}
                >
                  <Printer className="pos-ico" aria-hidden />
                  Print receipt
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
