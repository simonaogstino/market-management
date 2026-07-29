import type { ExpenseCategory } from "@market/database";

export { formatMoney, parseDollarsToCents } from "@/lib/suppliers";

export const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: "PURCHASING", label: "Purchasing" },
  { value: "SALARIES", label: "Salaries / wages" },
  { value: "UTILITIES", label: "Utilities" },
  { value: "RENT", label: "Rent" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "MAINTENANCE", label: "Maintenance / repairs" },
  { value: "MARKETING", label: "Marketing" },
  { value: "SUPPLIES", label: "Office / store supplies" },
  { value: "TAXES_FEES", label: "Taxes & fees" },
  { value: "OTHER", label: "Other" },
];

export function expenseCategoryLabel(category: string) {
  return EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

export function isExpenseCategory(value: string): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.some((c) => c.value === value);
}
