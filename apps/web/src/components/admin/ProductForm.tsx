"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/lib/actions/admin";

interface Category {
  id: string;
  name: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  costCents: number;
  priceCents: number;
  appPriceCents: number;
  supplierId: string | null;
  categoryId: string | null;
  stockQty: number;
  isActive: boolean;
  showOnPos: boolean;
  showOnApps: boolean;
  discountPriceCents: number | null;
  discountQtyLeft: number;
}

export function ProductForm({
  categories,
  suppliers,
  product,
}: {
  categories: Category[];
  suppliers: SupplierOption[];
  product?: Product;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOnApps, setShowOnApps] = useState(product?.showOnApps ?? false);
  const [promoEnabled, setPromoEnabled] = useState(
    Boolean(
      product &&
        product.discountPriceCents != null &&
        product.discountQtyLeft > 0,
    ),
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = product
      ? await updateProduct(product.id, formData)
      : await createProduct(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/products");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        SKU *
        <input name="sku" required defaultValue={product?.sku ?? ""} placeholder="e.g. MILK-001" />
      </label>
      <label>
        Name *
        <input name="name" required defaultValue={product?.name ?? ""} placeholder="Product name" />
      </label>
      <label>
        Description
        <textarea
          name="description"
          rows={3}
          defaultValue={product?.description ?? ""}
          placeholder="Optional"
        />
      </label>
      <label>
        Purchase price (IQD) *
        <input
          name="cost"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={product ? (product.costCents / 100).toFixed(2) : ""}
        />
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          What you pay the supplier for this product.
        </span>
      </label>
      <label>
        Sale price — store / POS (IQD) *
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""}
        />
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          Price charged to customers in the store (POS).
        </span>
      </label>
      <label>
        Sale price — delivery apps (IQD)
        <input
          name="appPrice"
          type="number"
          step="0.01"
          min="0"
          required={showOnApps}
          defaultValue={
            product && product.appPriceCents > 0
              ? (product.appPriceCents / 100).toFixed(2)
              : product
                ? (product.priceCents / 100).toFixed(2)
                : ""
          }
          placeholder="e.g. Talabat price"
        />
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          Price on Talabat and other delivery apps. Required if the product is active on apps.
        </span>
      </label>
      <label>
        Supplier
        <select name="supplierId" defaultValue={product?.supplierId ?? ""}>
          <option value="">— None —</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select name="categoryId" defaultValue={product?.categoryId ?? ""}>
          <option value="">— None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {!product && (
        <label>
          Initial stock
          <input name="stockQty" type="number" min="0" defaultValue="0" />
        </label>
      )}

      <fieldset className="permissions-fieldset">
        <legend>Limited quantity discount (POS)</legend>
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", color: "var(--muted)" }}>
          Sell the last N pieces at a promo price. When those units are sold, the product returns to
          the normal POS price and the discount ends.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="promoEnabled"
            checked={promoEnabled}
            onChange={(e) => setPromoEnabled(e.target.checked)}
          />
          Enable limited discount
        </label>
        {promoEnabled && (
          <>
            <label>
              Promo price (IQD) *
              <input
                name="discountPrice"
                type="number"
                step="0.01"
                min="0"
                required={promoEnabled}
                defaultValue={
                  product?.discountPriceCents != null
                    ? (product.discountPriceCents / 100).toFixed(2)
                    : ""
                }
              />
            </label>
            <label>
              Quantity left at promo price *
              <input
                name="discountQtyLeft"
                type="number"
                min="1"
                step="1"
                required={promoEnabled}
                defaultValue={
                  product && product.discountQtyLeft > 0 ? product.discountQtyLeft : 50
                }
              />
              <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                Example: 50 = discount applies to the next 50 units sold on POS.
              </span>
            </label>
          </>
        )}
      </fieldset>

      <fieldset className="permissions-fieldset">
        <legend>Where to sell</legend>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="showOnPos"
            defaultChecked={product ? product.showOnPos : true}
          />
          Active on POS (in-store)
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            name="showOnApps"
            checked={showOnApps}
            onChange={(e) => setShowOnApps(e.target.checked)}
          />
          Active on delivery apps (Talabat, etc.)
        </label>
      </fieldset>

      {product && (
        <label className="checkbox-label">
          <input type="checkbox" name="isActive" defaultChecked={product.isActive} />
          Product active (can be stocked / sold anywhere)
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : product ? "Save changes" : "Create product"}
      </button>
    </form>
  );
}
