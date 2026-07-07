"use client";

import { useState } from "react";
import type { ProductDto } from "@market/shared";
import { supplierReturnStock } from "@/lib/pos-sync";
import { formatMoney } from "@/lib/suppliers";
import type { StaffSession } from "@/lib/pos-db";

interface SupplierOption {
  id: string;
  name: string;
}

interface ReturnLine {
  productId: string;
  quantity: number;
}

export function PosSupplierReturn({
  staff,
  products,
  suppliers,
  onClose,
  onSuccess,
}: {
  staff: StaffSession;
  products: ProductDto[];
  suppliers: SupplierOption[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([]);
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const supplierName = suppliers.find((s) => s.id === supplierId)?.name;

  function findProduct(code: string) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    return products.find((p) => p.sku.toLowerCase() === normalized) ?? null;
  }

  function addLine() {
    const product = findProduct(sku);
    const quantity = parseInt(qty, 10);
    if (!product || !quantity || quantity <= 0) {
      setError("Enter a valid product SKU and quantity.");
      return;
    }
    if (!product.supplierId) {
      setError("This product has no supplier. Assign one in Admin → Products.");
      return;
    }
    if (supplierId && product.supplierId !== supplierId) {
      setError("This product belongs to a different supplier.");
      return;
    }

    if (!supplierId) {
      setSupplierId(product.supplierId);
    }

    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product.id ? { ...l, quantity: l.quantity + quantity } : l,
        );
      }
      return [...prev, { productId: product.id, quantity }];
    });
    setSku("");
    setQty("1");
    setError("");
  }

  async function handleSubmit() {
    if (!supplierId) {
      setError("Add a product by SKU to detect the supplier.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one product.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await supplierReturnStock({
        staffId: staff.staffId,
        supplierId,
        lines,
        reference: reference || undefined,
      });
      onSuccess(`Returned ${formatMoney(result.totalCostCents)} to supplier (credit deducted).`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Return failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pos-modal-overlay" onClick={onClose}>
      <div className="pos-modal pos-receive-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pos-sync-panel-header">
          <h2>Return to supplier</h2>
          <button type="button" className="link-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="pos-muted" style={{ marginTop: 0 }}>
          Scan a product SKU — the supplier is detected automatically.
        </p>

        {supplierName && (
          <p style={{ margin: "0 0 1rem", fontWeight: 600 }}>
            Supplier: {supplierName}
          </p>
        )}

        <div className="pos-search-row">
          <label style={{ display: "grid", gap: "0.35rem", flex: 1 }}>
            SKU / barcode
            <input
              className="pos-field"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLine();
                }
              }}
              placeholder="Scan barcode…"
              autoFocus
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem", width: 80 }}>
            Qty
            <input
              className="pos-field"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              type="number"
              min="1"
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={addLine}>
            Add
          </button>
        </div>

        {lines.length > 0 && (
          <ul className="delivery-items-list pos-return-lines">
            {lines.map((line) => {
              const product = products.find((p) => p.id === line.productId);
              if (!product) return null;
              return (
                <li key={line.productId}>
                  {product.name} × {line.quantity}
                </li>
              );
            })}
          </ul>
        )}

        <label className="admin-form" style={{ display: "grid", gap: "0.35rem", marginTop: "1rem" }}>
          Reference
          <input
            className="pos-field"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional"
          />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="pos-modal-actions">
          <button type="button" className="btn" disabled={loading} onClick={handleSubmit}>
            {loading ? "Saving…" : "Confirm return"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
