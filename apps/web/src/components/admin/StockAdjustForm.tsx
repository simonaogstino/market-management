"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustStock } from "@/lib/actions/admin";

interface Product {
  id: string;
  name: string;
  sku: string;
  stockQty: number;
}

export function StockAdjustForm({ products }: { products: Product[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<"RECEIVE" | "ADJUSTMENT">("RECEIVE");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await adjustStock(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
    e.currentTarget.reset();
    setType("RECEIVE");
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Product *
        <select name="productId" required defaultValue="">
          <option value="" disabled>
            Select product…
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku}) — stock: {p.stockQty}
            </option>
          ))}
        </select>
      </label>
      <label>
        Type *
        <select
          name="type"
          required
          value={type}
          onChange={(e) => setType(e.target.value as "RECEIVE" | "ADJUSTMENT")}
        >
          <option value="RECEIVE">Receive stock (add)</option>
          <option value="ADJUSTMENT">Manual adjustment (+ or −)</option>
        </select>
      </label>
      <label>
        Quantity *
        <input
          name="quantity"
          type="number"
          required
          placeholder={type === "RECEIVE" ? "e.g. 50" : "e.g. -2 for loss"}
          min={type === "RECEIVE" ? 1 : undefined}
        />
        {type === "ADJUSTMENT" && (
          <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
            Use negative numbers to reduce stock.
          </span>
        )}
      </label>
      <label>
        Note
        <input name="note" placeholder="e.g. Delivery from supplier, damaged items" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading || products.length === 0}>
        {loading ? "Saving…" : "Apply adjustment"}
      </button>
    </form>
  );
}
