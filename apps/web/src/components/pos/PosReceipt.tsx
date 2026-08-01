"use client";

import { useEffect, useRef } from "react";
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

const QUICK_DISMISS_MS = 4000;
const QUICK_DISMISS_WITH_CHANGE_MS = 6500;

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

function ReceiptBody({
  sale,
  terminalName,
  store,
}: {
  sale: CompletedSale;
  terminalName: string;
  store: StoreSettingsDto;
}) {
  const header = store.receiptHeader?.trim() || store.name;
  const soldAtLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: store.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(sale.soldAt));

  return (
    <div className="pos-receipt">
      <div className="receipt-header">
        <strong>{header}</strong>
        {store.address && <div>{store.address}</div>}
        {store.phone && <div>{store.phone}</div>}
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
      {sale.paymentMethod === "CASH" &&
        sale.kind === "SALE" &&
        sale.tenderCents != null &&
        sale.changeCents != null && (
          <>
            <div className="receipt-line">
              <span>Cash tendered</span>
              <span>{formatMoney(sale.tenderCents)}</span>
            </div>
            <div className="receipt-line">
              <span>Change</span>
              <strong>{formatMoney(sale.changeCents)}</strong>
            </div>
          </>
        )}
      <p className="receipt-thanks">
        {sale.kind === "RETURN"
          ? "Return processed."
          : sale.kind === "OWNER"
            ? "Owner / family withdrawal at purchase price."
            : store.receiptFooter?.trim() || "Thank you!"}
      </p>
    </div>
  );
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
  const s = store ?? DEFAULT_STORE;
  const pauseDismissRef = useRef(false);

  const showChange =
    sale.paymentMethod === "CASH" &&
    sale.kind === "SALE" &&
    sale.changeCents != null &&
    sale.changeCents > 0;

  // Auto-dismiss quick toast so the next customer isn't blocked.
  useEffect(() => {
    if (reprint) return;
    let cancelled = false;
    const ms = showChange ? QUICK_DISMISS_WITH_CHANGE_MS : QUICK_DISMISS_MS;
    let timer = window.setTimeout(tick, ms);

    function tick() {
      if (cancelled) return;
      if (pauseDismissRef.current) {
        timer = window.setTimeout(tick, 800);
        return;
      }
      onClose();
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Only reset when the sale changes — avoid closing early on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reprint, sale.localId, showChange]);

  function handlePrint() {
    window.print();
  }

  if (reprint) {
    return (
      <div className="pos-modal-overlay">
        <div className="pos-modal">
          <h2>{receiptTitle(sale.kind, true)}</h2>
          <ReceiptBody sale={sale} terminalName={terminalName} store={s} />
          <div className="pos-modal-actions">
            <button className="btn" type="button" onClick={handlePrint}>
              Print receipt
            </button>
            <button className="btn btn-secondary" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalLabel =
    sale.kind === "RETURN" ? "Refund" : sale.kind === "OWNER" ? "At cost" : "Total";

  return (
    <div
      className="pos-receipt-toast"
      role="status"
      aria-live="polite"
      onMouseEnter={() => {
        pauseDismissRef.current = true;
      }}
      onMouseLeave={() => {
        pauseDismissRef.current = false;
      }}
    >
      <div className="pos-receipt-toast-main">
        <div className="pos-receipt-toast-copy">
          <strong>{receiptTitle(sale.kind, false)}</strong>
          <span className="pos-receipt-toast-total">
            {totalLabel} {formatMoney(sale.totalCents)}
          </span>
          {sale.receiptNumber && (
            <span className="pos-receipt-toast-id">{sale.receiptNumber}</span>
          )}
          {sale.paymentMethod === "CASH" &&
            sale.kind === "SALE" &&
            sale.tenderCents != null &&
            sale.changeCents != null && (
              <span className={`pos-receipt-toast-change${showChange ? " has-change" : ""}`}>
                Change {formatMoney(sale.changeCents)}
              </span>
            )}
        </div>
        <div className="pos-receipt-toast-actions">
          <button className="btn btn-secondary" type="button" onClick={handlePrint}>
            Print
          </button>
          <button className="btn" type="button" onClick={onClose}>
            Next
          </button>
        </div>
      </div>
      {/* Printable body kept off-screen so auto-print still works */}
      <div className="pos-receipt-print-source" aria-hidden="true">
        <ReceiptBody sale={sale} terminalName={terminalName} store={s} />
      </div>
    </div>
  );
}
