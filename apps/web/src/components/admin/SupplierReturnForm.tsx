"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplierReturn } from "@/lib/actions/suppliers";

interface ProductOption {
  id: string;
  sku: string;
  name: string;
  costCents: number;
  stockQty: number;
}

interface LineRow {
  productId: string;
  quantity: string;
  unitCost: string;
}

export function SupplierReturnForm({
  supplierId,
  products,
}: {
  supplierId: string;
  products: ProductOption[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<LineRow[]>([
    {
      productId: products[0]?.id ?? "",
      quantity: "1",
      unitCost: products[0] ? (products[0].costCents / 100).toFixed(2) : "0",
    },
  ]);

  const today = new Date().toISOString().slice(0, 10);

  function addLine() {
    const p = products[0];
    setLines((prev) => [
      ...prev,
      {
        productId: p?.id ?? "",
        quantity: "1",
        unitCost: p ? (p.costCents / 100).toFixed(2) : "0",
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function updateLine(index: number, field: keyof LineRow, value: string) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        if (field === "productId") {
          const product = products.find((p) => p.id === value);
          return {
            productId: value,
            quantity: line.quantity,
            unitCost: product ? (product.costCents / 100).toFixed(2) : line.unitCost,
          };
        }
        return { ...line, [field]: value };
      }),
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    formData.set("lineCount", String(lines.length));
    lines.forEach((line, i) => {
      formData.set(`line_${i}_productId`, line.productId);
      formData.set(`line_${i}_quantity`, line.quantity);
      formData.set(`line_${i}_unitCost`, line.unitCost);
    });

    const result = await createSupplierReturn(supplierId, formData);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/admin/suppliers/${supplierId}`);
    router.refresh();
  }

  if (products.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No products available to return.</p>;
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Return reference
        <input name="referenceNumber" placeholder="e.g. RTN-2024-001" />
      </label>
      <label>
        Return date *
        <input name="returnedAt" type="date" required defaultValue={today} />
      </label>

      <fieldset className="permissions-fieldset">
        <legend>Products returned to supplier</legend>
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
          Uses purchase price. Deducts from supplier balance/credit and reduces stock.
        </p>
        {lines.map((line, index) => {
          const product = products.find((p) => p.id === line.productId);
          return (
            <div key={index} className="delivery-line-row">
              <label>
                Product
                <select
                  value={line.productId}
                  onChange={(e) => updateLine(index, "productId", e.target.value)}
                  required
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name} (stock: {p.stockQty})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Qty
                <input
                  type="number"
                  min="1"
                  max={product?.stockQty ?? undefined}
                  value={line.quantity}
                  onChange={(e) => updateLine(index, "quantity", e.target.value)}
                  required
                />
              </label>
              <label>
                Unit cost ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={line.unitCost}
                  onChange={(e) => updateLine(index, "unitCost", e.target.value)}
                  required
                />
              </label>
              {lines.length > 1 && (
                <button type="button" className="btn btn-secondary" onClick={() => removeLine(index)}>
                  Remove
                </button>
              )}
            </div>
          );
        })}
        <button type="button" className="btn btn-secondary" onClick={addLine}>
          Add line
        </button>
      </fieldset>

      <label>
        Note
        <textarea name="note" rows={2} />
      </label>

      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Record return"}
      </button>
    </form>
  );
}
