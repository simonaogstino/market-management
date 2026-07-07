"use client";

import { useRef } from "react";
import type { CompletedSale } from "@/lib/pos-db";

export function PosReceipt({
  sale,
  terminalName,
  onClose,
}: {
  sale: CompletedSale;
  terminalName: string;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    window.print();
  }

  return (
    <div className="pos-modal-overlay">
      <div className="pos-modal">
        <h2>{sale.kind === "RETURN" ? "Return complete" : "Sale complete"}</h2>
        <div className="pos-receipt" ref={printRef}>
          <div className="receipt-header">
            <strong>Market POS</strong>
            <div>{terminalName}</div>
            {sale.kind === "RETURN" && <div><strong>CUSTOMER RETURN</strong></div>}
            {sale.staffName && <div>Staff: {sale.staffName}</div>}
            <div>{new Date(sale.soldAt).toLocaleString()}</div>
            <div className="receipt-id">#{sale.localId.slice(0, 8).toUpperCase()}</div>
          </div>
          <hr />
          {sale.lines.map((line, i) => (
            <div key={i} className="receipt-line">
              <span>
                {line.productName ?? "Item"} {line.quantity}× ${(line.unitCents / 100).toFixed(2)}
              </span>
              <span>${(line.lineCents / 100).toFixed(2)}</span>
            </div>
          ))}
          <hr />
          <div className="receipt-total">
            <span>{sale.kind === "RETURN" ? "Refund" : "Total"}</span>
            <strong>${(sale.totalCents / 100).toFixed(2)}</strong>
          </div>
          <p className="receipt-thanks">{sale.kind === "RETURN" ? "Return processed." : "Thank you!"}</p>
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
