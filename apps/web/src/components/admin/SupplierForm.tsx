"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplier, updateSupplier } from "@/lib/actions/suppliers";

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  discountPercent: number;
  isActive: boolean;
}

function displayContact(supplier: Supplier) {
  return supplier.contactPerson ?? supplier.phone ?? supplier.email ?? "";
}

export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = supplier
      ? await updateSupplier(supplier.id, formData)
      : await createSupplier(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(supplier ? `/admin/suppliers/${supplier.id}` : "/admin/suppliers");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Supplier name *
        <input name="name" required defaultValue={supplier?.name ?? ""} placeholder="e.g. Fresh Foods Ltd" />
      </label>
      <label>
        Contact *
        <input
          name="contact"
          required
          defaultValue={supplier ? displayContact(supplier) : ""}
          placeholder="e.g. Mike — 555-0100"
        />
      </label>
      <label>
        Invoice discount (%)
        <input
          name="discountPercent"
          type="number"
          min={0}
          max={100}
          step={1}
          required
          defaultValue={supplier?.discountPercent ?? 0}
        />
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          Discount this supplier gives your store on their invoices. Applied automatically when
          recording a delivery.
        </span>
      </label>
      {supplier && (
        <label className="checkbox-label">
          <input type="checkbox" name="isActive" defaultChecked={supplier.isActive} />
          Active
        </label>
      )}
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
      </button>
    </form>
  );
}
