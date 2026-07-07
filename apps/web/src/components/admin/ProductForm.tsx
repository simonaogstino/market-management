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
  supplierId: string | null;
  categoryId: string | null;
  stockQty: number;
  isActive: boolean;
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
        Purchase price ($) *
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
        Sale price ($) *
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""}
        />
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          Price charged to customers at POS.
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
      {product && (
        <label className="checkbox-label">
          <input type="checkbox" name="isActive" defaultChecked={product.isActive} />
          Active (visible on POS)
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : product ? "Save changes" : "Create product"}
      </button>
    </form>
  );
}
