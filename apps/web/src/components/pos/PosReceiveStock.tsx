"use client";

import { FormEvent, useRef, useState } from "react";
import type { ProductDto } from "@market/shared";
import type { StaffSession } from "@/lib/pos-db";
import { receiveStock } from "@/lib/pos-sync";

export function PosReceiveStock({
  staff,
  products,
  onClose,
  onSuccess,
}: {
  staff: StaffSession;
  products: ProductDto[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ProductDto | null>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function findBySku(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    return products.find((p) => p.sku.toLowerCase() === normalized) ?? null;
  }

  function applySku(code: string) {
    const product = findBySku(code);
    setSku(code);
    setSelected(product);
    if (!product) setError(`Product not found: ${code.trim()}`);
    else setError("");
  }

  function handleSkuChange(value: string) {
    setSku(value);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);

    const product = findBySku(value);
    setSelected(product);
    setError("");

    if (product) {
      scanTimerRef.current = setTimeout(() => applySku(value), 120);
    }
  }

  function handleSkuKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    applySku(e.currentTarget.value);
    if (!findBySku(e.currentTarget.value)) return;
    document.getElementById("receive-qty")?.focus();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const product = selected ?? findBySku(sku);
    if (!product) {
      setError(`Product not found: ${sku.trim()}`);
      setLoading(false);
      return;
    }

    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError("Enter a positive quantity.");
      setLoading(false);
      return;
    }

    try {
      const result = await receiveStock({
        staffId: staff.staffId,
        sku: product.sku,
        quantity: qty,
        note: note.trim() || undefined,
      });
      onSuccess(
        `Received ${qty}× ${result.productName}. New stock: ${result.newStockQty}`,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not receive stock.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-receive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pos-sync-panel-header">
          <h2>Receive stock</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="pos-muted">Scan or enter SKU, then quantity received.</p>
        <form className="admin-form" onSubmit={onSubmit}>
          <label>
            SKU / barcode
            <input
              ref={skuRef}
              value={sku}
              onChange={(e) => handleSkuChange(e.target.value)}
              onKeyDown={handleSkuKeyDown}
              placeholder="Scan barcode…"
              autoFocus
              autoComplete="off"
            />
          </label>
          {selected && (
            <div className="pos-receive-product">
              <strong>{selected.name}</strong>
              <div className="pos-muted">Current stock: {selected.stockQty}</div>
            </div>
          )}
          <label>
            Quantity received
            <input
              id="receive-qty"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </label>
          <label>
            Note (optional)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Delivery #4521"
            />
          </label>
          {error && <p className="pos-error">{error}</p>}
          <button className="btn" type="submit" disabled={loading || !selected}>
            {loading ? "Saving…" : "Confirm receive"}
          </button>
        </form>
      </div>
    </div>
  );
}
