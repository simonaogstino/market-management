"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createExpense, updateExpense } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/expenses";
import { formatMoney } from "@/lib/cash";

interface Expense {
  id: string;
  category: string;
  amountCents: number;
  incurredAt: Date | string;
  description: string | null;
  payee: string | null;
  reference: string | null;
  note: string | null;
}

interface CashTerminal {
  id: string;
  name: string;
  cashInBoxCents: number;
}

function toDateInputValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function ExpenseForm({
  expense,
  cashTerminals = [],
}: {
  expense?: Expense;
  cashTerminals?: CashTerminal[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [payFromCash, setPayFromCash] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = expense
      ? await updateExpense(expense.id, formData)
      : await createExpense(formData);

    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/admin/expenses");
    router.refresh();
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <label>
        Category *
        <select name="category" required defaultValue={expense?.category ?? "OTHER"}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Amount (IQD) *
        <input
          name="amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          defaultValue={expense ? (expense.amountCents / 100).toFixed(2) : ""}
        />
      </label>
      <label>
        Date *
        <input
          name="incurredAt"
          type="date"
          required
          defaultValue={expense ? toDateInputValue(expense.incurredAt) : today}
        />
      </label>
      <label>
        Description
        <input
          name="description"
          defaultValue={expense?.description ?? ""}
          placeholder="e.g. March electricity bill"
        />
      </label>
      <label>
        Paid to
        <input
          name="payee"
          defaultValue={expense?.payee ?? ""}
          placeholder="e.g. Electric company, staff name"
        />
      </label>
      <label>
        Reference
        <input
          name="reference"
          defaultValue={expense?.reference ?? ""}
          placeholder="e.g. Receipt #, invoice #, check #"
        />
      </label>
      {!expense && (
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
        Note
        <textarea name="note" rows={2} defaultValue={expense?.note ?? ""} />
      </label>
      {error && <p className="form-error">{error}</p>}
      <button className="btn" type="submit" disabled={loading}>
        {loading ? "Saving…" : expense ? "Save changes" : "Add expense"}
      </button>
    </form>
  );
}
