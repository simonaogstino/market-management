"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { openCashSessionAdmin } from "@/lib/actions/cash";

export function OpenCashSessionForm({
  terminals,
}: {
  terminals: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await openCashSessionAdmin(new FormData(e.currentTarget));
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.sessionId) {
      router.push(`/admin/cash/${result.sessionId}`);
      router.refresh();
    }
  }

  if (terminals.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No active POS terminals.</p>;
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Terminal *
        <select name="terminalId" required defaultValue={terminals[0]?.id}>
          {terminals.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Opening float (IQD) *
        <input name="openingAmount" type="number" min={0} step={1} required defaultValue={0} />
      </label>
      <label>
        Note
        <input name="note" placeholder="Optional" />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Opening…" : "Open cash session"}
      </button>
    </form>
  );
}
