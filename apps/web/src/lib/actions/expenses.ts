"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/admin-session";
import { isExpenseCategory, parseDollarsToCents } from "@/lib/expenses";

function expensePaths(expenseId?: string) {
  revalidatePath("/admin/expenses");
  if (expenseId) revalidatePath(`/admin/expenses/${expenseId}/edit`);
}

export async function createExpense(formData: FormData) {
  const session = await requirePermission("expenses:manage");
  const category = String(formData.get("category") ?? "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const incurredAtRaw = String(formData.get("incurredAt") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const payee = String(formData.get("payee") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!isExpenseCategory(category)) {
    return { error: "Select a valid expense category." };
  }
  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const incurredAt = incurredAtRaw ? new Date(incurredAtRaw) : new Date();
  if (Number.isNaN(incurredAt.getTime())) {
    return { error: "Expense date is invalid." };
  }

  const expense = await prisma.expense.create({
    data: {
      storeId: session.user.storeId,
      category,
      amountCents,
      incurredAt,
      description,
      payee,
      reference,
      note,
      recordedById: session.user.id,
    },
  });

  expensePaths(expense.id);
  return { success: true, expenseId: expense.id };
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const session = await requirePermission("expenses:manage");
  const category = String(formData.get("category") ?? "").trim();
  const amountCents = parseDollarsToCents(String(formData.get("amount") ?? ""));
  const incurredAtRaw = String(formData.get("incurredAt") ?? "");
  const description = String(formData.get("description") ?? "").trim() || null;
  const payee = String(formData.get("payee") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!isExpenseCategory(category)) {
    return { error: "Select a valid expense category." };
  }
  if (amountCents === null || amountCents <= 0) {
    return { error: "Amount must be greater than zero." };
  }

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, storeId: session.user.storeId },
  });
  if (!existing) return { error: "Expense not found." };

  const incurredAt = incurredAtRaw ? new Date(incurredAtRaw) : existing.incurredAt;
  if (Number.isNaN(incurredAt.getTime())) {
    return { error: "Expense date is invalid." };
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      category,
      amountCents,
      incurredAt,
      description,
      payee,
      reference,
      note,
    },
  });

  expensePaths(expenseId);
  return { success: true };
}

export async function deleteExpenseForm(formData: FormData) {
  const session = await requirePermission("expenses:manage");
  const expenseId = String(formData.get("expenseId") ?? "");

  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, storeId: session.user.storeId },
  });
  if (!existing) return;

  await prisma.expense.delete({ where: { id: expenseId } });
  expensePaths();
}
