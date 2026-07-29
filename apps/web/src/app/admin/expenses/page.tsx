import Link from "next/link";
import type { ExpenseCategory, Prisma } from "@market/database";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { deleteExpenseForm } from "@/lib/actions/expenses";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, formatMoney, isExpenseCategory } from "@/lib/expenses";
import { hasPermission } from "@/lib/permissions";
import { getStoreSettings } from "@/lib/store-settings";
import { AddButton, IconEditLink } from "@/components/admin/AdminIcons";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; from?: string; to?: string }>;
}) {
  const session = await requirePageAccess("expenses:view");
  const canManage = hasPermission(session.user.role, session.user.permissions, "expenses:manage");
  const params = await searchParams;
  const settings = await getStoreSettings(session.user.storeId);

  const category = params.category?.trim() || "";
  const from = params.from?.trim() || "";
  const to = params.to?.trim() || "";

  const where: Prisma.ExpenseWhereInput = {
    storeId: session.user.storeId,
  };

  if (category && isExpenseCategory(category)) {
    where.category = category as ExpenseCategory;
  }
  if (from || to) {
    where.incurredAt = {};
    if (from) where.incurredAt.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.incurredAt.lte = end;
    }
  }

  const expenses = await prisma.expense.findMany({
    where,
    orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
    include: { recordedBy: { select: { name: true } } },
  });

  const totalCents = expenses.reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>Expenses</h1>
          <p style={{ color: "var(--muted)", margin: "0.25rem 0 0" }}>
            Track purchasing, salaries, utilities, and other store costs.
          </p>
        </div>
        {canManage && <AddButton href="/admin/expenses/new" label="Add expense" />}
      </div>

      <form className="filters-form card" method="get">
        <label>
          Category
          <select name="category" defaultValue={category}>
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label>
          To
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="btn btn-secondary" type="submit">
          Filter
        </button>
        {(category || from || to) && (
          <Link className="btn btn-secondary" href="/admin/expenses">
            Clear
          </Link>
        )}
      </form>

      <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.25rem" }}>
        <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Total (filtered)</div>
        <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
          {formatMoney(totalCents, settings.currency)}
        </div>
        <div style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          {expenses.length} expense{expenses.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Description</th>
              <th>Paid to</th>
              <th align="right">Amount</th>
              <th>Reference</th>
              <th>Recorded by</th>
              {canManage && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 8 : 7} style={{ color: "var(--muted)" }}>
                  No expenses yet.{" "}
                  {canManage && <Link href="/admin/expenses/new">Add the first expense</Link>}
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.incurredAt.toLocaleDateString()}</td>
                  <td>{expenseCategoryLabel(expense.category)}</td>
                  <td>{expense.description ?? "—"}</td>
                  <td>{expense.payee ?? "—"}</td>
                  <td align="right">{formatMoney(expense.amountCents, settings.currency)}</td>
                  <td>{expense.reference ?? "—"}</td>
                  <td>{expense.recordedBy?.name ?? "—"}</td>
                  {canManage && (
                    <td>
                      <div className="table-actions">
                        <IconEditLink href={`/admin/expenses/${expense.id}/edit`} />
                        <form action={deleteExpenseForm}>
                          <input type="hidden" name="expenseId" value={expense.id} />
                          <button
                            type="submit"
                            className="link-button"
                            style={{ color: "var(--danger)" }}
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
