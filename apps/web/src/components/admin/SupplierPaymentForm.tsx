"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupplierPayment } from "@/lib/actions/suppliers";
import { formatMoney } from "@/lib/cash";

interface CashTerminal {
  id: string;
  name: string;
  cashInBoxCents: number;
}

export function SupplierPaymentForm({
  supplierId,
  cashTerminals = [],
}: {
  supplierId: string;
  cashTerminals?: CashTerminal[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState("PAYMENT");
  const [payFromCash, setPayFromCash] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await createSupplierPayment(supplierId, formData);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push(`/admin/suppliers/${supplierId}`);
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Type *
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          required
        >
          <option value="PAYMENT">Payment to supplier</option>
          <option value="CREDIT">Credit from supplier</option>
        </select>
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
          Payment reduces what you owe. Credit is a supplier credit note or discount.
        </span>
      </label>
      <label>
        Amount (IQD) *
        <input name="amount" type="number" min="0.01" step="0.01" required />
      </label>
      <label>
        Date *
        <input name="paidAt" type="date" required defaultValue={today} />
      </label>
      {type === "PAYMENT" && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              name="payFromCash"
              checked={payFromCash}
              onChange={(e) => setPayFromCash(e.target.checked)}
            />
            Pay from cash box (reduces terminal cash)
          </label>
          {payFromCash && (
            <label>
              Cash box (terminal) *
              <select name="cashTerminalId" required={payFromCash} defaultValue={cashTerminals[0]?.id}>
                {cashTerminals.length === 0 ? (
                  <option value="">No open cash drawers</option>
                ) : (
                  cashTerminals.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} — {formatMoney(t.cashInBoxCents)} available
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
        </>
      )}
      <label>
        Reference
        <input name="reference" placeholder="e.g. Check #1234, bank transfer ref" />
      </label>
      <label>
        Note
        <textarea name="note" rows={2} />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Record"}
      </button>
    </form>
  );
}
