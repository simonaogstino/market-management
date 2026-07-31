"use client";

import { useRef } from "react";
import type { StoreSettingsDto } from "@market/shared";
import { formatMoney } from "@market/shared";
import type { CompletedSale } from "@/lib/pos-db";
import { paymentMethodLabel } from "@/lib/cash";

const DEFAULT_STORE: StoreSettingsDto = {
  name: "Market POS",
  address: null,
  phone: null,
  currency: "IQD",
  lowStockThreshold: 10,
  receiptHeader: null,
  receiptFooter: null,
  timezone: "UTC",
  receiptPrefix: "RCP-",
  receiptNextNumber: 1,
  maxDiscountPercent: 0,
};

function receiptTitle(kind?: string, reprint?: boolean) {
  if (reprint) {
    if (kind === "RETURN") return "Return receipt";
    if (kind === "OWNER") return "Owner / family receipt";
    return "Receipt reprint";
  }
  if (kind === "RETURN") return "Return complete";
  if (kind === "OWNER") return "Owner / family complete";
  return "Sale complete";
}

export function PosReceipt({
  sale,
  terminalName,
  store,
  reprint = false,
  onClose,
}: {
  sale: CompletedSale;
  terminalName: string;
  store?: StoreSettingsDto | null;
  reprint?: boolean;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const s = store ?? DEFAULT_STORE;
  const header = s.receiptHeader?.trim() || s.name;

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
        <h2>{receiptTitle(sale.kind, reprint)}</h2>
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
            {sale.kind === "OWNER" && (
              <div>
                <strong>OWNER / FAMILY (AT COST)</strong>
              </div>
            )}
            {sale.staffName && <div>Staff: {sale.staffName}</div>}
            {sale.paymentMethod && sale.kind !== "OWNER" && (
              <div>Payment: {paymentMethodLabel(sale.paymentMethod)}</div>
            )}
            <div>{soldAtLabel}</div>
            <div className="receipt-id">
              {sale.receiptNumber ? (
                <strong>Receipt {sale.receiptNumber}</strong>
              ) : (
                <>Ref #{sale.localId.slice(0, 8).toUpperCase()} (pending sync)</>
              )}
            </div>
          </div>
          <hr />
          {sale.lines.map((line, i) => (
            <div key={i} className="receipt-line">
              <span>
                {line.productName ?? "Item"} {line.quantity}× {formatMoney(line.unitCents)}
              </span>
              <span>{formatMoney(line.lineCents)}</span>
            </div>
          ))}
          <hr />
          {sale.kind === "SALE" && sale.discountPercent != null && sale.discountPercent > 0 && (
            <>
              {sale.subtotalCents != null && (
                <div className="receipt-line">
                  <span>Subtotal</span>
                  <span>{formatMoney(sale.subtotalCents)}</span>
                </div>
              )}
              <div className="receipt-line">
                <span>Discount ({sale.discountPercent}%)</span>
                <span>
                  −
                  {formatMoney(
                    Math.max(0, (sale.subtotalCents ?? sale.totalCents) - sale.totalCents),
                  )}
                </span>
              </div>
            </>
          )}
          <div className="receipt-total">
            <span>
              {sale.kind === "RETURN" ? "Refund" : sale.kind === "OWNER" ? "Total at cost" : "Total"}
            </span>
            <strong>{formatMoney(sale.totalCents)}</strong>
          </div>
          <p className="receipt-thanks">
            {sale.kind === "RETURN"
              ? "Return processed."
              : sale.kind === "OWNER"
                ? "Owner / family withdrawal at purchase price."
                : s.receiptFooter?.trim() || "Thank you!"}
          </p>
        </div>
        <div className="pos-modal-actions">
          <button className="btn" type="button" onClick={handlePrint}>
            Print receipt
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            {reprint ? "Close" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
