"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";
import type { StoreSettingsDto } from "@market/shared";
import { formatMoney } from "@market/shared";
import type { SupplierReturnReceiptDto } from "@/lib/pos-sync";

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

export function PosSupplierReturnReceipt({
  receipt,
  terminalName,
  store,
  onClose,
}: {
  receipt: SupplierReturnReceiptDto;
  terminalName: string;
  store?: StoreSettingsDto | null;
  onClose: () => void;
}) {
  const s = store ?? DEFAULT_STORE;
  const header = s.receiptHeader?.trim() || s.name;
  const printRef = useRef<HTMLDivElement>(null);

  const returnedAtLabel = new Intl.DateTimeFormat(undefined, {
    timeZone: s.timezone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(receipt.returnedAt));

  function handlePrint() {
    window.print();
  }

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal">
        <h2>Supplier return complete</h2>
        <div className="pos-receipt" ref={printRef}>
          <div className="receipt-header">
            <div>
              <strong>GOODS RETURNED TO SUPPLIER</strong>
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              From (market): <strong>{header}</strong>
            </div>
            <div style={{ marginTop: "0.5rem" }}>
              To (supplier): <strong>{receipt.supplierName}</strong>
            </div>
            <div style={{ marginTop: "0.5rem" }}>{terminalName}</div>
            {receipt.staffName && <div>Recorded by: {receipt.staffName}</div>}
            <div>{returnedAtLabel}</div>
            <div className="receipt-id">
              {receipt.referenceNumber ? (
                <strong>Ref {receipt.referenceNumber}</strong>
              ) : (
                <>Ref #{receipt.id.slice(0, 8).toUpperCase()}</>
              )}
            </div>
          </div>
          <hr />
          <div style={{ fontSize: "0.8rem", marginBottom: "0.35rem" }}>
            Items returned from market stock to {receipt.supplierName}:
          </div>
          {receipt.lines.map((line) => (
            <div key={line.productId} className="receipt-line">
              <span>
                {line.productName} ({line.sku}) {line.quantity}× {formatMoney(line.unitCostCents)}
              </span>
              <span>{formatMoney(line.lineCostCents)}</span>
            </div>
          ))}
          <hr />
          <div className="receipt-total">
            <span>Credit to {receipt.supplierName}</span>
            <strong>{formatMoney(receipt.totalCostCents)}</strong>
          </div>
          {receipt.note && <p className="receipt-thanks">{receipt.note}</p>}
          <p className="receipt-thanks">
            These items left store stock and were returned to {receipt.supplierName}.
          </p>
        </div>
        <div className="pos-modal-actions">
          <button className="btn" type="button" onClick={handlePrint}>
            <Printer className="pos-ico" aria-hidden />
            Print receipt
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            <X className="pos-ico" aria-hidden />
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
