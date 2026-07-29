import Link from "next/link";
import { requirePageAccess } from "@/lib/admin-session";
import { listOpenCashTerminals } from "@/lib/cash-server";
import { ExpenseForm } from "@/components/admin/ExpenseForm";

export default async function NewExpensePage() {
  const session = await requirePageAccess("expenses:manage");
  const cashTerminals = await listOpenCashTerminals(session.user.storeId);

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Add expense</h1>
        <Link className="btn btn-secondary" href="/admin/expenses">
          Back to expenses
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <ExpenseForm cashTerminals={cashTerminals} />
      </div>
    </div>
  );
}
