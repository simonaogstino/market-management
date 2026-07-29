"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addCashMovementAdmin, closeCashSessionAdmin } from "@/lib/actions/cash";
import { formatMoney } from "@/lib/cash";

export function CashSessionActions({
  sessionId,
  expectedCents,
}: {
  sessionId: string;
  expectedCents: number;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function onMove(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const result = await addCashMovementAdmin(sessionId, new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setMessage("Movement recorded.");
    (e.target as HTMLFormElement).reset();
    router.refresh();
  }

  async function onClose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    const result = await closeCashSessionAdmin(sessionId, new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/cash");
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      {error && <p className="form-error">{error}</p>}
      {message && <p style={{ color: "var(--success, #16a34a)" }}>{message}</p>}

      <form className="admin-form card" onSubmit={onMove}>
        <h3 style={{ marginTop: 0 }}>Pay in / pay out</h3>
        <label>
          Type
          <select name="type" defaultValue="PAY_IN">
            <option value="PAY_IN">Pay in</option>
            <option value="PAY_OUT">Pay out</option>
          </select>
        </label>
        <label>
          Amount (IQD)
          <input name="amount" type="number" min={1} step={1} required />
        </label>
        <label>
          Reason
          <input name="reason" placeholder="e.g. Safe drop" />
        </label>
        <button className="btn btn-secondary" type="submit" disabled={loading}>
          Record
        </button>
      </form>

      <form className="admin-form card" onSubmit={onClose}>
        <h3 style={{ marginTop: 0 }}>Close &amp; reconcile</h3>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Expected in drawer now: <strong>{formatMoney(expectedCents)}</strong>
        </p>
        <label>
          Counted cash (IQD)
          <input name="countedAmount" type="number" min={0} step={1} required />
        </label>
        <label>
          Note
          <input name="note" />
        </label>
        <button className="btn" type="submit" disabled={loading}>
          Close session
        </button>
      </form>
    </div>
  );
}
