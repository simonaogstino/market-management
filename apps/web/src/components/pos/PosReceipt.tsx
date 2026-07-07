"use client";

import { useRef } from "react";
import type { StoreSettingsDto } from "@market/shared";
import { formatMoney } from "@market/shared";
import type { CompletedSale } from "@/lib/pos-db";

const DEFAULT_STORE: StoreSettingsDto = {
  name: "Market POS",
  address: null,
  phone: null,
  currency: "USD",
  lowStockThreshold: 10,
  receiptHeader: null,
  receiptFooter: null,
  timezone: "UTC",
};

export function PosReceipt({
  sale,
  terminalName,
  store,
  onClose,
}: {
  sale: CompletedSale;
  terminalName: string;
  store?: StoreSettingsDto | null;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const s = store ?? DEFAULT_STORE;
  const header = s.receiptHeader?.trim() || s.name;
  const currency = s.currency;

  function handlePrint() {
    window.print();
  }

  const soldAtLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: s.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(sale.soldAt));

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal">
        <h2>{sale.kind === "RETURN" ? "Return complete" : "Sale complete"}</h2>
        <div className="pos-receipt" ref={printRef}>
          <div className="receipt-header">
            <strong>{header}</strong>
            {s.address && <div>{s.address}</div>}
            {s.phone && <div>{s.phone}</div>}
            <div>{terminalName}</div>
            {sale.kind === "RETURN" && (
              <div>
                <strong>CUSTOMER RETURN</strong>
              </div>
            )}
            {sale.staffName && <div>Staff: {sale.staffName}</div>}
            <div>{soldAtLabel}</div>
            <div className="receipt-id">#{sale.localId.slice(0, 8).toUpperCase()}</div>
          </div>
          <hr />
          {sale.lines.map((line, i) => (
            <div key={i} className="receipt-line">
              <span>
                {line.productName ?? "Item"} {line.quantity}× {formatMoney(line.unitCents, currency)}
              </span>
              <span>{formatMoney(line.lineCents, currency)}</span>
            </div>
          ))}
          <hr />
          <div className="receipt-total">
            <span>{sale.kind === "RETURN" ? "Refund" : "Total"}</span>
            <strong>{formatMoney(sale.totalCents, currency)}</strong>
          </div>
          <p className="receipt-thanks">
            {sale.kind === "RETURN"
              ? "Return processed."
              : s.receiptFooter?.trim() || "Thank you!"}
          </p>
        </div>
        <div className="pos-modal-actions">
          <button className="btn" type="button" onClick={handlePrint}>
            Print receipt
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
