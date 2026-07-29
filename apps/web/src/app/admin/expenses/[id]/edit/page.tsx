import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageAccess } from "@/lib/admin-session";
import { ExpenseForm } from "@/components/admin/ExpenseForm";

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("expenses:manage");
  const { id } = await params;

  const expense = await prisma.expense.findFirst({
    where: { id, storeId: session.user.storeId },
  });
  if (!expense) notFound();

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>Edit expense</h1>
        <Link className="btn btn-secondary" href="/admin/expenses">
          Back to expenses
        </Link>
      </div>
      <div className="card" style={{ maxWidth: 560 }}>
        <ExpenseForm expense={expense} />
      </div>
    </div>
  );
}
