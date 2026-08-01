"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { PackagePlus, Plus } from "lucide-react";
import type { ProductDto } from "@market/shared";
import type { StaffSession } from "@/lib/pos-db";
import { createPosProduct, receiveStock } from "@/lib/pos-sync";

type SupplierOption = { id: string; name: string };

export function PosReceiveStock({
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
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ProductDto | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newSupplierId, setNewSupplierId] = useState("");
  const [localProducts, setLocalProducts] = useState(products);
  const skuRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  useEffect(() => {
    if (!newSupplierId && suppliers.length === 1) {
      setNewSupplierId(suppliers[0].id);
    }
  }, [suppliers, newSupplierId]);

  function findBySku(code: string, list = localProducts) {
    const normalized = code.trim().toLowerCase();
    if (!normalized) return null;
    return list.find((p) => p.sku.toLowerCase() === normalized) ?? null;
  }

  function applySku(code: string) {
    const trimmed = code.trim();
    const product = findBySku(trimmed);
    setSku(trimmed);
    setSelected(product);
    if (!product && trimmed) {
      setCreatingNew(true);
      setError("");
      setNewName("");
      setNewCost("");
      setNewPrice("");
      if (suppliers.length === 1) setNewSupplierId(suppliers[0].id);
    } else {
      setCreatingNew(false);
      setError("");
    }
  }

  function handleSkuChange(value: string) {
    setSku(value);
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);

    const product = findBySku(value);
    setSelected(product);
    setError("");

    if (product) {
      setCreatingNew(false);
      scanTimerRef.current = setTimeout(() => applySku(value), 120);
    } else if (!value.trim()) {
      setCreatingNew(false);
    }
  }

  function handleSkuKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    applySku(e.currentTarget.value);
    if (findBySku(e.currentTarget.value)) {
      document.getElementById("receive-qty")?.focus();
    } else if (e.currentTarget.value.trim()) {
      document.getElementById("new-product-name")?.focus();
    }
  }

  async function createNewProduct() {
    const trimmedSku = sku.trim();
    if (!trimmedSku) {
      setError("Scan or enter a SKU first.");
      return null;
    }
    if (!newName.trim()) {
      setError("Enter a product name.");
      return null;
    }
    if (!newSupplierId) {
      setError("Select the supplier that supplied this product.");
      return null;
    }
    const cost = parseFloat(newCost);
    const price = parseFloat(newPrice);
    if (Number.isNaN(cost) || cost < 0) {
      setError("Enter a valid cost.");
      return null;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Enter a valid sale price.");
      return null;
    }

    const result = await createPosProduct({
      staffId: staff.staffId,
      sku: trimmedSku,
      name: newName.trim(),
      cost,
      price,
      supplierId: newSupplierId,
    });

    const created: ProductDto = {
      id: result.product.id,
      sku: result.product.sku,
      name: result.product.name,
      description: null,
      costCents: result.product.costCents,
      priceCents: result.product.priceCents,
      appPriceCents: result.product.priceCents,
      discountPriceCents: null,
      discountQtyLeft: 0,
      stockQty: result.product.stockQty,
      categoryId: null,
      supplierId: result.product.supplierId,
      showOnPos: true,
      showOnApps: false,
      isActive: true,
      version: 1,
      updatedAt: new Date().toISOString(),
    };

    setLocalProducts((prev) => {
      if (prev.some((p) => p.id === created.id)) return prev;
      return [...prev, created];
    });
    setSelected(created);
    setCreatingNew(false);
    setError("");
    return created;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      let product = selected ?? findBySku(sku);

      if (!product && creatingNew) {
        product = await createNewProduct();
        if (!product) {
          setLoading(false);
          return;
        }
      }

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

          {selected && !creatingNew && (
            <div className="pos-receive-product">
              <strong>{selected.name}</strong>
              <div className="pos-muted">Current stock: {selected.stockQty}</div>
            </div>
          )}

          {creatingNew && (
            <div className="pos-receive-new-product">
              <p className="pos-receive-new-banner">
                New product — not in the system yet. Add it, choose the supplier, then confirm receive.
              </p>
              {suppliers.length === 0 ? (
                <p className="pos-error">
                  No active suppliers. Add a supplier in Admin before creating products on POS.
                </p>
              ) : (
                <>
                  <label>
                    Product name
                    <input
                      id="new-product-name"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Product name"
                      required
                    />
                  </label>
                  <label>
                    Supplier
                    <select
                      value={newSupplierId}
                      onChange={(e) => setNewSupplierId(e.target.value)}
                      required
                    >
                      <option value="">Select supplier…</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Cost (IQD)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={newCost}
                      onChange={(e) => setNewCost(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Sale price (IQD)
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      required
                    />
                  </label>
                </>
              )}
            </div>
          )}

          {!creatingNew && !selected && sku.trim() && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => applySku(sku)}
            >
              <Plus className="pos-ico" aria-hidden />
              Add as new product
            </button>
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
          <button
            className="btn"
            type="submit"
            disabled={
              loading ||
              (!selected && !creatingNew) ||
              (creatingNew && suppliers.length === 0)
            }
          >
            <PackagePlus className="pos-ico" aria-hidden />
            {loading
              ? "Saving…"
              : creatingNew
                ? "Add product & receive"
                : "Confirm receive"}
          </button>
        </form>
      </div>
    </div>
  );
}
