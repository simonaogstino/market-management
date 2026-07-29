import Link from "next/link";
import { requirePageAccess } from "@/lib/admin-session";
import { ExpenseForm } from "@/components/admin/ExpenseForm";

export default async function NewExpensePage() {
  await requirePageAccess("expenses:manage");

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Add expense</h1>
        <Link className="btn btn-secondary" href="/admin/expenses">
          Back to expenses
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <ExpenseForm />
      </div>
    </div>
  );
}
